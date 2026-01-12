#!/usr/bin/env node
/**
 * Ahura CLI - Self-Agent Dev Swarm
 * Inspired by Claude Code CLI - Transparent, context-aware code generation
 * 
 * Modes:
 * - LITE: Quick tasks, single agent (Coder only)
 * - FULL: Enterprise projects with Planner → Coder → Tester → Reviewer
 */

import { config as dotenvConfig } from 'dotenv';
import * as readline from 'readline';
import chalk from 'chalk';
import { CoderAgent } from './agents/coderAgent.js';
import { PlannerAgent } from './agents/plannerAgent.js';
import { TesterAgent } from './agents/testerAgent.js';
import { ReviewerAgent } from './agents/reviewerAgent.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';

// Load .env from multiple locations (in order of priority):
// 1. System environment variables (already loaded)
// 2. Current directory .env
// 3. Home directory .env (~/.env or ~/.ahurasense/.env)
// 4. Package directory .env (fallback)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const homeDir = os.homedir();

// Load from current directory first
dotenvConfig(); 

// Load from home directory ~/.env
dotenvConfig({ path: path.join(homeDir, '.env') });

// Load from ~/.ahurasense/.env (dedicated config folder)
const ahuraConfigDir = path.join(homeDir, '.ahurasense');
if (fs.existsSync(ahuraConfigDir)) {
  dotenvConfig({ path: path.join(ahuraConfigDir, '.env') });
}

// Fallback: package directory (for development)
dotenvConfig({ path: path.join(packageRoot, '.env') });

// ============ MODE TYPES ============

type OperationMode = 'lite' | 'full';

interface ModeConfig {
  name: string;
  description: string;
  agents: string[];
  icon: string;
}

const MODES: Record<OperationMode, ModeConfig> = {
  lite: {
    name: 'Lite Mode',
    description: 'Quick tasks • Single agent • Fast execution',
    agents: ['Coder'],
    icon: '⚡'
  },
  full: {
    name: 'Full Mode', 
    description: 'Enterprise projects • All agents • Plan → Code → Test → Review',
    agents: ['Planner', 'Coder', 'Tester', 'Reviewer'],
    icon: '🏗️'
  }
};

// ============ STATE MANAGEMENT ============

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokensUsed?: number;
}

interface SessionStats {
  totalTokens: number;
  totalMessages: number;
  filesCreated: string[];
  startTime: Date;
}

// Global state
let currentProject: string = process.cwd();
let isProcessing = false;
let shouldAbort = false;
let currentMode: OperationMode = 'lite'; // Default to lite mode

// Conversation memory - KEY FOR FOLLOW-UPS
let conversationHistory: ConversationMessage[] = [];
let sessionStats: SessionStats = {
  totalTokens: 0,
  totalMessages: 0,
  filesCreated: [],
  startTime: new Date()
};

// Agents
let coderAgent: CoderAgent | null = null;
let plannerAgent: PlannerAgent | null = null;
let testerAgent: TesterAgent | null = null;
let reviewerAgent: ReviewerAgent | null = null;

// ============ UI HELPERS ============

const icons = {
  thinking: '🤔',
  planning: '📋',
  coding: '💻', 
  writing: '✍️',
  success: '✅',
  error: '❌',
  file: '📄',
  folder: '📁',
  done: '✨',
  arrow: '→',
  bullet: '•',
  chat: '💬',
  history: '📜',
  cost: '💰',
  compact: '📦',
  context: '🔗',
  lite: '⚡',
  full: '🏗️',
  testing: '🧪',
  review: '🔍',
  planner: '📐'
};

// ============ AGENT TAGGING ============

type AgentTag = 'coder' | 'tester' | 'planner' | 'reviewer';

interface ParsedInput {
  agent: AgentTag;
  message: string;
}

function parseAgentTag(input: string): ParsedInput {
  const tagMatch = input.match(/^@(coder|tester|planner|reviewer)\s+(.+)$/i);
  
  if (tagMatch) {
    return {
      agent: tagMatch[1].toLowerCase() as AgentTag,
      message: tagMatch[2].trim()
    };
  }
  
  // Default to coder if no tag
  return {
    agent: 'coder',
    message: input
  };
}

// Chat with a specific agent
async function chatWithAgent(agent: AgentTag, message: string): Promise<void> {
  isProcessing = true;
  
  // Initialize agents as needed
  if (!coderAgent) coderAgent = new CoderAgent();
  if (!testerAgent) testerAgent = new TesterAgent();
  if (!plannerAgent) plannerAgent = new PlannerAgent();
  if (!reviewerAgent) reviewerAgent = new ReviewerAgent();
  
  // Add user message to history
  addToHistory('user', `@${agent}: ${message}`);
  
  console.log('');
  
  const agentIcons: Record<AgentTag, string> = {
    coder: '💻',
    tester: '🧪',
    planner: '📐',
    reviewer: '🔍'
  };
  
  const agentNames: Record<AgentTag, string> = {
    coder: 'Coder',
    tester: 'Tester',
    planner: 'Planner',
    reviewer: 'Reviewer'
  };
  
  printStep(agentIcons[agent], chalk.cyan(`Asking ${agentNames[agent]} Agent...`));
  
  let response = '';
  
  try {
    // Build context from conversation history
    const conversationContext = buildConversationContext();
    const hasContext = conversationHistory.length > 1;
    
    // Build agent-specific context
    let agentContext = '';
    
    // For tester/reviewer, include current project files
    if (agent === 'tester' || agent === 'reviewer') {
      const projectFiles = getProjectFilesContext();
      if (projectFiles) {
        agentContext = `\n\nCurrent Project Files:\n${projectFiles}`;
      }
    }
    
    const enhancedMessage = `${conversationContext}${agentContext}

Current Request: ${message}

Working Directory: ${currentProject}

${hasContext ? 'Consider the conversation context above. ' : ''}Respond naturally and helpfully. Provide a clear, detailed response.`;
    
    // Select the appropriate agent and use streaming
    // Note: For direct chat, we use coderAgent's model (Claude) for all agents
    // to avoid requiring OpenAI key. The specialized agents are still used in Full mode.
    let result;
    
    // Build agent-specific prompt based on role
    let rolePrompt = '';
    switch (agent) {
      case 'tester':
        rolePrompt = `You are a QA Tester Agent. Analyze the code/request from a testing perspective.
Focus on: bugs, edge cases, security issues, test coverage, and quality assurance.
Be thorough and critical - your job is to find problems!\n\n`;
        break;
      case 'planner':
        rolePrompt = `You are a Planner Agent (Software Architect). Analyze the request from an architecture perspective.
Focus on: project structure, component breakdown, tech stack recommendations, and implementation strategy.\n\n`;
        break;
      case 'reviewer':
        rolePrompt = `You are a Code Reviewer Agent. Review the code/request from a senior engineer's perspective.
Focus on: code quality, best practices, potential improvements, and maintainability.\n\n`;
        break;
      case 'coder':
      default:
        rolePrompt = ''; // Coder uses default prompt
        break;
    }
    
    const finalMessage = rolePrompt + enhancedMessage;
    
    printProgress(`${agentNames[agent]} thinking...`);
    result = await coderAgent.chatStream(
      finalMessage,
      (chunk: string, done: boolean) => {
        response += chunk;
        if (!done) {
          printProgress(`${agentNames[agent]} responding... (${response.length} chars)`);
        }
      }
    );
    
    clearLine();
    
    // Get response content
    const responseContent = response || result?.content || 'No response received';
    
    // Format and display the response
    console.log('');
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log('');
    console.log(chalk.white(formatAgentResponse(responseContent)));
    console.log('');
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log('');
    
    // Add to history
    addToHistory('assistant', `[${agentNames[agent]}]: ${responseContent}`, result?.tokensUsed);
    
    // Show token usage
    if (result?.tokensUsed) {
      console.log(chalk.gray(`  ${icons.cost} Tokens: ~${result.tokensUsed}`));
    }
    
  } catch (error) {
    clearLine();
    printStep(icons.error, `Error: ${error}`);
  } finally {
    isProcessing = false;
  }
}

// Get context of current project files
function getProjectFilesContext(): string {
  try {
    const files: string[] = [];
    const maxFiles = 20;
    const maxContentLength = 500;
    
    function scanDir(dir: string, depth = 0) {
      if (depth > 3 || files.length >= maxFiles) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (files.length >= maxFiles) break;
        if (item.startsWith('.') || item === 'node_modules' || item === 'dist') continue;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const relativePath = path.relative(currentProject, fullPath);
        
        if (stat.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          const codeExts = ['.ts', '.js', '.tsx', '.jsx', '.json', '.py', '.go', '.rs', '.java'];
          if (codeExts.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const truncated = content.length > maxContentLength 
                ? content.slice(0, maxContentLength) + '\n... (truncated)' 
                : content;
              files.push(`--- ${relativePath} ---\n${truncated}\n`);
            } catch {}
          }
        }
      }
    }
    
    scanDir(currentProject);
    return files.join('\n');
  } catch {
    return '';
  }
}

// Format agent response for display
function formatAgentResponse(response: string): string {
  // Try to parse JSON responses and format them nicely
  try {
    const parsed = JSON.parse(response);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON, return as-is
    return response;
  }
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function printStep(icon: string, message: string, detail?: string) {
  const timestamp = chalk.gray(new Date().toLocaleTimeString());
  const detailStr = detail ? chalk.gray(` ${detail}`) : '';
  console.log(`  ${icon} ${chalk.white(message)}${detailStr}`);
}

function printProgress(message: string) {
  clearLine();
  process.stdout.write(chalk.cyan(`  ⟳ ${message}`));
}

function printThinking(text: string) {
  // Show truncated thinking in gray
  const maxLen = 80;
  const display = text.length > maxLen ? text.slice(-maxLen) + '...' : text;
  clearLine();
  process.stdout.write(chalk.gray(`  ${icons.thinking} ${display}`));
}

// Build conversation context for follow-ups
function buildConversationContext(): string {
  if (conversationHistory.length === 0) return '';
  
  // Include last N messages for context (keep it manageable)
  const recentHistory = conversationHistory.slice(-10);
  
  let context = '\n--- Previous Conversation ---\n';
  for (const msg of recentHistory) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    // Truncate very long messages
    const content = msg.content.length > 500 
      ? msg.content.slice(0, 500) + '...' 
      : msg.content;
    context += `${role}: ${content}\n\n`;
  }
  context += '--- End Previous Conversation ---\n';
  
  return context;
}

// Add message to conversation history
function addToHistory(role: 'user' | 'assistant', content: string, tokensUsed?: number) {
  conversationHistory.push({
    role,
    content,
    timestamp: new Date(),
    tokensUsed
  });
  sessionStats.totalMessages++;
  if (tokensUsed) {
    sessionStats.totalTokens += tokensUsed;
  }
}

// ============ FILE OPERATIONS ============

interface FileOp {
  path: string;
  content: string;
}

// Streaming-aware file extraction - finds complete file objects as they stream
function extractStreamingFiles(content: string): FileOp[] {
  const operations: FileOp[] = [];
  
  // Use regex to find complete file operation objects within the operations array
  // Match pattern: {"type": "create", "path": "...", "content": "..."}
  // The content ends when we see "}," or "}]" or "}\n" followed by next object/closing
  
  // Find the operations array start
  const opsStart = content.indexOf('"operations"');
  if (opsStart === -1) return operations;
  
  const opsContent = content.slice(opsStart);
  
  // Match individual file objects - look for complete objects
  // Pattern: object starts with {, has path and content fields, ends with }
  const fileObjRegex = /\{\s*"type"\s*:\s*"create"\s*,\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  
  let match;
  while ((match = fileObjRegex.exec(opsContent)) !== null) {
    const filePath = match[1];
    let fileContent = match[2];
    
    // Unescape the content
    try {
      fileContent = JSON.parse(`"${fileContent}"`);
    } catch {
      // If parse fails, do basic unescaping
      fileContent = fileContent
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    
    if (filePath && fileContent && fileContent.length > 5) {
      operations.push({ path: filePath, content: fileContent });
    }
  }
  
  return operations;
}

function extractFileOperations(content: string): FileOp[] {
  const operations: FileOp[] = [];
  
  // Method 1: Parse full JSON response
  try {
    const parsed = JSON.parse(content);
    if (parsed.operations && Array.isArray(parsed.operations)) {
      return parsed.operations.map((op: any) => ({
        path: op.path,
        content: op.content
      })).filter((op: FileOp) => op.path && op.content);
    }
  } catch {}

  // Method 2: Find JSON in code blocks
  const jsonMatch = content.match(/```(?:json)?\s*\n?(\{[\s\S]*?"operations"[\s\S]*?\})\n?```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.operations && Array.isArray(parsed.operations)) {
        return parsed.operations.map((op: any) => ({
          path: op.path,
          content: op.content
        })).filter((op: FileOp) => op.path && op.content);
      }
    } catch {}
  }
  
  // Method 3: Find JSON anywhere in text
  const jsonInText = content.match(/\{[\s\S]*?"operations"\s*:\s*\[[\s\S]*?\]\s*[\s\S]*?\}/);
  if (jsonInText) {
    try {
      const parsed = JSON.parse(jsonInText[0]);
      if (parsed.operations && Array.isArray(parsed.operations)) {
        return parsed.operations.map((op: any) => ({
          path: op.path,
          content: op.content
        })).filter((op: FileOp) => op.path && op.content);
      }
    } catch {}
  }

  return operations;
}

// Generate summary of created files
function generateSummary(files: string[]): void {
  if (files.length === 0) return;
  
  // Group files by directory
  const byDir: Record<string, string[]> = {};
  for (const file of files) {
    const dir = path.dirname(file) || '.';
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(path.basename(file));
  }
  
  console.log('');
  console.log(chalk.cyan.bold('  📊 Summary'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  
  // Show directory structure
  for (const [dir, dirFiles] of Object.entries(byDir)) {
    if (dir === '.') {
      console.log(chalk.white(`  📁 Root`));
    } else {
      console.log(chalk.white(`  📁 ${dir}/`));
    }
    for (const f of dirFiles) {
      const ext = path.extname(f).slice(1);
      const icon = getFileIcon(ext);
      console.log(chalk.gray(`     ${icon} ${f}`));
    }
  }
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
    'json': '📋', 'html': '🌐', 'css': '🎨', 'scss': '🎨',
    'md': '📝', 'py': '🐍', 'go': '🔹', 'rs': '🦀',
    'java': '☕', 'rb': '💎', 'php': '🐘', 'sql': '🗃️',
    'yml': '⚙️', 'yaml': '⚙️', 'env': '🔒', 'sh': '🖥️',
    'dockerfile': '🐳', 'gitignore': '👁️'
  };
  return icons[ext.toLowerCase()] || '📄';
}

// Generate follow-up questions based on what was created
function generateFollowUpQuestions(files: string[]): void {
  const questions: string[] = [];
  
  // Analyze created files to suggest relevant follow-ups
  const hasPackageJson = files.some(f => f.includes('package.json'));
  const hasTests = files.some(f => f.includes('test') || f.includes('spec'));
  const hasRoutes = files.some(f => f.includes('route'));
  const hasModels = files.some(f => f.includes('model'));
  const hasConfig = files.some(f => f.includes('config') || f.includes('.env'));
  const hasReact = files.some(f => f.includes('.jsx') || f.includes('.tsx'));
  const hasApi = files.some(f => f.includes('api') || f.includes('controller'));
  
  if (hasPackageJson && !hasTests) {
    questions.push('Add unit tests for the project');
  }
  if (hasRoutes && !hasModels) {
    questions.push('Add database models and persistence');
  }
  if (hasApi && !hasConfig) {
    questions.push('Add environment configuration');
  }
  if (hasReact) {
    questions.push('Add styling with Tailwind CSS');
    questions.push('Add state management with Redux');
  }
  if (hasPackageJson) {
    questions.push('Add Docker containerization');
    questions.push('Add CI/CD pipeline');
  }
  
  // Always include some general suggestions
  if (questions.length === 0) {
    questions.push('Add documentation');
    questions.push('Add error handling');
    questions.push('Extend with more features');
  }
  
  // Show max 3 suggestions
  const selected = questions.slice(0, 3);
  
  console.log('');
  console.log(chalk.cyan.bold('  💡 What would you like to do next?'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  selected.forEach((q, i) => {
    console.log(chalk.white(`  ${i + 1}. ${q}`));
  });
  console.log(chalk.gray(`\n  Just type your next request or pick a number (1-${selected.length})\n`));
}

async function writeFiles(operations: FileOp[]): Promise<string[]> {
  const created: string[] = [];
  
  for (const op of operations) {
    try {
      const fullPath = path.join(currentProject, op.path);
      const dir = path.dirname(fullPath);
      
      // Create directory if needed
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        printStep(icons.folder, `Created folder`, chalk.blue(path.relative(currentProject, dir)));
      }
      
      // Write file
      fs.writeFileSync(fullPath, op.content, 'utf-8');
      printStep(icons.file, `Created`, chalk.green(op.path));
      created.push(op.path);
    } catch (error) {
      printStep(icons.error, `Failed to create ${op.path}`, chalk.red(String(error)));
    }
  }
  
  return created;
}

// ============ FRAMEWORK DETECTION ============

interface FrameworkScaffold {
  name: string;
  keywords: string[];
  command: string;
  postCommands?: string[];
}

const FRAMEWORK_SCAFFOLDS: FrameworkScaffold[] = [
  {
    name: 'Next.js',
    keywords: ['next', 'nextjs', 'next.js', 'next js'],
    command: 'npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --yes',
    postCommands: []
  },
  {
    name: 'React (Vite)',
    keywords: ['react', 'reactjs', 'react.js', 'react app'],
    command: 'npm create vite@latest . -- --template react-ts --yes',
    postCommands: ['npm install']
  },
  {
    name: 'Vue (Vite)',
    keywords: ['vue', 'vuejs', 'vue.js', 'vue app'],
    command: 'npm create vite@latest . -- --template vue-ts --yes',
    postCommands: ['npm install']
  },
  {
    name: 'Express',
    keywords: ['express', 'expressjs', 'express.js', 'express api', 'express server'],
    command: '', // No scaffold, just npm init
    postCommands: ['npm init -y', 'npm install express']
  },
  {
    name: 'NestJS',
    keywords: ['nest', 'nestjs', 'nest.js'],
    command: 'npx --yes @nestjs/cli new . --skip-git --package-manager npm',
    postCommands: []
  },
  {
    name: 'Angular',
    keywords: ['angular', 'angularjs', 'angular app'],
    command: 'npx --yes @angular/cli new temp-app --skip-git --style=scss --routing=true && mv temp-app/* . && rm -rf temp-app',
    postCommands: []
  }
];

function detectFramework(prompt: string): FrameworkScaffold | null {
  const lowerPrompt = prompt.toLowerCase();
  
  for (const framework of FRAMEWORK_SCAFFOLDS) {
    for (const keyword of framework.keywords) {
      if (lowerPrompt.includes(keyword)) {
        return framework;
      }
    }
  }
  return null;
}

// ============ MAIN BUILD FUNCTION (LITE MODE) ============

async function buildProjectLite(prompt: string): Promise<void> {
  if (!coderAgent) {
    coderAgent = new CoderAgent();
  }

  isProcessing = true;
  shouldAbort = false;

  console.log('');
  console.log(chalk.cyan('━'.repeat(60)));
  console.log(chalk.gray(`  ${icons.lite} Lite Mode - Quick Generation`));
  printStep(icons.thinking, 'Understanding your request...');
  
  // Add user message to history
  addToHistory('user', prompt);
  
  try {
    // Detect if a framework scaffold is needed
    const framework = detectFramework(prompt);
    let scaffoldUsed = false;
    
    if (framework && framework.command) {
      // Check if directory is empty or has only hidden files
      const files = fs.readdirSync(currentProject).filter(f => !f.startsWith('.'));
      
      if (files.length === 0) {
        console.log('');
        printStep('🏗️', chalk.cyan(`Detected ${framework.name} project`));
        printStep('🖥️', chalk.gray('Running scaffold command...'));
        console.log(chalk.gray(`     $ ${framework.command}`));
        
        const scaffoldSuccess = await runTerminalCommand(framework.command, `Setting up ${framework.name}...`);
        
        if (scaffoldSuccess) {
          scaffoldUsed = true;
          
          // Run post-scaffold commands
          if (framework.postCommands && framework.postCommands.length > 0) {
            for (const cmd of framework.postCommands) {
              await runTerminalCommand(cmd, 'Installing dependencies...');
            }
          }
          
          printStep(icons.success, chalk.green(`${framework.name} scaffolded successfully!`));
          console.log('');
        }
      }
    }
    
    // Build context from conversation history
    const conversationContext = buildConversationContext();
    const hasContext = conversationHistory.length > 1; // More than just current message
    
    if (hasContext) {
      printStep(icons.context, chalk.gray('Using conversation context...'));
    }
    
    // Build scaffold context for Coder
    const scaffoldContext = scaffoldUsed 
      ? `\n\nIMPORTANT: A ${framework!.name} project has already been scaffolded in this directory.
DO NOT create files that already exist (package.json, tsconfig.json, etc.)
ONLY create the ADDITIONAL custom files the user requested on top of the scaffold.
For example: database utilities, custom API routes, custom components, etc.
`
      : '';
    
    // Enhanced prompt for structured output WITH CONVERSATION CONTEXT
    const enhancedPrompt = `${conversationContext}

Current Request: ${prompt}

Working Directory: ${currentProject}
${scaffoldContext}
${hasContext ? `IMPORTANT: This is a follow-up request. Consider the previous conversation context above.
The user may be referring to:
- Files or code mentioned earlier
- Modifications to previously created files
- Continuation of a previous task
- Clarifications or additions to earlier requests

Maintain consistency with what was discussed/created before.
` : ''}

You must respond with ONLY a JSON object in this exact format:
{
  "thinking": "Brief explanation of what you'll create (reference previous context if relevant)",
  "plan": ["Step 1", "Step 2", ...],
  "operations": [
    {"type": "create", "path": "filename.ext", "content": "complete file content"}
  ]
}

Rules:
- Keep it simple and focused
- Generate complete, working code
- No placeholders or TODOs
- Include all necessary files${scaffoldUsed ? '\n- Do NOT recreate scaffolded files - only add custom code' : ''}
- If modifying existing files, include the full updated content`;

    let fullResponse = '';
    let lastUpdate = Date.now();
    let thinkingShown = false;
    let planShown = false;
    let filesWritten = new Set<string>(); // Track files already written
    let writingStarted = false;
    
    const result = await coderAgent.chatStream(
      enhancedPrompt,
      (chunk: string, done: boolean) => {
        fullResponse += chunk;
        
        if (shouldAbort) return;
        
        // Update display periodically
        if (Date.now() - lastUpdate > 100 || done) {
          lastUpdate = Date.now();
          
          // Try to show thinking as soon as we get it
          if (!thinkingShown) {
            const thinkMatch = fullResponse.match(/"thinking"\s*:\s*"([^"]+)"/);
            if (thinkMatch) {
              clearLine();
              console.log('');
              printStep(icons.planning, 'Planning:', chalk.gray(thinkMatch[1]));
              thinkingShown = true;
            } else {
              printProgress(`Analyzing request... (${fullResponse.length} bytes)`);
            }
          }
          
          // Show plan steps as they come
          if (!planShown && thinkingShown) {
            const planMatch = fullResponse.match(/"plan"\s*:\s*\[([\s\S]*?)\]/);
            if (planMatch) {
              try {
                const planStr = '[' + planMatch[1] + ']';
                const plan = JSON.parse(planStr);
                if (Array.isArray(plan) && plan.length > 0) {
                  clearLine();
                  console.log('');
                  printStep(icons.bullet, 'Steps:');
                  plan.forEach((step: string, i: number) => {
                    console.log(chalk.gray(`     ${i + 1}. ${step}`));
                  });
                  planShown = true;
                }
              } catch {}
            }
          }
          
          // Stream file creation as they complete in the response
          if (planShown) {
            // Use streaming-aware extraction to get files one-by-one
            const ops = extractStreamingFiles(fullResponse);
            for (const op of ops) {
              if (!filesWritten.has(op.path) && op.content && op.content.length > 10) {
                // Show writing header once
                if (!writingStarted) {
                  clearLine();
                  console.log('');
                  printStep(icons.writing, 'Creating files...');
                  writingStarted = true;
                }
                
                // Write file immediately
                try {
                  const fullPath = path.join(currentProject, op.path);
                  const dir = path.dirname(fullPath);
                  const dirRelative = path.relative(currentProject, dir);
                  
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    if (dirRelative) {
                      printStep(icons.folder, `Created folder`, chalk.blue(dirRelative));
                    }
                  }
                  
                  fs.writeFileSync(fullPath, op.content, 'utf-8');
                  printStep(icons.file, `Created`, chalk.green(op.path));
                  filesWritten.add(op.path);
                  sessionStats.filesCreated.push(op.path);
                } catch (err) {
                  // Will retry at the end if failed
                }
              }
            }
            
            // Show progress for files still generating
            const pendingMatch = fullResponse.match(/"path"\s*:\s*"([^"]+)"/g);
            if (pendingMatch && pendingMatch.length > filesWritten.size) {
              const pending = pendingMatch.length - filesWritten.size;
              if (pending > 0) {
                printProgress(`Generating ${pending} more file(s)...`);
              }
            }
          }
        }
        
        if (done) {
          clearLine();
        }
      }
    );

    if (!result.success) {
      throw new Error(result.error || 'Generation failed');
    }

    // Add assistant response to history
    addToHistory('assistant', result.content, result.tokensUsed);

    // Handle any remaining files that weren't written during streaming
    const operations = extractFileOperations(result.content);
    let remainingFiles = 0;
    
    for (const op of operations) {
      if (!filesWritten.has(op.path) && op.content) {
        if (remainingFiles === 0 && !writingStarted) {
          console.log('');
          printStep(icons.writing, 'Creating files...');
        }
        
        try {
          const fullPath = path.join(currentProject, op.path);
          const dir = path.dirname(fullPath);
          
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printStep(icons.folder, `Created folder`, chalk.blue(path.relative(currentProject, dir)));
          }
          
          fs.writeFileSync(fullPath, op.content, 'utf-8');
          printStep(icons.file, `Created`, chalk.green(op.path));
          filesWritten.add(op.path);
          sessionStats.filesCreated.push(op.path);
          remainingFiles++;
        } catch (error) {
          printStep(icons.error, `Failed to create ${op.path}`, chalk.red(String(error)));
        }
      }
    }
    
    if (filesWritten.size === 0) {
      console.log(chalk.yellow('  ⚠ Could not extract file operations from response'));
      console.log(chalk.gray('  Saving raw response to output.txt'));
      
      const outPath = path.join(currentProject, 'output.txt');
      fs.writeFileSync(outPath, result.content, 'utf-8');
      printStep(icons.file, 'Created', 'output.txt');
    } else {
      console.log('');
      console.log(chalk.cyan('━'.repeat(60)));
      printStep(icons.done, chalk.bold.green(`Done! Created ${filesWritten.size} file(s)`));
      
      // Show token usage
      if (result.tokensUsed) {
        console.log(chalk.gray(`  ${icons.cost} Tokens used: ~${result.tokensUsed}`));
      }
      
      // Show summary of what was created
      const createdArray = Array.from(filesWritten);
      generateSummary(createdArray);
      
      // Show follow-up questions
      generateFollowUpQuestions(createdArray);
    }
    
  } catch (error) {
    clearLine();
    console.log('');
    printStep(icons.error, chalk.red(`Error: ${error}`));
  } finally {
    isProcessing = false;
  }
}

// ============ FULL MODE BUILD FUNCTION ============

import { execSync, spawn } from 'child_process';

// ============ TERMINAL COMMAND EXECUTION ============

async function runTerminalCommand(command: string, description: string): Promise<boolean> {
  return new Promise((resolve) => {
    printStep('🖥️', chalk.cyan(description));
    console.log(chalk.gray(`     $ ${command}`));
    
    try {
      // Use execSync for synchronous execution with live output
      execSync(command, {
        cwd: currentProject,
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      printStep(icons.success, chalk.green('Command completed'));
      resolve(true);
    } catch (error) {
      printStep(icons.error, chalk.red(`Command failed: ${error}`));
      resolve(false);
    }
  });
}

// ============ FULL MODE BUILD FUNCTION ============

async function buildProjectFull(prompt: string): Promise<void> {
  isProcessing = true;
  shouldAbort = false;
  
  // Initialize all agents
  if (!plannerAgent) plannerAgent = new PlannerAgent();
  if (!coderAgent) coderAgent = new CoderAgent();
  if (!testerAgent) testerAgent = new TesterAgent();
  if (!reviewerAgent) reviewerAgent = new ReviewerAgent();
  
  console.log('');
  console.log(chalk.cyan('━'.repeat(60)));
  console.log(chalk.magenta(`  ${icons.full} Full Mode - Enterprise Project Pipeline`));
  console.log(chalk.gray(`  Pipeline: Planner → Coder → Tester → Reviewer`));
  console.log(chalk.cyan('━'.repeat(60)));
  
  addToHistory('user', prompt);
  const filesWrittenFull = new Set<string>();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: PLANNING
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.yellow.bold(`  ┌─ PHASE 1: PLANNING`));
    printStep(icons.planner, 'Planner Agent analyzing requirements...');
    
    const planResult = await plannerAgent.createProjectPlan(prompt);
    
    if (!planResult) {
      throw new Error('Planner failed to create project plan');
    }
    
    printStep(icons.success, chalk.green('Plan created!'), chalk.gray(`${planResult.tasks.length} tasks identified`));
    console.log(chalk.gray(`     Project: ${planResult.projectName}`));
    
    // Show scaffold command if present
    if (planResult.scaffoldCommand) {
      console.log(chalk.cyan(`     Scaffold: ${planResult.scaffoldCommand}`));
    }
    
    console.log(chalk.gray(`     Tasks:`));
    planResult.tasks.forEach((task, i) => {
      console.log(chalk.gray(`       ${i + 1}. ${task.title}`));
    });
    
    // Generate design doc
    const designDoc = generateDesignDoc(planResult);
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 1.5: SCAFFOLD (if needed)
    // ═══════════════════════════════════════════════════════════
    if (planResult.scaffoldCommand) {
      console.log('');
      console.log(chalk.yellow.bold(`  ├─ SCAFFOLDING`));
      
      const scaffoldSuccess = await runTerminalCommand(
        planResult.scaffoldCommand,
        'Running scaffold command...'
      );
      
      if (!scaffoldSuccess) {
        console.log(chalk.yellow('     ⚠ Scaffold failed, will create files manually'));
      }
      
      // Run post-scaffold commands (like npm install mysql2)
      if (planResult.postScaffoldCommands && planResult.postScaffoldCommands.length > 0) {
        for (const cmd of planResult.postScaffoldCommands) {
          await runTerminalCommand(cmd, 'Installing dependencies...');
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 2: CODING (only custom files)
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.yellow.bold(`  ├─ PHASE 2: CODING`));
    
    if (planResult.tasks.length === 0) {
      printStep(icons.success, chalk.green('No custom code needed!'), chalk.gray('Scaffold is complete'));
    } else {
      printStep(icons.coding, 'Coder Agent implementing custom code...');
      printStep(icons.writing, 'Creating files...');
      
      let taskCount = 0;
      
      for (const task of planResult.tasks) {
        if (shouldAbort) break;
        
        taskCount++;
        printProgress(`Task ${taskCount}/${planResult.tasks.length}: ${task.title}`);
        
        const taskResult = await coderAgent.implementTask(task, planResult, designDoc);
        
        if (taskResult.success && taskResult.operations) {
          // Write files immediately as each task completes (streaming)
          for (const op of taskResult.operations) {
            if (op.path && op.content && !filesWrittenFull.has(op.path)) {
              try {
                const fullPath = path.join(currentProject, op.path);
                const dir = path.dirname(fullPath);
                const dirRelative = path.relative(currentProject, dir);
                
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true });
                  if (dirRelative) {
                    clearLine();
                    printStep(icons.folder, `Created folder`, chalk.blue(dirRelative));
                  }
                }
                
                fs.writeFileSync(fullPath, op.content, 'utf-8');
                clearLine();
                printStep(icons.file, `Created`, chalk.green(op.path));
                filesWrittenFull.add(op.path);
                sessionStats.filesCreated.push(op.path);
              } catch (err) {
                clearLine();
                printStep(icons.error, `Failed to create ${op.path}`);
              }
            }
          }
        }
      }
      
      clearLine();
      printStep(icons.success, chalk.green('Code generated!'), chalk.gray(`${filesWrittenFull.size} custom files`));
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 3: TESTING
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.yellow.bold(`  ├─ PHASE 3: TESTING`));
    printStep(icons.testing, 'Tester Agent reviewing code...');
    
    // Gather all code for testing
    const codeForReview = new Map<string, string>();
    for (const filePath of filesWrittenFull) {
      try {
        const fullPath = path.join(currentProject, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        codeForReview.set(filePath, content);
      } catch {}
    }
    
    const testResult = await testerAgent.runTests(codeForReview, designDoc);
    
    if (!testResult.passed) {
      printStep(icons.error, chalk.yellow('Issues found!'), chalk.gray(`${testResult.bugs.length} bugs, ${testResult.securityIssues.length} security issues`));
      
      // Show critical issues
      const criticalBugs = testResult.bugs.filter(b => b.severity === 'critical' || b.severity === 'high');
      if (criticalBugs.length > 0) {
        console.log(chalk.red(`     Critical issues:`));
        criticalBugs.slice(0, 3).forEach(bug => {
          console.log(chalk.red(`       • ${bug.file}: ${bug.description}`));
        });
      }
    } else {
      printStep(icons.success, chalk.green('Tests passed!'), chalk.gray('No critical issues'));
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 4: REVIEW
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.yellow.bold(`  └─ PHASE 4: REVIEW`));
    printStep(icons.review, 'Reviewer Agent final check...');
    
    const reviewResult = await reviewerAgent.reviewProject(
      planResult,
      codeForReview,
      designDoc,
      { passed: testResult.passed, summary: testResult.summary }
    );
    
    if (reviewResult.approved) {
      printStep(icons.success, chalk.green('Project approved!'), chalk.gray(`${reviewResult.completionPercentage}% complete`));
    } else {
      printStep(icons.error, chalk.yellow('Needs attention'), chalk.gray(`${reviewResult.completionPercentage}% complete`));
      if (reviewResult.blockers.length > 0) {
        console.log(chalk.yellow(`     Blockers:`));
        reviewResult.blockers.forEach(b => {
          console.log(chalk.yellow(`       • ${b}`));
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.bold.green(`  ${icons.done} Project Complete!`));
    
    // Token usage summary
    console.log(chalk.gray(`  ${icons.cost} Tokens used: ~${sessionStats.totalTokens}`));
    
    // Show summary of files created
    const createdArray = Array.from(filesWrittenFull);
    if (createdArray.length > 0) {
      generateSummary(createdArray);
    }
    
    // Show scaffold info if used
    if (planResult.scaffoldCommand) {
      console.log('');
      console.log(chalk.cyan.bold('  🏗️ Scaffold Used'));
      console.log(chalk.gray('  ─────────────────────────────────'));
      console.log(chalk.white(`  ${planResult.scaffoldCommand}`));
    }
    
    // Status
    console.log('');
    console.log(chalk.gray(`  Tasks: ${planResult.tasks.length} | Status: ${reviewResult.approved ? chalk.green('✓ Approved') : chalk.yellow('⚠ Needs Review')}`));
    
    // Show follow-up questions
    generateFollowUpQuestions(createdArray);
    
  } catch (error) {
    clearLine();
    console.log('');
    printStep(icons.error, chalk.red(`Error: ${error}`));
    console.log(chalk.gray('  Tip: Try /lite mode for simpler tasks'));
  } finally {
    isProcessing = false;
  }
}

// Helper function to generate design doc from plan
function generateDesignDoc(plan: any): string {
  return `# ${plan.projectName}

## Description
${plan.description}

## Architecture
${plan.architecture?.overview || 'N/A'}

## Tech Stack
${JSON.stringify(plan.techStack, null, 2)}

## File Structure
${JSON.stringify(plan.fileTree, null, 2)}

## Tasks
${plan.tasks.map((t: any, i: number) => `${i + 1}. ${t.title}: ${t.description}`).join('\n')}
`;
}

// Main build dispatcher based on mode
async function buildProject(prompt: string): Promise<void> {
  if (currentMode === 'full') {
    await buildProjectFull(prompt);
  } else {
    await buildProjectLite(prompt);
  }
}

// ============ CHAT FUNCTION (with context) ============

async function chat(message: string): Promise<void> {
  if (!coderAgent) {
    coderAgent = new CoderAgent();
  }

  isProcessing = true;
  
  // Add user message to history
  addToHistory('user', message);
  
  console.log('');
  
  let response = '';
  
  try {
    // Build context from conversation history
    const conversationContext = buildConversationContext();
    const hasContext = conversationHistory.length > 1;
    
    const enhancedMessage = hasContext 
      ? `${conversationContext}\n\nCurrent question: ${message}\n\nIMPORTANT: This is a follow-up. Consider the conversation context above. Answer naturally as a continuation of our conversation.`
      : message;
    
    const result = await coderAgent.chatStream(
      enhancedMessage,
      (chunk: string, done: boolean) => {
        response += chunk;
        if (done) {
          clearLine();
          console.log(chalk.white(response));
          console.log('');
        } else {
          printProgress(`Thinking... (${response.length} chars)`);
        }
      }
    );
    clearLine();
    
    // Add to history
    addToHistory('assistant', response, result.tokensUsed);
    
    // Show token usage
    if (result.tokensUsed) {
      console.log(chalk.gray(`  ${icons.cost} Tokens: ~${result.tokensUsed}`));
    }
  } catch (error) {
    clearLine();
    printStep(icons.error, `Error: ${error}`);
  } finally {
    isProcessing = false;
  }
}

// ============ STATUS, HISTORY & HELP ============

function showStatus(): void {
  const uptime = Math.floor((Date.now() - sessionStats.startTime.getTime()) / 1000);
  const minutes = Math.floor(uptime / 60);
  const seconds = uptime % 60;
  const modeConfig = MODES[currentMode];
  
  console.log('');
  console.log(chalk.bold.white('  📊 Session Status'));
  console.log(chalk.gray('  ' + '─'.repeat(45)));
  console.log(`  ${chalk.gray('Mode:')}          ${modeConfig.icon} ${chalk.white(modeConfig.name)}`);
  console.log(`  ${chalk.gray('Agents:')}        ${chalk.white(modeConfig.agents.join(' → '))}`);
  console.log(`  ${chalk.gray('Directory:')}     ${chalk.white(currentProject)}`);
  console.log(`  ${chalk.gray('Session time:')}  ${chalk.white(`${minutes}m ${seconds}s`)}`);
  console.log(`  ${chalk.gray('Messages:')}      ${chalk.white(sessionStats.totalMessages)}`);
  console.log(`  ${chalk.gray('Total tokens:')} ${chalk.white(`~${sessionStats.totalTokens}`)}`);
  console.log(`  ${chalk.gray('Files created:')} ${chalk.white(sessionStats.filesCreated.length)}`);
  
  try {
    const files = fs.readdirSync(currentProject);
    const fileCount = files.filter(f => !fs.statSync(path.join(currentProject, f)).isDirectory()).length;
    const dirCount = files.filter(f => fs.statSync(path.join(currentProject, f)).isDirectory()).length;
    console.log(`  ${chalk.gray('In directory:')}  ${chalk.white(`${fileCount} files, ${dirCount} folders`)}`);
  } catch {}
  
  console.log('');
}

function showHistory(): void {
  console.log('');
  console.log(chalk.bold.white(`  ${icons.history} Conversation History`));
  console.log(chalk.gray('  ' + '─'.repeat(45)));
  
  if (conversationHistory.length === 0) {
    console.log(chalk.gray('  (no messages yet)'));
  } else {
    conversationHistory.forEach((msg, i) => {
      const role = msg.role === 'user' ? chalk.cyan('You') : chalk.green('AI');
      const preview = msg.content.length > 60 
        ? msg.content.slice(0, 60).replace(/\n/g, ' ') + '...' 
        : msg.content.replace(/\n/g, ' ');
      const time = msg.timestamp.toLocaleTimeString();
      console.log(`  ${chalk.gray(`${i + 1}.`)} ${role} ${chalk.gray(`(${time})`)}: ${preview}`);
    });
  }
  console.log('');
}

function showCost(): void {
  const costPer1kTokens = 0.003; // Approximate for Claude Sonnet
  const estimatedCost = (sessionStats.totalTokens / 1000) * costPer1kTokens;
  
  console.log('');
  console.log(chalk.bold.white(`  ${icons.cost} Token Usage`));
  console.log(chalk.gray('  ' + '─'.repeat(45)));
  console.log(`  ${chalk.gray('Total tokens:')}    ${chalk.white(`~${sessionStats.totalTokens}`)}`);
  console.log(`  ${chalk.gray('Est. cost:')}       ${chalk.white(`~$${estimatedCost.toFixed(4)}`)}`);
  console.log(`  ${chalk.gray('Avg per message:')} ${chalk.white(`~${Math.floor(sessionStats.totalTokens / Math.max(1, sessionStats.totalMessages))}`)}`);
  console.log('');
}

function compactHistory(instructions?: string): void {
  if (conversationHistory.length <= 2) {
    console.log(chalk.yellow('  Not enough history to compact'));
    return;
  }
  
  // Keep first and last 2 messages, summarize the middle
  const kept = [
    ...conversationHistory.slice(0, 1),
    ...conversationHistory.slice(-2)
  ];
  
  const compactedCount = conversationHistory.length - kept.length;
  conversationHistory = kept;
  
  console.log(chalk.green(`  ✓ Compacted ${compactedCount} messages from history`));
  if (instructions) {
    console.log(chalk.gray(`    Focus: ${instructions}`));
  }
}

function showHelp(): void {
  const modeConfig = MODES[currentMode];
  
  console.log(`
${chalk.bold.cyan('  Ahura CLI')} ${chalk.gray('- AI Code Generator')}
${chalk.gray('  ' + '─'.repeat(50))}

${chalk.white('  Current Mode:')} ${modeConfig.icon} ${chalk.bold(modeConfig.name)}
${chalk.gray('  ' + modeConfig.description)}

${chalk.white('  Just describe what you want to create:')}
${chalk.green('    > create a REST API with Express')}
${chalk.green('    > add authentication to the API')}       ${chalk.gray('← follows up!')}
${chalk.green('    > now add rate limiting')}               ${chalk.gray('← continues context')}

${chalk.white('  Agent Tags:')} ${chalk.gray('(chat directly with specific agents)')}
    ${chalk.magenta('@coder')} <msg>       💻 Chat with Coder ${chalk.gray('(default)')}
    ${chalk.magenta('@tester')} <msg>      🧪 Ask Tester ${chalk.gray('(e.g., @tester test /api/users)')}
    ${chalk.magenta('@planner')} <msg>     📐 Ask Planner ${chalk.gray('(e.g., @planner how to structure this?)')}
    ${chalk.magenta('@reviewer')} <msg>    🔍 Ask Reviewer ${chalk.gray('(e.g., @reviewer check my code)')}

${chalk.white('  Mode Commands:')}
    ${chalk.cyan('/lite')}             ${icons.lite} Switch to Lite Mode (quick, coder only)
    ${chalk.cyan('/full')}             ${icons.full} Switch to Full Mode (enterprise pipeline)
    ${chalk.cyan('/mode')}             Show current mode info

${chalk.white('  Session Commands:')}
    ${chalk.cyan('/status')}           Show session stats
    ${chalk.cyan('/history')}          View conversation history
    ${chalk.cyan('/cost')}             Show token usage & cost
    ${chalk.cyan('/compact [focus]')}  Compact conversation memory
    ${chalk.cyan('/clear')}            Clear conversation & screen
    ${chalk.cyan('/reset')}            Reset session completely

${chalk.white('  File Commands:')}
    ${chalk.cyan('/cd <path>')}        Change directory
    ${chalk.cyan('/pwd')}              Show current directory
    ${chalk.cyan('/ls')}               List files
    ${chalk.cyan('/cat <file>')}       View file contents

${chalk.white('  Other:')}
    ${chalk.cyan('/help')}             Show this help
    ${chalk.cyan('/exit')}             Exit Ahura

${chalk.gray('  Working in: ' + currentProject)}
${chalk.gray('  Mode: ' + modeConfig.name + ' | Messages: ' + conversationHistory.length)}
`);
}

// Show mode details
function showMode(): void {
  console.log('');
  console.log(chalk.bold.white('  🔧 Mode Configuration'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  
  for (const [key, config] of Object.entries(MODES)) {
    const isActive = key === currentMode;
    const prefix = isActive ? chalk.green('→') : ' ';
    const name = isActive ? chalk.bold.green(config.name) : chalk.white(config.name);
    
    console.log(`  ${prefix} ${config.icon} ${name}`);
    console.log(chalk.gray(`      ${config.description}`));
    console.log(chalk.gray(`      Agents: ${config.agents.join(' → ')}`));
    console.log('');
  }
  
  console.log(chalk.gray(`  Use /lite or /full to switch modes`));
  console.log('');
}

// Switch mode
function switchMode(mode: OperationMode): void {
  const prevMode = currentMode;
  currentMode = mode;
  const config = MODES[mode];
  
  console.log('');
  console.log(chalk.green(`  ✓ Switched to ${config.icon} ${config.name}`));
  console.log(chalk.gray(`    ${config.description}`));
  console.log(chalk.gray(`    Agents: ${config.agents.join(' → ')}`));
  console.log('');
}

// ============ INPUT PROCESSING ============

async function processInput(input: string): Promise<boolean> {
  const trimmed = input.trim();
  
  if (!trimmed) return true;

  // Handle commands
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    
    switch (command) {
      case 'exit':
      case 'quit':
      case 'q':
        console.log(chalk.gray('\n  Goodbye! 👋\n'));
        return false;

      case 'help':
      case 'h':
      case '?':
        showHelp();
        break;

      case 'status':
        showStatus();
        break;

      case 'history':
        showHistory();
        break;

      case 'cost':
        showCost();
        break;

      case 'compact':
        compactHistory(args || undefined);
        break;

      case 'lite':
        switchMode('lite');
        break;

      case 'full':
        switchMode('full');
        break;

      case 'mode':
        showMode();
        break;

      case 'clear':
        conversationHistory = []; // Clear conversation too
        console.clear();
        showBanner();
        console.log(chalk.gray('  Conversation cleared.\n'));
        break;

      case 'reset':
        conversationHistory = [];
        sessionStats = {
          totalTokens: 0,
          totalMessages: 0,
          filesCreated: [],
          startTime: new Date()
        };
        coderAgent = null;
        console.clear();
        showBanner();
        console.log(chalk.green('  ✓ Session reset completely.\n'));
        break;

      case 'cd':
        const newDir = args || process.env.HOME || '.';
        try {
          const resolved = path.resolve(currentProject, newDir);
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            currentProject = resolved;
            console.log(chalk.green(`  ✓ Changed to: ${currentProject}`));
          } else {
            console.log(chalk.red(`  ✗ Not found: ${resolved}`));
          }
        } catch (e) {
          console.log(chalk.red(`  ✗ Invalid path: ${newDir}`));
        }
        break;

      case 'pwd':
        console.log(chalk.white(`  ${currentProject}`));
        break;

      case 'ls':
        try {
          const items = fs.readdirSync(currentProject);
          if (items.length === 0) {
            console.log(chalk.gray('  (empty directory)'));
          } else {
            items.forEach(item => {
              const fullPath = path.join(currentProject, item);
              const isDir = fs.statSync(fullPath).isDirectory();
              console.log(isDir ? chalk.blue(`  📁 ${item}/`) : chalk.white(`  📄 ${item}`));
            });
          }
        } catch (e) {
          console.log(chalk.red('  ✗ Could not list directory'));
        }
        break;

      case 'cat':
        if (!args) {
          console.log(chalk.yellow('  Usage: /cat <filename>'));
        } else {
          try {
            const content = fs.readFileSync(path.join(currentProject, args), 'utf-8');
            console.log(chalk.gray('\n' + content + '\n'));
          } catch {
            console.log(chalk.red(`  ✗ Could not read: ${args}`));
          }
        }
        break;

      default:
        console.log(chalk.yellow(`  Unknown command: /${command}`));
        console.log(chalk.gray('  Type /help for available commands'));
    }
    
    return true;
  }

  // Check for agent tags (@coder, @tester, @planner, @reviewer)
  const hasAgentTag = trimmed.match(/^@(coder|tester|planner|reviewer)\s+/i);
  
  if (hasAgentTag) {
    const parsed = parseAgentTag(trimmed);
    await chatWithAgent(parsed.agent, parsed.message);
    return true;
  }
  
  // Check if it's a build/create request
  const buildKeywords = ['create', 'make', 'build', 'generate', 'write', 'implement', 'add', 'setup', 'new'];
  const isBuildRequest = buildKeywords.some(kw => trimmed.toLowerCase().startsWith(kw));

  if (isBuildRequest) {
    await buildProject(trimmed);
  } else {
    // Default chat goes to coder
    await chat(trimmed);
  }

  return true;
}

// ============ MAIN ============

function showBanner() {
  const modeConfig = MODES[currentMode];
  
  console.log(chalk.cyan(`
   █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗ 
  ██╔══██╗██║  ██║██║   ██║██╔══██╗██╔══██╗
  ███████║███████║██║   ██║██████╔╝███████║
  ██╔══██║██╔══██║██║   ██║██╔══██╗██╔══██║
  ██║  ██║██║  ██║╚██████╔╝██║  ██║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
`));
  console.log(chalk.gray(`  AI Code Generator • ${modeConfig.icon} ${modeConfig.name} • Type /help\n`));
}

async function main(): Promise<void> {
  showBanner();
  
  const modeConfig = MODES[currentMode];

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.yellow('  ⚠ ANTHROPIC_API_KEY not set'));
    console.log(chalk.gray('  Set it using one of these methods:'));
    console.log(chalk.gray(''));
    console.log(chalk.white('  Option 1: Environment variable'));
    console.log(chalk.cyan('    export ANTHROPIC_API_KEY=your-key-here'));
    console.log(chalk.gray(''));
    console.log(chalk.white('  Option 2: Create ~/.ahurasense/.env'));
    console.log(chalk.cyan(`    mkdir ${path.join(homeDir, '.ahurasense')}`));
    console.log(chalk.cyan(`    echo "ANTHROPIC_API_KEY=your-key" > ${path.join(homeDir, '.ahurasense', '.env')}`));
    console.log(chalk.gray(''));
    console.log(chalk.white('  Option 3: Add to current directory .env'));
    console.log(chalk.cyan('    echo "ANTHROPIC_API_KEY=your-key" > .env'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('  Get your key at: https://console.anthropic.com/\n'));
  }

  // Show mode and directory info
  console.log(chalk.gray(`  📁 Working in: ${currentProject}`));
  console.log(chalk.gray(`  🔧 Mode: ${modeConfig.icon} ${modeConfig.name} (${modeConfig.agents.join(' → ')})`));
  console.log(chalk.gray(`  💡 Use /lite or /full to switch modes\n`));

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    if (isProcessing) {
      shouldAbort = true;
      clearLine();
      console.log(chalk.yellow('\n  Aborting...'));
    } else {
      console.log(chalk.gray('\n  Type /exit to quit'));
      showPrompt();
    }
  });

  const showPrompt = () => {
    const dir = path.basename(currentProject);
    const modeIcon = currentMode === 'full' ? chalk.magenta('🏗️') : chalk.yellow('⚡');
    const contextIndicator = conversationHistory.length > 0 
      ? chalk.green('●') 
      : chalk.gray('○');
    rl.setPrompt(chalk.cyan(`${modeIcon}${contextIndicator} ${dir} ❯ `));
    rl.prompt();
  };

  showPrompt();

  rl.on('line', async (line) => {
    try {
      const continueLoop = await processInput(line);
      if (!continueLoop) {
        rl.close();
        process.exit(0);
      }
    } catch (error) {
      console.log(chalk.red(`  Error: ${error}`));
    }
    showPrompt();
  });

  rl.on('close', () => {
    console.log('');
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
