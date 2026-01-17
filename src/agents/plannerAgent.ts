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
   * Detects if this is a new project or modification of existing project
   * @param userPrompt - The user's request
   * @param projectPath - Path to the current project directory
   * @param onChunk - Callback for streaming output
   * @param isEmptyProject - Whether the project directory is empty/new
   */
  async createProjectPlan(
    userPrompt: string, 
    projectPath?: string, 
    onChunk?: (chunk: string, done: boolean) => void,
    isEmptyProject?: boolean
  ): Promise<ProjectPlan | null> {
    logger.section('Planning Phase');

    // Default streaming callback if not provided
    const streamCallback = onChunk || ((chunk: string, done: boolean) => {
      if (chunk) process.stdout.write(chunk);
    });

    let planningPrompt: string;
    
    if (isEmptyProject) {
      // NEW PROJECT - no scanning needed
      logger.info('Creating plan for new project...', 'planner');
      
      planningPrompt = `
USER REQUEST: "${userPrompt}"
PROJECT DIRECTORY: ${projectPath || process.cwd()}

You are the MASTER ARCHITECT. Create a DETAILED plan for this NEW PROJECT.

═══════════════════════════════════════════════════════════════
ANALYSIS REQUIREMENTS
═══════════════════════════════════════════════════════════════
Think through EVERY feature the user mentioned. For a CRM, that includes:
- Dashboard with analytics
- Contact/Lead management (CRUD)
- Company/Organization tracking
- Deal/Opportunity pipeline
- Activity logging (calls, emails, meetings)
- Task management
- Reports and charts
- User authentication
- Settings page

═══════════════════════════════════════════════════════════════
SCAFFOLDING (creates base structure in CURRENT directory)
═══════════════════════════════════════════════════════════════
IMPORTANT: Use "." to create in current directory. NEVER use "cd dir &&" or "||" operators!
- Next.js: "npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --yes"
- Vite React: "npm create vite@latest . -- --template react-ts"  
- Express API: null (we create package.json manually)

═══════════════════════════════════════════════════════════════
TASKS (5-15 tasks for complete implementation)
═══════════════════════════════════════════════════════════════
Scaffold only creates boilerplate. YOU MUST create tasks for ALL custom code:
- Each page/route component
- Each API endpoint
- Database models/schemas
- Services and utilities
- Authentication setup
- UI components (tables, forms, charts)

CRITICAL: For complex projects like CRM, e-commerce, dashboards - you need 8-15 tasks minimum!

═══════════════════════════════════════════════════════════════
OUTPUT: JSON only (no markdown)
═══════════════════════════════════════════════════════════════
{
  "projectName": "crm-system",
  "description": "I'll create a comprehensive CRM system with: 1) Dashboard showing key metrics, 2) Contacts module with full CRUD and search, 3) Companies management, 4) Deals pipeline with drag-drop, 5) Activity tracking, 6) Authentication with NextAuth. Using Next.js 14 with App Router, TypeScript, Tailwind CSS, and Prisma for database.",
  "scaffoldCommand": "npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --yes",
  "postScaffoldCommands": ["npm install prisma @prisma/client next-auth bcryptjs"],
  "techStack": { 
    "frontend": ["Next.js 14", "TypeScript", "Tailwind CSS", "React Hook Form"], 
    "backend": ["Next.js API Routes", "Prisma ORM"], 
    "database": ["SQLite/PostgreSQL"], 
    "devOps": [] 
  },
  "architecture": { 
    "overview": "Full-stack CRM with Next.js App Router, server components for data fetching, client components for interactivity",
    "components": ["Dashboard", "ContactsTable", "DealsPipeline", "ActivityFeed"],
    "dataFlow": "Client -> Server Actions -> Prisma -> Database" 
  },
  "fileTree": [
    { "name": "page.tsx", "type": "file", "path": "src/app/page.tsx" },
    { "name": "contacts", "type": "folder", "path": "src/app/contacts" }
  ],
  "tasks": [
    { "id": "task-1", "title": "Create prisma/schema.prisma - Database schema", "description": "Define Contact, Company, Deal, Activity, User models with relationships", "dependencies": [] },
    { "id": "task-2", "title": "Create src/app/page.tsx - Dashboard", "description": "Main dashboard with stats cards, recent activities, deals pipeline preview, charts", "dependencies": [] },
    { "id": "task-3", "title": "Create src/app/contacts/page.tsx - Contacts list", "description": "Data table with search, filter, sort, pagination. Columns: name, email, company, status", "dependencies": ["task-1"] },
    { "id": "task-4", "title": "Create src/app/contacts/[id]/page.tsx - Contact detail", "description": "Full contact view with edit form, activity timeline, associated deals", "dependencies": ["task-3"] },
    { "id": "task-5", "title": "Create src/app/api/contacts/route.ts - Contacts API", "description": "GET (list), POST (create) endpoints with validation and error handling", "dependencies": ["task-1"] }
  ],
  "designDecisions": [
    { "decision": "Use Prisma ORM", "rationale": "Type-safe database access, easy migrations, works great with TypeScript" }
  ]
}

REMEMBER: Include 5-15 tasks covering ALL features. Scaffold is just the starting point!
`;
      
      // Use streaming to show real-time progress
      let responseContent = '';
      let lastShownProgress = '';
      
      const response = await this.chatStream(planningPrompt, (chunk: string, done: boolean) => {
        responseContent += chunk;
        
        // Extract meaningful progress from what AI is generating
        if (!done && streamCallback) {
          // Look for patterns in the response to show progress
          const content = responseContent;
          
          // Check what section the AI is currently writing
          let currentProgress = '';
          
          if (content.includes('"tasks"') && !content.includes('"designDecisions"')) {
            // Extract the last task title being written
            const taskMatches = content.match(/"title":\s*"([^"]+)"/g);
            if (taskMatches && taskMatches.length > 0) {
              const lastTask = taskMatches[taskMatches.length - 1];
              const titleMatch = lastTask.match(/"title":\s*"([^"]+)"/);
              if (titleMatch) {
                currentProgress = `Planning: ${titleMatch[1].substring(0, 50)}${titleMatch[1].length > 50 ? '...' : ''}`;
              }
            }
          } else if (content.includes('"architecture"') && !content.includes('"fileTree"')) {
            currentProgress = 'Designing architecture...';
          } else if (content.includes('"fileTree"') && !content.includes('"tasks"')) {
            currentProgress = 'Structuring files...';
          } else if (content.includes('"techStack"') && !content.includes('"architecture"')) {
            currentProgress = 'Selecting tech stack...';
          } else if (content.includes('"scaffoldCommand"') && !content.includes('"techStack"')) {
            currentProgress = 'Configuring scaffold...';
          } else if (content.includes('"description"') && !content.includes('"scaffoldCommand"')) {
            currentProgress = 'Writing description...';
          } else if (content.includes('"projectName"')) {
            currentProgress = 'Naming project...';
          }
          
          // Only update if progress changed
          if (currentProgress && currentProgress !== lastShownProgress) {
            lastShownProgress = currentProgress;
            streamCallback(`__PROGRESS__${currentProgress}`, false);
          }
        }
      });
      
      if (!response.success) {
        logger.error(`Failed to create project plan: ${response.error || 'Unknown error'}`, 'planner');
        console.log('\n  ❌ Planning failed. Please try again.\n');
        return null;
      }
      
      // Debug: log the raw response if parsing fails
      const result = this.parsePlanResponse(responseContent || response.content, userPrompt);
      if (!result) {
        logger.error('Failed to parse plan response. Raw content:', 'planner');
        console.log('\n  ❌ Could not parse plan. AI response may be malformed.\n');
        // Log first 500 chars of response for debugging
        console.log(`  Response preview: ${response.content?.substring(0, 500)}...\n`);
      }
      return result;
      
    } else {
      // EXISTING PROJECT - scan first
      logger.info('Scanning existing project before planning...', 'planner');
      
      planningPrompt = `
USER REQUEST: "${userPrompt}"
WORKING DIRECTORY: ${projectPath || process.cwd()}

You are the MASTER ARCHITECT. Create a DETAILED implementation plan.

═══════════════════════════════════════════════════════════════
STEP 1: THOROUGH PROJECT SCAN
═══════════════════════════════════════════════════════════════
- Use list_directory to see ALL folders
- Use read_file on EVERY relevant file (not just a few)
- Understand the complete architecture before planning

═══════════════════════════════════════════════════════════════
STEP 2: DETAILED PLANNING (be comprehensive!)
═══════════════════════════════════════════════════════════════
Your plan must include:

1. DESCRIPTION - Detailed explanation of:
   • Current architecture you discovered
   • Database schema/tables needed (if applicable)
   • Authentication flow (if applicable)
   • API endpoints to create/modify
   • State management changes
   • Component hierarchy
  • Optimisations and security considerations api security, data validation, performance,vulnerabilities 


2. TASKS (4-10 for  features) - Each must have:
   • Clear file path in title
   • DETAILED description with:
     - What functions/components to create
     - What patterns/approaches to use
     - Integration points with existing code
     - Error handling requirements

3. DESIGN DECISIONS - Why you chose this approach (not necessary when easy tasks)

═══════════════════════════════════════════════════════════════
OUTPUT: JSON only (no markdown)
═══════════════════════════════════════════════════════════════
{
  "projectName": "string",
  "description": "COMPREHENSIVE: Current architecture: [detail]. For [feature], implementation strategy: [detailed]. Database schema: [tables with columns]. Auth flow: [step by step]. API: [endpoints with methods].",
  "scaffoldCommand": null,
  "postScaffoldCommands": ["npm install pkg1 pkg2"],
  "techStack": { "frontend": [], "backend": [], "database": [], "devOps": [] },
  "architecture": { 
    "overview": "Detailed architecture",
    "components": ["Component - detailed purpose"],
    "dataFlow": "Complete data flow explanation"
  },
  "fileTree": [{ "name": "file.ts", "type": "file", "path": "src/file.ts" }],
  "tasks": [{
    "id": "task-1",
    "title": "Create src/lib/supabase.ts",
    "description": "DETAILED: Implement Supabase client configuration. Create: 1) createBrowserClient() for client components, 2) createServerClient() for server components/API routes using cookies(). Include TypeScript types for Database schema. Export both clients and types.",
    "dependencies": []
  }],
  "designDecisions": [{ "decision": "string", "rationale": "string" }]
}
`;

      // Use chatWithTools so planner can scan the project
      const response = await this.chatWithTools(planningPrompt, streamCallback, undefined, true);
      
      if (!response.success) {
        logger.error('Failed to create project plan', 'planner');
        return null;
      }
      
      return this.parsePlanResponse(response.content, userPrompt);
    }
  }

  /**
   * Parse the planner's response into a ProjectPlan
   */
  private parsePlanResponse(content: string, userPrompt: string): ProjectPlan | null {
    try {
      const planData = this.parseJsonResponse<PlannerOutput>(content);
      
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
   * Revise an existing plan based on user feedback
   */
  async revisePlan(currentPlan: ProjectPlan, userFeedback: string): Promise<ProjectPlan | null> {
    logger.info('Revising plan based on user feedback...', 'planner');

    const revisionPrompt = `
You created this project plan:

Project: ${currentPlan.projectName}
Description: ${currentPlan.description}
Tech Stack: ${JSON.stringify(currentPlan.techStack)}
${currentPlan.scaffoldCommand ? `Scaffold: ${currentPlan.scaffoldCommand}` : ''}

Tasks:
${currentPlan.tasks.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join('\n')}

The user wants to make changes:
"${userFeedback}"

Please revise the plan according to the user's feedback. Keep the same JSON structure but update the relevant parts.

Respond with the complete revised plan in JSON format:
{
  "projectName": "...",
  "description": "...",
  "scaffoldCommand": "..." or null,
  "postScaffoldCommands": [...],
  "techStack": {...},
  "architecture": { "overview": "...", "components": [...], "dataFlow": "..." },
  "fileTree": [...],
  "tasks": [
    { "id": "task-1", "title": "...", "description": "...", "dependencies": [] }
  ]
}
`;

    const response = await this.chat(revisionPrompt);
    
    if (!response.success) {
      logger.error('Failed to revise plan', 'planner');
      return null;
    }

    try {
      const planData = this.parseJsonResponse<PlannerOutput>(response.content);
      
      if (!planData) {
        logger.error('Could not parse revised plan as JSON', 'planner');
        return null;
      }

      const revisedPlan: ProjectPlan = {
        projectName: planData.projectName || currentPlan.projectName,
        description: planData.description || currentPlan.description,
        scaffoldCommand: planData.scaffoldCommand ?? currentPlan.scaffoldCommand,
        postScaffoldCommands: planData.postScaffoldCommands || currentPlan.postScaffoldCommands,
        architecture: planData.architecture || currentPlan.architecture,
        tasks: this.convertTasks(planData.tasks || []),
        fileTree: planData.fileTree || currentPlan.fileTree,
        techStack: planData.techStack || currentPlan.techStack,
        createdAt: currentPlan.createdAt,
        status: 'planning'
      };

      logger.success(`Plan revised: ${revisedPlan.projectName}`);
      return revisedPlan;
    } catch (error) {
      logger.error(`Error parsing revised plan: ${error}`, 'planner');
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
    // Clean up the content
    let cleaned = content.trim();
    
    // Remove markdown code blocks
    cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Remove any text before the first { or after the last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    
    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      // Try to fix common JSON issues
      try {
        // Replace single quotes with double quotes
        const fixed = cleaned.replace(/'/g, '"');
        return JSON.parse(fixed) as T;
      } catch {
        logger.error(`JSON parse failed: ${cleaned.slice(0, 200)}...`, 'planner');
        return null;
      }
    }
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
