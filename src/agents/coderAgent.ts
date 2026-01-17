/**
 * Coder Agent
 * Lead Developer role - implements code based on plans
 * Uses Claude Sonnet 4.5 for fast, accurate code generation
 */

import { BaseAgent } from './baseAgent.js';
import { 
  AgentResponse, 
  Task, 
  FileOperation,
  ProjectPlan
} from '../types/index.js';
import { AGENT_CONFIGS } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { FileSystemManager } from '../utils/fileSystem.js';

interface CoderOutput {
  operations: Array<{
    type: 'create' | 'update';
    path: string;
    content: string;
    language?: string;
  }>;
  terminalCommands?: string[];
  notes?: string;
}

interface BugFix {
  file: string;
  issue: string;
  fix: string;
  oldCode?: string;
  newCode?: string;
}

export class CoderAgent extends BaseAgent {
  private fileManager: FileSystemManager | null = null;

  constructor() {
    super(AGENT_CONFIGS.coder);
  }

  /**
   * Set the file system manager
   */
  setFileManager(manager: FileSystemManager): void {
    this.fileManager = manager;
  }

  /**
   * Main task processor for the Coder
   */
  async processTask(task: string, context?: Record<string, unknown>): Promise<AgentResponse> {
    const contextStr = context ? JSON.stringify(context, null, 2) : undefined;
    return await this.chat(task, contextStr);
  }

  /**
   * Implement a specific task from the plan
   */
  async implementTask(
    task: Task, 
    plan: ProjectPlan, 
    designDoc: string
  ): Promise<{ success: boolean; operations: FileOperation[]; commands: string[]; error?: string }> {
    logger.info(`Implementing task: ${task.title}`, 'coder');

    const implementPrompt = `
You are implementing the following task:

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

Project Context:
- Project Name: ${plan.projectName}
- Description: ${plan.description}
- Tech Stack: ${JSON.stringify(plan.techStack)}

Design Document (Source of Truth):
${designDoc}

File Structure Reference:
${JSON.stringify(plan.fileTree, null, 2)}

IMPORTANT:
1. Write COMPLETE, PRODUCTION-READY code - no placeholders
2. Include ALL necessary imports and dependencies
3. Follow the exact file paths from the design document
4. Add proper error handling
5. Make sure the code integrates with other components
# Tone and style
You should be concise, direct, and to the point. When you run a non-trivial bash command, you should explain what the command does and why you are running it, to make sure the user understands what you are doing (this is especially important when you are running a command that will make changes to the user's system).
Remember that your output will be displayed on a command line interface. Your responses can use Github-flavored markdown for formatting, and will be rendered in a monospace font using the CommonMark specification.
Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools  or code comments as means to communicate with the user during the session.
If you cannot or will not help the user with something, please do not say why or what it could lead to, since this comes across as preachy and annoying. Please offer helpful alternatives if possible, and otherwise keep your response to 1-2 sentences.
IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy. Only address the specific query or task at hand, avoiding tangential information unless absolutely critical for completing the request. If you can answer in 1-3 sentences or a short paragraph, please do.

# IMPORTANT: Keep your responses short, since they will be displayed on a command line interface. You MUST answer concisely with fewer than 4 lines (not including tool use or code generation), unless user asks for detail. Answer the user's question directly, without elaboration, explanation, or details. One word answers are best. Avoid introductions, conclusions, and explanations. You MUST avoid text before/after your response, such as "The answer is <answer>.", "Here is the content of the file..." or "Based on the information provided, the answer is..." or "Here is what I will do next...". Here are some examples to demonstrate appropriate verbosity:
# IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, 
     and accuracy. Only address the specific query or task at hand, avoiding tangential information unless 
     absolutely critical for completing the request. If you can answer in 1-3 sentences or a short paragraph, 
     please do.
Respond with JSON containing all file operations needed for this task.
`;

    const response = await this.chat(implementPrompt);
    
    if (!response.success) {
      return {
        success: false,
        operations: [],
        commands: [],
        error: response.error
      };
    }

    try {
      const output = this.parseJsonResponse<CoderOutput>(response.content);
      
      if (!output?.operations) {
        return {
          success: false,
          operations: [],
          commands: [],
          error: 'Invalid response format - no operations found'
        };
      }

      const operations: FileOperation[] = output.operations.map(op => ({
        type: op.type,
        path: op.path,
        content: op.content,
        reason: `Task ${task.id}: ${task.title}`
      }));

      // Execute file operations if file manager is available
      if (this.fileManager) {
        const result = await this.fileManager.executeOperations(operations);
        if (!result.success) {
          logger.warn(`Some file operations failed: ${result.errors.join(', ')}`, 'coder');
        }
      }

      logger.success(`Task ${task.id} implemented: ${operations.length} files written`);

      return {
        success: true,
        operations,
        commands: output.terminalCommands || []
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        operations: [],
        commands: [],
        error: errorMsg
      };
    }
  }

  /**
   * Fix bugs identified by the Tester
   */
  async fixBugs(
    bugs: BugFix[], 
    designDoc: string
  ): Promise<{ success: boolean; operations: FileOperation[]; error?: string }> {
    logger.info(`Fixing ${bugs.length} bugs...`, 'coder');

    const fixPrompt = `
You need to fix the following bugs identified by the QA/Security team:

${bugs.map((bug, i) => `
Bug ${i + 1}:
- File: ${bug.file}
- Issue: ${bug.issue}
- Suggested Fix: ${bug.fix}
${bug.oldCode ? `- Problematic Code:\n\`\`\`\n${bug.oldCode}\n\`\`\`` : ''}
`).join('\n')}

Design Document (for context):
${designDoc}

IMPORTANT:
1. Fix each bug completely
2. Make sure fixes don't break other functionality
3. Add any missing error handling or validation
4. Return the complete fixed file content, not just patches

Respond with JSON containing file operations for the fixes.
`;

    const response = await this.chat(fixPrompt);
    
    if (!response.success) {
      return {
        success: false,
        operations: [],
        error: response.error
      };
    }

    try {
      const output = this.parseJsonResponse<CoderOutput>(response.content);
      
      if (!output?.operations) {
        return {
          success: false,
          operations: [],
          error: 'Invalid response format'
        };
      }

      const operations: FileOperation[] = output.operations.map(op => ({
        type: 'update' as const,
        path: op.path,
        content: op.content,
        reason: 'Bug fix'
      }));

      // Execute fixes if file manager is available
      if (this.fileManager) {
        await this.fileManager.executeOperations(operations);
      }

      logger.success(`Fixed ${operations.length} files`);

      return {
        success: true,
        operations
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        operations: [],
        error: errorMsg
      };
    }
  }

  /**
   * Generate initial project scaffolding
   */
  async generateScaffolding(plan: ProjectPlan): Promise<{ success: boolean; operations: FileOperation[] }> {
    logger.info('Generating project scaffolding...', 'coder');

    const scaffoldPrompt = `
Generate the initial project scaffolding for:

Project: ${plan.projectName}
Description: ${plan.description}
Tech Stack: ${JSON.stringify(plan.techStack)}

File Structure to Create:
${JSON.stringify(plan.fileTree, null, 2)}

Generate:
1. package.json (or equivalent for the tech stack)
2. Configuration files (tsconfig, .env.example, etc.)
3. Entry point files with basic structure
4. README.md with setup instructions

For each file, provide COMPLETE content - no placeholders.
`;

    const response = await this.chat(scaffoldPrompt);
    
    if (!response.success) {
      return { success: false, operations: [] };
    }

    try {
      const output = this.parseJsonResponse<CoderOutput>(response.content);
      
      const operations: FileOperation[] = (output?.operations || []).map(op => ({
        type: 'create' as const,
        path: op.path,
        content: op.content
      }));

      if (this.fileManager) {
        await this.fileManager.executeOperations(operations);
      }

      logger.success(`Scaffolding created: ${operations.length} files`);
      return { success: true, operations };
    } catch {
      return { success: false, operations: [] };
    }
  }

  /**
   * Read current file content for context
   */
  async getFileContent(filePath: string): Promise<string | null> {
    if (!this.fileManager) return null;
    
    try {
      return await this.fileManager.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Execute terminal commands (npm install, etc.)
   */
  async executeCommands(commands: string[]): Promise<{ success: boolean; outputs: string[] }> {
    if (!this.fileManager) {
      return { success: false, outputs: ['No file manager available'] };
    }

    const outputs: string[] = [];
    let allSuccess = true;

    for (const command of commands) {
      logger.info(`Executing: ${command}`, 'coder');
      
      try {
        const result = await this.fileManager.executeCommand(command);
        outputs.push(`${command}:\n${result.stdout || result.stderr}`);
        
        if (result.code !== 0) {
          allSuccess = false;
          logger.warn(`Command failed: ${command}`, 'coder');
        }
      } catch (error) {
        allSuccess = false;
        outputs.push(`${command}: Error - ${error}`);
      }
    }

    return { success: allSuccess, outputs };
  }

  /**
   * Parse JSON from potentially markdown-wrapped response
   */
  private parseJsonResponse<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch {
          // Continue to next method
        }
      }
      
      // Try to find JSON object
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]) as T;
        } catch {
          // Fall through
        }
      }
    }
    return null;
  }
}
