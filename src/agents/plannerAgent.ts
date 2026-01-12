/**
 * Planner Agent
 * Product Manager role - breaks down requirements into detailed plans
 * Uses Claude Opus 4.5 for high-level reasoning
 */

import { BaseAgent } from './baseAgent.js';
import { 
  AgentResponse, 
  ProjectPlan, 
  Task, 
  FileTreeNode,
  ArchitectureSpec,
  TechStack
} from '../types/index.js';
import { AGENT_CONFIGS } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface PlannerOutput {
  projectName: string;
  description: string;
  scaffoldCommand?: string | null;
  postScaffoldCommands?: string[];
  techStack: TechStack;
  architecture: ArchitectureSpec;
  fileTree: FileTreeNode[];
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    dependencies: string[];
  }>;
  designDecisions: Array<{
    decision: string;
    rationale: string;
  }>;
}

export class PlannerAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.planner);
  }

  /**
   * Main task processor for the Planner
   */
  async processTask(task: string, context?: Record<string, unknown>): Promise<AgentResponse> {
    const contextStr = context ? JSON.stringify(context, null, 2) : undefined;
    return await this.chat(task, contextStr);
  }

  /**
   * Create a detailed project plan from a user prompt
   */
  async createProjectPlan(userPrompt: string): Promise<ProjectPlan | null> {
    logger.section('Planning Phase');
    logger.info('Analyzing requirements and creating project plan...', 'planner');

    const planningPrompt = `
You are creating a MINIMAL project plan for the following user request:

"${userPrompt}"

IMPORTANT RULES:
1. If using a framework (Next.js, React, Vue, Angular, etc.), ALWAYS specify scaffoldCommand
2. Only create tasks for CUSTOM code the user explicitly asked for
3. Maximum 2-5 tasks for most requests - keep it minimal
4. Do NOT add features that weren't requested (auth, logging, Docker, etc.)

Consider:
1. Does this need a framework scaffold command? (npx create-next-app, create-react-app, etc.)
2. What SPECIFIC custom code did the user ask for?
3. Keep tasks focused and minimal

Example - If user asks "Next.js app with mysql2 connection":
- scaffoldCommand: "npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias '@/*'"
- postScaffoldCommands: ["npm install mysql2"]
- tasks: Only 2-3 tasks:
  1. Create lib/db.ts with mysql2 connection pool
  2. Create sample API route using the connection
  3. Update README with connection instructions

Respond with JSON following your output format. Include scaffoldCommand if a framework is needed.
`;

    const response = await this.chat(planningPrompt);
    
    if (!response.success) {
      logger.error('Failed to create project plan', 'planner');
      return null;
    }

    try {
      const planData = this.parseJsonResponse<PlannerOutput>(response.content);
      
      if (!planData) {
        logger.error('Could not parse planner response as JSON', 'planner');
        return null;
      }

      const plan: ProjectPlan = {
        projectName: planData.projectName || 'untitled-project',
        description: planData.description || userPrompt,
        scaffoldCommand: planData.scaffoldCommand || null,
        postScaffoldCommands: planData.postScaffoldCommands || [],
        architecture: planData.architecture || {
          overview: '',
          components: [],
          dataFlow: ''
        },
        tasks: this.convertTasks(planData.tasks || []),
        fileTree: planData.fileTree || [],
        techStack: planData.techStack || {},
        createdAt: new Date(),
        status: 'planning'
      };

      logger.success(`Project plan created: ${plan.projectName}`);
      logger.info(`  - ${plan.tasks.length} tasks identified`, 'planner');
      logger.info(`  - Tech Stack: ${this.summarizeTechStack(plan.techStack)}`, 'planner');

      return plan;
    } catch (error) {
      logger.error(`Error parsing plan: ${error}`, 'planner');
      return null;
    }
  }

  /**
   * Simplify a task that has failed multiple times
   */
  async simplifyTask(task: Task, errorHistory: string[]): Promise<Task> {
    logger.escalation(`Task "${task.title}" failed multiple times. Simplifying...`);

    const simplifyPrompt = `
A task has failed ${task.retryCount} times. The Coder Agent could not complete it.

Task Details:
- ID: ${task.id}
- Title: ${task.title}
- Description: ${task.description}

Error History:
${errorHistory.map((e, i) => `Attempt ${i + 1}: ${e}`).join('\n')}

Please analyze what's going wrong and provide a SIMPLIFIED version of this task.
Break it into smaller, more achievable steps if necessary.

Respond with JSON:
{
  "simplifiedTask": {
    "id": "${task.id}",
    "title": "simplified title",
    "description": "clearer, more specific description with exact steps",
    "dependencies": []
  },
  "additionalTasks": [
    { "id": "new-id", "title": "sub-task", "description": "description", "dependencies": ["${task.id}"] }
  ],
  "notes": "Explanation of simplification"
}
`;

    const response = await this.chat(simplifyPrompt);
    
    if (!response.success) {
      // Return original task if simplification fails
      return task;
    }

    try {
      const result = this.parseJsonResponse<{
        simplifiedTask: { id: string; title: string; description: string; dependencies: string[] };
        notes: string;
      }>(response.content);

      if (result?.simplifiedTask) {
        logger.info(`Task simplified: ${result.notes}`, 'planner');
        
        return {
          ...task,
          title: result.simplifiedTask.title,
          description: result.simplifiedTask.description,
          dependencies: result.simplifiedTask.dependencies,
          status: 'pending',
          retryCount: 0
        };
      }
    } catch {
      // Return original task if parsing fails
    }

    return task;
  }

  /**
   * Review and refine the plan after Coder feedback
   */
  async refinePlan(
    currentPlan: ProjectPlan, 
    feedback: string
  ): Promise<ProjectPlan> {
    const refinePrompt = `
Current project plan needs refinement based on implementation feedback.

Current Plan:
${JSON.stringify(currentPlan, null, 2)}

Feedback from Implementation:
${feedback}

Please analyze the feedback and provide an updated plan that addresses the issues.
Only modify what's necessary - keep successful parts intact.

Respond with the complete updated plan in JSON format.
`;

    const response = await this.chat(refinePrompt);
    
    if (!response.success) {
      return currentPlan;
    }

    try {
      const updatedPlan = this.parseJsonResponse<PlannerOutput>(response.content);
      
      if (updatedPlan) {
        return {
          ...currentPlan,
          architecture: updatedPlan.architecture || currentPlan.architecture,
          tasks: this.convertTasks(updatedPlan.tasks || []),
          fileTree: updatedPlan.fileTree || currentPlan.fileTree
        };
      }
    } catch {
      // Return current plan if refinement fails
    }

    return currentPlan;
  }

  /**
   * Generate the design document content
   */
  generateDesignDocument(plan: ProjectPlan): string {
    const doc = `# ${plan.projectName} - Design Document

## Overview
${plan.description}

## Last Updated
${new Date().toISOString()}

---

## Architecture

### Overview
${plan.architecture.overview}

### Components
${plan.architecture.components.map(c => `
#### ${c.name} (${c.type})
${c.description}

Files:
${c.files.map(f => `- ${f}`).join('\n')}

Dependencies: ${c.dependencies.join(', ') || 'None'}
`).join('\n')}

### Data Flow
${plan.architecture.dataFlow}

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | ${plan.techStack.frontend?.join(', ') || 'N/A'} |
| Backend | ${plan.techStack.backend?.join(', ') || 'N/A'} |
| Database | ${plan.techStack.database?.join(', ') || 'N/A'} |
| DevOps | ${plan.techStack.devOps?.join(', ') || 'N/A'} |

---

## File Structure

\`\`\`
${this.formatFileTree(plan.fileTree)}
\`\`\`

---

## Tasks

| ID | Title | Status | Dependencies |
|----|-------|--------|--------------|
${plan.tasks.map(t => `| ${t.id} | ${t.title} | ${t.status} | ${t.dependencies.join(', ') || 'None'} |`).join('\n')}

---

## Design Decisions

> This section is updated by agents as they make decisions.

---

## Variables & Conventions

> Key variable names and conventions for cross-agent reference.

---

*Generated by Agent Orchestra - Self-Agent Dev Swarm*
`;

    return doc;
  }

  /**
   * Parse JSON from potentially markdown-wrapped response
   */
  private parseJsonResponse<T>(content: string): T | null {
    try {
      // Try direct parse first
      return JSON.parse(content) as T;
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch {
          // Fall through to null return
        }
      }
      
      // Try to find JSON object in the content
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]) as T;
        } catch {
          // Fall through to null return
        }
      }
    }
    return null;
  }

  /**
   * Convert raw task data to Task objects
   */
  private convertTasks(rawTasks: Array<{ id: string; title: string; description: string; dependencies: string[] }>): Task[] {
    return rawTasks.map((t, index) => ({
      id: t.id || `task-${index + 1}`,
      title: t.title,
      description: t.description,
      status: 'pending' as const,
      assignedTo: 'coder' as const,
      dependencies: t.dependencies || [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date()
    }));
  }

  /**
   * Format file tree for display
   */
  private formatFileTree(tree: FileTreeNode[], indent: string = ''): string {
    let result = '';
    
    for (const node of tree) {
      if (node.type === 'directory') {
        result += `${indent}${node.name}/\n`;
        if (node.children) {
          result += this.formatFileTree(node.children, indent + '  ');
        }
      } else {
        result += `${indent}${node.name}\n`;
      }
    }
    
    return result;
  }

  /**
   * Summarize tech stack for logging
   */
  private summarizeTechStack(stack: TechStack): string {
    const parts: string[] = [];
    if (stack.frontend?.length) parts.push(stack.frontend[0]);
    if (stack.backend?.length) parts.push(stack.backend[0]);
    if (stack.database?.length) parts.push(stack.database[0]);
    return parts.join(' + ') || 'Not specified';
  }
}
