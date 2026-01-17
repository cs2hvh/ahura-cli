#!/usr/bin/env node
/**
 * Ahura CLI - Claude Code Style AI Coding Assistant
 * 
 * Based on Anthropic's Claude Code CLI behavior:
 * - Concise, direct responses
 * - Always read files before editing
 * - Task management with todo lists
 * - Memory persistence via AHURA.md
 * - Proactive but not surprising
 */

import { config as dotenvConfig } from 'dotenv';
import * as readline from 'readline';
import chalk from 'chalk';
import { CoderAgent } from './agents/coderAgent.js';
import { PlannerAgent } from './agents/plannerAgent.js';
import { TesterAgent } from './agents/testerAgent.js';
import { ReviewerAgent } from './agents/reviewerAgent.js';
import { Task } from './types/index.js';
import { toolRegistry, registerAllTools } from './tools/index.js';
import { formatMarkdown, formatResponse } from './utils/markdownFormatter.js';
import { validatePrompt, onShutdown, isShutdownInProgress } from './utils/robustness.js';
import { generateRepoMap, getRepoSummary } from './utils/repoMap.js';
import { ContextSummarizer, getContextSummarizer } from './utils/contextSummarizer.js';
import { SelfCorrector, withRetry } from './utils/selfCorrector.js';
import { MemoryManager, createMemoryManager, getMemoryPrompt } from './utils/memoryManager.js';
import { TodoManager, createTodoManager, TodoItem } from './utils/todoManager.js';
import { buildSystemPrompt, CLAUDE_CODE_SYSTEM_PROMPT } from './prompts/claudeCodeStyle.js';
import { buildCoderPrompt, buildCoderContext, discoverMemoryFiles } from './prompts/coderPrompt.js';
import { MODEL_CONFIGS } from './context/modelConfigs.js';
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

// ============ PROJECT CONTEXT GATHERING ============

/**
 * Gather context about existing project for migrations/modifications
 */
async function gatherProjectContext(projectPath: string): Promise<string> {
  const contextParts: string[] = [];
  
  try {
    // Check if directory exists
    if (!fs.existsSync(projectPath)) {
      return 'No existing project found at this path.';
    }
    
    // Read package.json if exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        contextParts.push(`📦 PACKAGE.JSON:`);
        contextParts.push(`  Name: ${packageJson.name || 'unnamed'}`);
        contextParts.push(`  Dependencies: ${Object.keys(packageJson.dependencies || {}).join(', ') || 'none'}`);
        contextParts.push(`  DevDependencies: ${Object.keys(packageJson.devDependencies || {}).join(', ') || 'none'}`);
        if (packageJson.scripts) {
          contextParts.push(`  Scripts: ${Object.keys(packageJson.scripts).join(', ')}`);
        }
      } catch (e) {
        contextParts.push('📦 package.json exists but could not be parsed');
      }
    }
    
    // List top-level directory structure
    const files = fs.readdirSync(projectPath);
    const dirs = files.filter(f => {
      const fullPath = path.join(projectPath, f);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory() && !f.startsWith('.') && f !== 'node_modules';
    });
    const topFiles = files.filter(f => {
      const fullPath = path.join(projectPath, f);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
    });
    
    contextParts.push(`\n📁 PROJECT STRUCTURE:`);
    contextParts.push(`  Directories: ${dirs.join(', ') || 'none'}`);
    contextParts.push(`  Top-level files: ${topFiles.slice(0, 15).join(', ')}${topFiles.length > 15 ? '...' : ''}`);
    
    // Check for common config files to detect tech stack
    const configIndicators: { file: string; tech: string }[] = [
      { file: 'angular.json', tech: 'Angular' },
      { file: 'tsconfig.json', tech: 'TypeScript' },
      { file: 'prisma', tech: 'Prisma ORM' },
      { file: '.env', tech: 'Environment variables' },
      { file: 'next.config.js', tech: 'Next.js' },
      { file: 'next.config.ts', tech: 'Next.js (TS)' },
      { file: 'nuxt.config.ts', tech: 'Nuxt.js' },
      { file: 'vite.config.ts', tech: 'Vite' },
      { file: 'vue.config.js', tech: 'Vue.js' },
      { file: 'svelte.config.js', tech: 'SvelteKit' },
      { file: 'tailwind.config.js', tech: 'Tailwind CSS' },
      { file: 'tailwind.config.ts', tech: 'Tailwind CSS' },
      { file: 'drizzle.config.ts', tech: 'Drizzle ORM' },
      { file: 'supabase', tech: 'Supabase' },
      { file: 'firebase.json', tech: 'Firebase' },
      { file: '.github', tech: 'GitHub Actions/Config' },
      { file: 'docker-compose.yml', tech: 'Docker Compose' },
      { file: 'Dockerfile', tech: 'Docker' },
      { file: 'backend', tech: 'Backend folder' },
      { file: 'server', tech: 'Server folder' },
      { file: 'api', tech: 'API folder' },
    ];
    
    const detectedTech: string[] = [];
    for (const indicator of configIndicators) {
      if (fs.existsSync(path.join(projectPath, indicator.file))) {
        detectedTech.push(indicator.tech);
      }
    }
    
    if (detectedTech.length > 0) {
      contextParts.push(`\n🔧 DETECTED TECHNOLOGIES:`);
      contextParts.push(`  ${detectedTech.join(', ')}`);
    }
    
    // Look for src directory structure
    const srcPath = path.join(projectPath, 'src');
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
      const srcFiles = fs.readdirSync(srcPath);
      const srcDirs = srcFiles.filter(f => {
        const fullPath = path.join(srcPath, f);
        return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
      });
      contextParts.push(`\n📂 SRC STRUCTURE:`);
      contextParts.push(`  Subdirectories: ${srcDirs.join(', ') || 'none'}`);
    }
    
    // Look for app directory (Next.js app router)
    const appPath = path.join(projectPath, 'app');
    if (fs.existsSync(appPath) && fs.statSync(appPath).isDirectory()) {
      const appFiles = fs.readdirSync(appPath);
      contextParts.push(`\n📂 APP DIRECTORY (Next.js App Router):`);
      contextParts.push(`  Contents: ${appFiles.slice(0, 10).join(', ')}${appFiles.length > 10 ? '...' : ''}`);
    }
    
    // Check for existing database schemas
    const prismaSchemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
    if (fs.existsSync(prismaSchemaPath)) {
      try {
        const schema = fs.readFileSync(prismaSchemaPath, 'utf-8');
        const models = schema.match(/model\s+(\w+)\s*{/g);
        if (models) {
          contextParts.push(`\n🗄️ PRISMA MODELS:`);
          contextParts.push(`  ${models.map(m => m.replace(/model\s+/, '').replace(/\s*{/, '')).join(', ')}`);
        }
      } catch (e) {
        // ignore
      }
    }
    
    // Check for backend folder structure
    const backendPath = path.join(projectPath, 'backend');
    if (fs.existsSync(backendPath) && fs.statSync(backendPath).isDirectory()) {
      const backendFiles = fs.readdirSync(backendPath);
      contextParts.push(`\n📂 BACKEND FOLDER:`);
      contextParts.push(`  Contents: ${backendFiles.slice(0, 15).join(', ')}${backendFiles.length > 15 ? '...' : ''}`);
      
      // Check for backend package.json
      const backendPkgPath = path.join(backendPath, 'package.json');
      if (fs.existsSync(backendPkgPath)) {
        try {
          const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf-8'));
          contextParts.push(`  Backend deps: ${Object.keys(backendPkg.dependencies || {}).join(', ') || 'none'}`);
        } catch (e) { /* ignore */ }
      }
    }
    
    // Check for server folder structure
    const serverPath = path.join(projectPath, 'server');
    if (fs.existsSync(serverPath) && fs.statSync(serverPath).isDirectory()) {
      const serverFiles = fs.readdirSync(serverPath);
      contextParts.push(`\n📂 SERVER FOLDER:`);
      contextParts.push(`  Contents: ${serverFiles.slice(0, 15).join(', ')}${serverFiles.length > 15 ? '...' : ''}`);
    }
    
    // Add working directory
    contextParts.unshift(`📍 WORKING DIRECTORY: ${projectPath}\n`);
    
    return contextParts.join('\n') || 'Project exists but no significant structure detected.';
  } catch (error) {
    return `Error gathering context: ${error}`;
  }
}

/**
 * Deep scan project - reads actual source file contents for planning
 * This gives the planner concrete code to work with
 */
async function deepScanProject(projectPath: string): Promise<string> {
  const filesToRead: string[] = [];
  const maxFilesToRead = 10;
  const maxFileSize = 8000; // chars per file
  
  // Priority files to look for (database, models, main entry points)
  const priorityPatterns = [
    // Database files
    'db.ts', 'db.js', 'database.ts', 'database.js',
    'connection.ts', 'connection.js',
    'prisma/schema.prisma',
    'drizzle.config.ts',
    // Model/Entity files  
    'models/index.ts', 'models/index.js',
    'entities/index.ts',
    // Main app files
    'app.ts', 'app.js', 'server.ts', 'server.js', 'index.ts', 'index.js',
    'main.ts', 'main.js',
    // Config
    '.env.example', 'config.ts', 'config.js',
  ];
  
  // Check root level
  for (const pattern of priorityPatterns) {
    const fullPath = path.join(projectPath, pattern);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      filesToRead.push(fullPath);
    }
  }
  
  // Check src folder
  for (const pattern of priorityPatterns) {
    const fullPath = path.join(projectPath, 'src', pattern);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      filesToRead.push(fullPath);
    }
  }
  
  // Check backend folder
  const backendPath = path.join(projectPath, 'backend');
  if (fs.existsSync(backendPath)) {
    for (const pattern of priorityPatterns) {
      const fullPath = path.join(backendPath, pattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        filesToRead.push(fullPath);
      }
    }
    // Also check backend/src
    for (const pattern of priorityPatterns) {
      const fullPath = path.join(backendPath, 'src', pattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        filesToRead.push(fullPath);
      }
    }
  }
  
  // Check server folder
  const serverPath = path.join(projectPath, 'server');
  if (fs.existsSync(serverPath)) {
    for (const pattern of priorityPatterns) {
      const fullPath = path.join(serverPath, pattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        filesToRead.push(fullPath);
      }
    }
  }
  
  // Deduplicate
  const uniqueFiles = [...new Set(filesToRead)].slice(0, maxFilesToRead);
  
  if (uniqueFiles.length === 0) {
    return '\n[No key source files found to scan]';
  }
  
  const fileContents: string[] = ['\n═══════════════════════════════════════════════════════════════'];
  fileContents.push('📄 KEY SOURCE FILES (actual code the planner must consider):');
  fileContents.push('═══════════════════════════════════════════════════════════════\n');
  
  for (const filePath of uniqueFiles) {
    try {
      const relativePath = path.relative(projectPath, filePath);
      let content = fs.readFileSync(filePath, 'utf-8');
      
      // Truncate if too large
      if (content.length > maxFileSize) {
        content = content.substring(0, maxFileSize) + '\n... [truncated]';
      }
      
      fileContents.push(`──────────────────────────────────────`);
      fileContents.push(`FILE: ${relativePath}`);
      fileContents.push(`──────────────────────────────────────`);
      fileContents.push(content);
      fileContents.push('');
    } catch (e) {
      // Skip unreadable files
    }
  }
  
  return fileContents.join('\n');
}

// ============ TASK COMPLEXITY DETECTION ============

type TaskComplexity = 'quick' | 'full';

interface ComplexityResult {
  complexity: TaskComplexity;
  reason: string;
  confidence: number;
}

/**
 * Use AI to analyze prompt complexity - much smarter than regex!
 */
async function analyzePromptComplexity(prompt: string): Promise<ComplexityResult> {
  // Use a quick AI call to determine complexity
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    // No API key - default to full for safety
    return { complexity: 'full', reason: 'No API key, defaulting to full mode', confidence: 0.5 };
  }
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ahurasense',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',  // Fast & cheap for classification
        max_tokens: 200,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `Classify the task complexity. Be smart about typos (e.g., "mirage" likely means "migrate").

QUICK = single-file tasks:
- Fix a bug, add a function, explain code, simple script

FULL = multi-file/architectural tasks:
- New project, migration, switching technologies, multi-component work

Output ONLY: {"complexity":"quick"|"full","reason":"short reason"}`
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.log(chalk.gray(`  (Haiku API error: ${response.status})`));
      // Default to full for complex-sounding requests
      if (prompt.length > 50 || /\b(and|with|to|from)\b/i.test(prompt)) {
        return { complexity: 'full', reason: 'API error, defaulting to full (complex request)', confidence: 0.5 };
      }
      return { complexity: 'quick', reason: 'API error, defaulting to quick', confidence: 0.5 };
    }
    
    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse the AI response
    try {
      const parsed = JSON.parse(content);
      return {
        complexity: parsed.complexity === 'full' ? 'full' : 'quick',
        reason: parsed.reason || 'AI classification',
        confidence: parsed.confidence || 0.8
      };
    } catch {
      // If JSON parse fails, look for keywords in response
      if (content.toLowerCase().includes('full')) {
        return { complexity: 'full', reason: 'AI suggested full mode', confidence: 0.7 };
      }
      return { complexity: 'quick', reason: 'AI suggested quick mode', confidence: 0.7 };
    }
    
  } catch (error) {
    // Network error - default based on request complexity
    if (prompt.length > 50 || /\b(and|with|to|from)\b/i.test(prompt)) {
      return { complexity: 'full', reason: 'Network error, complex request detected', confidence: 0.5 };
    }
    return { complexity: 'quick', reason: 'Network error, simple request', confidence: 0.5 };
  }
}

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
  filesModified: string[];
  startTime: Date;
}

// Global state
let currentProject: string = process.cwd();
let isProcessing = false;
let shouldAbort = false;
let lastDetectedComplexity: ComplexityResult | null = null;

// Conversation memory - KEY FOR FOLLOW-UPS
let conversationHistory: ConversationMessage[] = [];
let sessionStats: SessionStats = {
  totalTokens: 0,
  totalMessages: 0,
  filesCreated: [],
  filesModified: [],
  startTime: new Date()
};

// Context Summarizer - automatically manages context window
const contextSummarizer = new ContextSummarizer({
  maxTokens: 150000,            // Keep under Claude's context limit
  summarizeThreshold: 100000,   // Summarize at 100k tokens
  maxRecentMessages: 10         // Always keep 10 most recent messages
});

// Memory Manager - AHURA.md persistence (Claude Code style)
let memoryManager: MemoryManager | null = null;

// Todo Manager - task tracking (Claude Code style)
let todoManager: TodoManager | null = null;

// Agents
let coderAgent: CoderAgent | null = null;
let plannerAgent: PlannerAgent | null = null;
let testerAgent: TesterAgent | null = null;
let reviewerAgent: ReviewerAgent | null = null;

/**
 * Initialize the coder agent with dynamic context-aware prompt
 * Includes: working directory, git status, memory files (AHURA.md, etc.)
 */
function initializeCoderAgent(): CoderAgent {
  if (!coderAgent) {
    coderAgent = new CoderAgent();
  }
  
  // Build dynamic context for the prompt
  const context = buildCoderContext(currentProject);
  const dynamicPrompt = buildCoderPrompt(context);
  
  // Update the system prompt with context
  coderAgent.setSystemPrompt(dynamicPrompt);
  
  // Log if memory file found
  if (context.memoryContent) {
    const memoryFile = context.memoryContent.match(/path="([^"]+)"/)?.[1] || 'memory file';
    console.log(chalk.dim(`  ${icons.file} Loaded ${memoryFile}`));
  }
  
  return coderAgent;
}

// ============ UI HELPERS ============

// Claude Code style: minimal icons, concise output
const icons = {
  thinking: '○',
  planning: '○',
  coding: '○', 
  writing: '○',
  success: '✓',
  error: '✗',
  file: '○',
  folder: '○',
  done: '✓',
  arrow: '→',
  bullet: '-',
  chat: '○',
  history: '○',
  cost: '○',
  compact: '○',
  context: '○',
  lite: '⚡',
  full: '🏗️',
  testing: '🧪',
  review: '🔍',
  planner: '📐',
  info: 'ℹ',
  coder: '💻',
  fix: '🔧'
};

// Context usage display - shows how much of the context window is used
// Get the actual context window from the coder model config
function getMaxContextTokens(): number {
  const coderModel = process.env.AHURA_CODER_MODEL || 'anthropic/claude-sonnet-4.5';
  const config = MODEL_CONFIGS[coderModel];
  return config?.contextWindow || 200000; // Default fallback
}

function getContextBar(tokensUsed: number): string {
  const maxContextTokens = getMaxContextTokens();
  const percentage = Math.min(100, Math.round((tokensUsed / maxContextTokens) * 100));
  const barLength = 10;
  const filled = Math.round((percentage / 100) * barLength);
  const empty = barLength - filled;
  
  // Color based on usage
  let color = chalk.green;
  if (percentage > 70) color = chalk.yellow;
  if (percentage > 90) color = chalk.red;
  
  const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  // Show actual numbers for clarity
  const usedK = Math.round(tokensUsed / 1000);
  const maxK = Math.round(maxContextTokens / 1000);
  return `${bar} ${percentage}% (${usedK}K/${maxK}K)`;
}

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
  
  // Initialize agents as needed (coder gets dynamic prompt with context)
  if (!coderAgent) coderAgent = initializeCoderAgent();
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
        rolePrompt = `You are a QA Tester Agent. Your job is to TEST the application and report issues concisely.

IMPORTANT RULES:
1. Be CONCISE - no full error dumps
2. Summarize each issue in ONE line
3. Max 10 issues - prioritize critical ones first

TESTING WORKFLOW:
1. Use list_directory to see project structure
2. Use read_file on package.json to see available scripts
3. Use run_command to run tests/build (add "2>&1" to capture errors)
4. Analyze the output and summarize issues

WHEN RUNNING COMMANDS:
- For builds: run_command("npm run build 2>&1")
- For tests: run_command("npm test 2>&1")
- For lint: run_command("npm run lint 2>&1")

OUTPUT FORMAT (REQUIRED - be brief):
## Test Results

✅ **Build**: [PASS/FAIL] - [one line summary]
✅ **Lint**: [PASS/FAIL/SKIPPED] - [one line summary]  
✅ **Tests**: [PASS/FAIL/SKIPPED] - [one line summary]

### Issues Found (max 10):
1. \`[file]\`: [brief description]
2. \`[file]\`: [brief description]

### Suggested Fixes:
- [actionable fix command or explanation]

NEVER paste raw error logs. Always summarize.\n\n`;
        break;
      case 'planner':
        rolePrompt = `You are a Planner Agent (Software Architect) with TOOLS. You can:
- web_search/fetch_url to research best practices and docs
- list_directory/read_file to understand existing code
- run_command to check versions and dependencies

Analyze the request from an architecture perspective.
Focus on: project structure, component breakdown, tech stack recommendations.
USE YOUR TOOLS to research before planning!\n\n`;
        break;
      case 'reviewer':
        rolePrompt = `You are a Code Reviewer Agent with TOOLS. You can:
- read_file to review all source code
- search_in_files to find TODOs, FIXMEs, issues
- run_command to verify build/lint passes
- list_directory to check completeness

Review the code/request from a senior engineer's perspective.
Focus on: code quality, best practices, completeness.
USE YOUR TOOLS for thorough review!\n\n`;
        break;
      case 'coder':
      default:
        rolePrompt = `You have TOOLS available:
- read_file/write_file for file operations
- web_search/fetch_url to look up docs
- run_command to execute npm/git commands
- list_directory/search_in_files to explore code

USE TOOLS when helpful!\n\n`;
        break;
    }
    
    const finalMessage = rolePrompt + enhancedMessage;
    
    printProgress(`${agentNames[agent]} thinking...`);
    
    // Track tool calls separately from response content
    let toolCallsShown = new Set<string>();
    
    // Use chatWithTools for enhanced capability (web search, file ops, terminal)
    result = await coderAgent.chatWithTools(
      finalMessage,
      (chunk: string, done: boolean) => {
        // Handle tool progress markers - show them nicely
        if (chunk.startsWith('__TOOL__')) {
          const toolInfo = chunk.replace('__TOOL__', '');
          if (!toolCallsShown.has(toolInfo)) {
            toolCallsShown.add(toolInfo);
            clearLine();
            console.log(chalk.gray(`  ${icons.thinking} ${toolInfo}`));
          }
          return;
        }
        
        response += chunk;
        if (!done) {
          printProgress(`${agentNames[agent]} responding... (${response.length} chars)`);;
        }
      },
      undefined, // context
      true // enableTools
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
    
    // Always show context usage bar
    console.log(chalk.gray(`  Context: ${getContextBar(sessionStats.totalTokens)}`));
    
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

// Format agent response for display - extract friendly content from JSON
function formatAgentResponse(response: string): string {
  let content = response.trim();
  
  // Strip markdown code blocks if present (```json ... ```)
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    
    // If it has operations with files, this is a file creation response - let the file handler deal with it
    if (parsed.operations && Array.isArray(parsed.operations) && parsed.operations.length > 0) {
      return ''; // Will be handled by file operations
    }
    
    // Extract friendly message from notes or thinking field
    if (parsed.notes) {
      return parsed.notes;
    }
    if (parsed.thinking) {
      return parsed.thinking;
    }
    
    // Fallback for JSON without notes/thinking
    return 'How can I help you build something today?';
  } catch {
    // Not JSON - format markdown for terminal display
    return formatMarkdownForTerminal(content);
  }
}

// Format markdown for nice terminal display
function formatMarkdownForTerminal(text: string): string {
  let result = text;
  
  // Headers: ## Header -> bold cyan (use callback for chalk)
  result = result.replace(/^### (.+)$/gm, (_, h) => chalk.cyan('    ' + h));
  result = result.replace(/^## (.+)$/gm, (_, h) => '\n' + chalk.cyan.bold(h));
  result = result.replace(/^# (.+)$/gm, (_, h) => '\n' + chalk.cyan.bold.underline(h));
  
  // Bold: **text** -> bold white
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
  
  // Inline code: `code` -> yellow
  result = result.replace(/`([^`]+)`/g, (_, c) => chalk.yellow(c));
  
  // Checkmarks and status
  result = result.replace(/✅/g, chalk.green('✓'));
  result = result.replace(/❌/g, chalk.red('✗'));
  result = result.replace(/⏭️/g, chalk.gray('⏭'));
  result = result.replace(/🐛/g, chalk.yellow('🐛'));
  
  // Bullet points: - item or * item  
  result = result.replace(/^(\s*)[-*] (.+)$/gm, '$1  • $2');
  
  // Numbered lists - indent
  result = result.replace(/^(\d+)\. (.+)$/gm, (_, n, t) => `    ${n}. ${t}`);
  
  // Add base indentation
  const lines = result.split('\n');
  return lines.map(line => {
    // Don't double-indent already indented or empty lines
    if (line.startsWith('  ') || line.startsWith('\n') || line.trim() === '') return line;
    return '  ' + line;
  }).join('\n');
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function printStep(icon: string, message: string, detail?: string) {
  const detailStr = detail ? chalk.gray(` ${detail}`) : '';
  console.log(`  ${icon} ${chalk.white(message)}${detailStr}`);
}

function printProgress(message: string) {
  // Claude Code style: simple static message, no animation
  process.stdout.write(`\r  ${chalk.gray('○')} ${chalk.gray(message)}                    `);
}

function printThinking(text: string) {
  // Show truncated thinking in gray
  const maxLen = 80;
  const display = text.length > maxLen ? text.slice(-maxLen) + '...' : text;
  process.stdout.write(`\r  ${chalk.gray('○')} ${chalk.gray(display)}                    `);
}

// Build conversation context for follow-ups
function buildConversationContext(useSummarizer: boolean = true): string {
  // Use summarizer for better context management
  if (useSummarizer && contextSummarizer.hasSummary()) {
    return contextSummarizer.buildContextString();
  }
  
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
  
  // Also add to context summarizer for smart management
  contextSummarizer.addMessage(role, content);
  
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

// AI-generated summary and next steps (lightweight call)
async function generateAISummary(userRequest: string, filesCreated: string[], tasksCompleted: string[]): Promise<{ summary: string; nextSteps: string[] }> {
  if (!coderAgent) return { summary: '', nextSteps: [] };
  
  const prompt = `Based on this completed task, provide a brief summary and suggest next steps.

User's request: "${userRequest}"

Files created/modified:
${filesCreated.slice(0, 10).map(f => `- ${f}`).join('\n')}

Tasks completed:
${tasksCompleted.slice(0, 5).map(t => `- ${t}`).join('\n')}

Respond in this exact JSON format only, no markdown:
{"summary": "One sentence what was done", "nextSteps": ["next 1", "next 2"]}

Keep summary under 12 words. Keep each next step under 4 words. Max 2 next steps.`;

  try {
    // Use a quick completion without adding to conversation history
    const response = await coderAgent.quickCompletion(prompt);
    const json = response.match(/\{[\s\S]*\}/)?.[0];
    if (json) {
      const parsed = JSON.parse(json);
      return {
        summary: parsed.summary || '',
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 2) : []
      };
    }
  } catch {
    // Fallback silently - don't break the flow
  }
  return { summary: '', nextSteps: [] };
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
    postCommands: [
      'npx --yes shadcn@latest init -d',  // Initialize shadcn/ui with defaults
      'npx --yes shadcn@latest add button card input'  // Add common components
    ]
  },
  {
    name: 'React (Vite)',
    keywords: ['react', 'reactjs', 'react.js', 'react app'],
    command: 'npm create vite@latest . -- --template react-ts --yes',
    postCommands: [
      'npm install',
      'npm install -D tailwindcss postcss autoprefixer',
      'npx tailwindcss init -p',
      'npx --yes shadcn@latest init -d',  // Initialize shadcn/ui
      'npx --yes shadcn@latest add button card input'  // Add common components
    ]
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
    coderAgent = initializeCoderAgent();
  }

  isProcessing = true;
  shouldAbort = false;

  console.log('');
  
  // Add user message to history
  addToHistory('user', prompt);
  
  try {
    // Check if prompt references an image - if so, analyze it first
    let imageContext = '';
    // Match patterns like: "check image.png", "image/image.png", "look at ./images/ui.png", "like that image.png"
    const imageMatch = prompt.match(/(?:check|look at|view|see|like|from|in)\s+([^\s,]+\.(?:png|jpg|jpeg|gif|webp))/i)
      || prompt.match(/([a-zA-Z0-9_\-\.\/\\]+\.(?:png|jpg|jpeg|gif|webp))/i);
    
    if (imageMatch) {
      let imagePath = imageMatch[1].trim();
      
      // Handle "image.png in image folder" pattern
      const inFolderMatch = prompt.match(/([^\s]+\.(?:png|jpg|jpeg|gif|webp))\s+in\s+([^\s,]+)\s*(?:folder)?/i);
      if (inFolderMatch) {
        imagePath = path.join(inFolderMatch[2], inFolderMatch[1]);
      }
      
      const fullImagePath = path.isAbsolute(imagePath) ? imagePath : path.join(currentProject, imagePath);
      
      if (fs.existsSync(fullImagePath)) {
        process.stdout.write(chalk.cyan('  🖼️  Analyzing image...'));
        
        const imageBuffer = fs.readFileSync(fullImagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(fullImagePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' 
          : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
          : 'image/jpeg';
        
        // Get image description from vision
        let imageDescription = '';
        await coderAgent.chatWithVision(
          `Describe this UI design in detail for a developer who needs to recreate it. Include:
1. Overall layout structure (header, sidebar, main content areas)
2. Color scheme (exact colors if visible, dark/light theme)
3. Typography (font sizes, weights)
4. Specific UI components (buttons, cards, inputs, icons)
5. Spacing and alignment
6. Any animations or interactive elements visible
Be specific and technical so a developer can recreate this exactly.`,
          base64,
          mimeType,
          (chunk: string, done: boolean) => {
            if (chunk) imageDescription += chunk;
          }
        );
        
        clearLine();
        console.log(chalk.green('  ✓ Image analyzed'));
        
        imageContext = `\n\nIMAGE REFERENCE - The user wants UI like this image:
${imageDescription}

Use this description to create the exact UI shown in the image.`;
      }
    }
    
    printProgress('Working on it...');
    
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
    
    // Generate repository map for structural context (if project has files)
    let repoMapContext = '';
    try {
      const existingFiles = fs.readdirSync(currentProject).filter(f => !f.startsWith('.') && f !== 'node_modules');
      if (existingFiles.length > 0) {
        const repoMap = getRepoSummary(currentProject);
        if (repoMap && repoMap.length > 100) {
          repoMapContext = `\n\nEXISTING PROJECT STRUCTURE:\n${repoMap}\n\nUse this structure to understand existing code and maintain consistency.`;
        }
      }
    } catch {}
    
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
${imageContext}${repoMapContext}
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

⚠️ STRICT OUTPUT FORMAT - You MUST respond with ONLY a JSON object:

{"thinking":"your plan here","plan":["step1","step2"],"operations":[{"type":"create","path":"file.ext","content":"full code"}]}

RULES YOU MUST FOLLOW:
1. Your ENTIRE response must be valid JSON - nothing else
2. First character MUST be { and last character MUST be }
3. NO explanatory text before the JSON
4. NO markdown code blocks (no \`\`\`json)
5. NO comments like "Let me..." or "I'll create..."
6. Put ALL explanations inside the "thinking" field
7. Write COMPLETE file contents - never use "..." or "// rest of code"
8. If the file is 500 lines, write all 500 lines in "content"
${scaffoldUsed ? '9. Do NOT recreate scaffolded files - only add custom code' : ''}

Example of CORRECT response:
{"thinking":"Creating a REST API","plan":["Create server","Add routes"],"operations":[{"type":"create","path":"server.js","content":"const express = require('express');\\nconst app = express();\\n...complete code..."}]}

Example of WRONG response (DO NOT DO THIS):
Let me create the files for you:
\`\`\`json
{"operations":[...]}
\`\`\``;

    let fullResponse = '';
    let lastUpdate = Date.now();
    let thinkingShown = false;
    let planShown = false;
    let filesWritten = new Set<string>(); // Track files already written
    let writingStarted = false;
    
    // Detect if this is a simple task (fix, update, small change) vs complex (create project, build app)
    const isSimpleTask = /^(fix|update|change|modify|edit|add|remove|delete|rename|move|refactor|debug|patch)\b/i.test(prompt.trim())
      || prompt.length < 80  // Short prompts are usually simple
      || /\b(bug|error|issue|broken|not working|doesn't work)\b/i.test(prompt);
    
    const result = await coderAgent.chatStream(
      enhancedPrompt,
      (chunk: string, done: boolean) => {
        fullResponse += chunk;
        
        if (shouldAbort) return;
        
        // Update display periodically
        if (Date.now() - lastUpdate > 100 || done) {
          lastUpdate = Date.now();
          
          // For simple tasks, skip verbose planning output
          if (isSimpleTask) {
            // Just show a simple progress indicator until files start writing
            if (!thinkingShown && !writingStarted) {
              printProgress('Working...');
              // Mark as shown so we don't keep updating
              const thinkMatch = fullResponse.match(/"thinking"\s*:\s*"([^"]+)"/);
              if (thinkMatch) thinkingShown = true;
            }
            // Skip plan display entirely for simple tasks
            if (!planShown) {
              const planMatch = fullResponse.match(/"plan"\s*:\s*\[([\s\S]*?)\]/);
              if (planMatch) planShown = true; // Mark as done without displaying
            }
          } else {
            // Full verbose output for complex tasks
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
          }
          
          // Stream file creation as they complete in the response
          if (planShown) {
            // Use streaming-aware extraction to get files one-by-one
            const ops = extractStreamingFiles(fullResponse);
            for (const op of ops) {
              if (!filesWritten.has(op.path) && op.content && op.content.length > 10) {
                // Show writing header once
                if (!writingStarted) {
                  console.log('');
                  writingStarted = true;
                }
                
                // Write file immediately
                try {
                  const fullPath = path.join(currentProject, op.path);
                  const dir = path.dirname(fullPath);
                  const dirRelative = path.relative(currentProject, dir);
                  
                  // Check if file already exists
                  const fileExists = fs.existsSync(fullPath);
                  
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  
                  if (fileExists) {
                    fs.writeFileSync(fullPath, op.content, 'utf-8');
                    console.log(`  ${chalk.yellow('M')} ${op.path}`);
                  } else {
                    fs.writeFileSync(fullPath, op.content, 'utf-8');
                    console.log(`  ${chalk.green('+')} ${op.path}`);
                  }
                  filesWritten.add(op.path);
                  sessionStats.filesCreated.push(op.path);
                } catch (err) {
                  // Will retry at the end if failed
                }
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
    
    for (const op of operations) {
      if (!filesWritten.has(op.path) && op.content) {
        if (!writingStarted) {
          console.log('');
          writingStarted = true;
        }
        
        try {
          const fullPath = path.join(currentProject, op.path);
          const dir = path.dirname(fullPath);
          const fileExists = fs.existsSync(fullPath);
          
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(fullPath, op.content, 'utf-8');
          if (fileExists) {
            console.log(`  ${chalk.yellow('M')} ${op.path}`);
          } else {
            console.log(`  ${chalk.green('+')} ${op.path}`);
          }
          filesWritten.add(op.path);
          sessionStats.filesCreated.push(op.path);
        } catch (error) {
          console.log(`  ${chalk.red('✗')} ${op.path} - ${error}`);
        }
      }
    }
    
    if (filesWritten.size === 0) {
      // No files - show text response
      try {
        const parsed = JSON.parse(result.content);
        const response = parsed.notes || parsed.thinking || '';
        if (response) {
          console.log('');
          console.log(`  ${response}`);
        }
      } catch {
        console.log('');
        console.log(formatMarkdown(result.content));
      }
    } else {
      // Show simple summary
      console.log('');
      console.log(`  ${chalk.green('✓')} ${filesWritten.size} file(s)`);
      console.log(chalk.gray(`  ${getContextBar(sessionStats.totalTokens)}`));
      
      // Auto-commit
      if (isGitRepo()) {
        const createdArray = Array.from(filesWritten);
        const committed = gitAutoCommit(createdArray, `Created ${createdArray.length} file(s)`);
        if (committed) {
          console.log(chalk.gray(`  Committed (use /undo to revert)`));
        }
      }
    }
    
  } catch (error) {
    clearLine();
    console.log('');
    console.log(`  ${chalk.red('✗')} ${error}`);
  } finally {
    isProcessing = false;
  }
}

// ============ FULL MODE BUILD FUNCTION ============

import { execSync, spawn } from 'child_process';

// ============ GIT INTEGRATION ============

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: currentProject, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function gitAutoCommit(files: string[], message: string): boolean {
  if (!isGitRepo()) return false;
  
  try {
    // Stage the created files
    for (const file of files) {
      execSync(`git add "${file}"`, { cwd: currentProject, stdio: 'pipe' });
    }
    
    // Commit with descriptive message
    const commitMsg = `[Ahura] ${message}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: currentProject, stdio: 'pipe' });
    
    return true;
  } catch {
    return false;
  }
}

// ============ TERMINAL COMMAND EXECUTION ============

// Simple command execution (no retries)
function runTerminalCommandSimple(command: string, description: string): boolean {
  printStep('🖥️', chalk.cyan(description));
  console.log(chalk.gray(`     $ ${command}`));
  
  try {
    execSync(command, {
      cwd: currentProject,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    printStep(icons.success, chalk.green('Command completed'));
    return true;
  } catch (error) {
    printStep(icons.error, chalk.red(`Command failed: ${error}`));
    return false;
  }
}

// Self-correcting command execution
const selfCorrector = new SelfCorrector(2); // max 2 retries

async function runTerminalCommand(command: string, description: string, enableSelfCorrection: boolean = true): Promise<boolean> {
  if (!enableSelfCorrection) {
    return runTerminalCommandSimple(command, description);
  }
  
  printStep('🖥️', chalk.cyan(description));
  console.log(chalk.gray(`     $ ${command}`));
  
  try {
    // Create executor function
    const executor = async (cmd: string): Promise<{ success: boolean; output?: string; error?: string }> => {
      try {
        const output = execSync(cmd, {
          cwd: currentProject,
          encoding: 'utf-8',
          env: { ...process.env, FORCE_COLOR: '0' },
          maxBuffer: 1024 * 1024 * 10
        });
        return { success: true, output };
      } catch (err: any) {
        return { 
          success: false, 
          error: err.message || String(err),
          output: err.stdout || ''
        };
      }
    };
    
    const result = await selfCorrector.executeWithCorrection(
      description,  // Task description
      executor,     // Executor function
      command,      // Initial input (the command)
      (attempt: number, action: string) => {
        if (attempt > 1) {
          console.log(chalk.yellow(`  ⟳ Retry ${attempt}: ${action}`));
        }
      }
    );
    
    if (result.success) {
      printStep(icons.success, chalk.green('Command completed'));
      return true;
    } else {
      printStep(icons.error, chalk.red(`Command failed after ${result.attempts} attempts`));
      return false;
    }
  } catch (error: any) {
    // Fallback - try once without correction
    try {
      execSync(command, {
        cwd: currentProject,
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      printStep(icons.success, chalk.green('Command completed'));
      return true;
    } catch (fallbackError) {
      printStep(icons.error, chalk.red(`Command failed: ${fallbackError}`));
      return false;
    }
  }
}

// ============ FULL MODE BUILD FUNCTION ============

async function buildProjectFull(prompt: string, rl: readline.Interface): Promise<void> {
  isProcessing = true;
  shouldAbort = false;
  
  // Initialize all agents (coder gets dynamic prompt with context)
  if (!plannerAgent) plannerAgent = new PlannerAgent();
  if (!coderAgent) coderAgent = initializeCoderAgent();
  if (!testerAgent) testerAgent = new TesterAgent();
  if (!reviewerAgent) reviewerAgent = new ReviewerAgent();
  
  console.log('');
  console.log(chalk.cyan('━'.repeat(60)));
  
  addToHistory('user', prompt);
  const filesWrittenFull = new Set<string>();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // PLANNING
    // ═══════════════════════════════════════════════════════════
    console.log('');
    
    // Detect if this is a new project (empty folder) or existing project
    let isEmptyProject = false;
    try {
      const files = fs.readdirSync(currentProject);
      // Consider empty if no package.json, no src folder, and few files
      const hasPackageJson = files.includes('package.json');
      const hasSrcFolder = files.includes('src') || files.includes('app') || files.includes('backend');
      const significantFiles = files.filter(f => !f.startsWith('.') && f !== 'node_modules');
      isEmptyProject = !hasPackageJson && !hasSrcFolder && significantFiles.length < 3;
    } catch {
      isEmptyProject = true; // Folder doesn't exist or can't read
    }
    
    // Simple planning indicator
    printStep(icons.planner, 'Planning...');
    
    // Track what planner is doing (minimal output)
    let lastToolShown = '';
    let thinkingInterval: NodeJS.Timeout | null = null;
    let thinkingDots = 0;
    
    // Streaming callback - minimal, just show current action
    const plannerStream = (chunk: string, done: boolean) => {
      if (chunk) {
        // Handle tool progress markers
        if (chunk.startsWith('__TOOL__')) {
          const toolInfo = chunk.replace('__TOOL__', '');
          if (toolInfo !== lastToolShown) {
            lastToolShown = toolInfo;
            
            // Clear any existing spinner
            if (thinkingInterval) {
              clearInterval(thinkingInterval);
              thinkingInterval = null;
              process.stdout.write('\r\x1b[K');
            }
            
            // Only show key actions, not every file scan
            if (toolInfo.includes('Generating') || toolInfo.includes('Writing plan') || toolInfo.includes('Analyzing')) {
              thinkingDots = 0;
              thinkingInterval = setInterval(() => {
                thinkingDots = (thinkingDots + 1) % 4;
                const dots = '.'.repeat(thinkingDots) + ' '.repeat(3 - thinkingDots);
                process.stdout.write(`\r  ${chalk.gray(`${icons.thinking} ${toolInfo}${dots}`)}`);
              }, 400);
            }
          }
          return;
        }
        // Suppress all text output - we show formatted plan later
      }
      if (done) {
        if (thinkingInterval) {
          clearInterval(thinkingInterval);
          thinkingInterval = null;
          process.stdout.write('\r\x1b[K');
        }
      }
    };
    
    // Let planner create plan (scans if existing project, skips scan if new)
    let planResult = await plannerAgent.createProjectPlan(prompt, currentProject, plannerStream, isEmptyProject);
    
    if (!planResult) {
      throw new Error('Planner failed to create project plan');
    }
    
    // Show plan to user and ask for confirmation or edits
    let planApproved = false;
    while (!planApproved) {
      console.log('');
      console.log(chalk.cyan('━'.repeat(60)));
      console.log(chalk.green.bold('  🧠 Planner Analysis'));
      console.log(chalk.cyan('━'.repeat(60)));
      console.log('');
      
      // Show conversational description (wrapped nicely)
      const desc = planResult.description || '';
      const words = desc.split(' ');
      let line = '  ';
      for (const word of words) {
        if (line.length + word.length > 70) {
          console.log(chalk.white(line));
          line = '  ' + word + ' ';
        } else {
          line += word + ' ';
        }
      }
      if (line.trim()) console.log(chalk.white(line));
      console.log('');
      
      // Show architecture if detailed
      if (planResult.architecture && planResult.architecture.overview) {
        console.log(chalk.yellow('  🏗️ Architecture:'));
        console.log(chalk.gray(`     ${planResult.architecture.overview.substring(0, 200)}${planResult.architecture.overview.length > 200 ? '...' : ''}`));
        if (planResult.architecture.dataFlow) {
          console.log(chalk.gray(`     Flow: ${planResult.architecture.dataFlow}`));
        }
        console.log('');
      }
      
      // Show files that will be modified/created
      console.log(chalk.yellow('  📁 Files to modify/create:'));
      planResult.tasks.forEach((task) => {
        // Extract file paths from task title or description
        const fileMatch = task.title.match(/(?:backend\/|frontend\/|src\/|\.\/)?[\w\-\/]+\.\w+/);
        if (fileMatch) {
          console.log(chalk.gray(`     • ${fileMatch[0]}`));
        } else {
          console.log(chalk.gray(`     • ${task.title}`));
        }
      });
      console.log('');
      
      // Show packages to install if any
      if (planResult.postScaffoldCommands && planResult.postScaffoldCommands.length > 0) {
        console.log(chalk.yellow('  📦 Packages to install:'));
        planResult.postScaffoldCommands.forEach(cmd => {
          console.log(chalk.gray(`     ${cmd}`));
        });
        console.log('');
      }
      
      // Show detailed tasks
      console.log(chalk.yellow(`  📋 Implementation Plan (${planResult.tasks.length} tasks):`));
      planResult.tasks.forEach((task, i) => {
        console.log(chalk.white(`     ${i + 1}. ${task.title}`));
        // Show task description (truncated)
        if (task.description) {
          const taskDesc = task.description.substring(0, 150);
          console.log(chalk.gray(`        ${taskDesc}${task.description.length > 150 ? '...' : ''}`));
        }
      });
      console.log('');
      
      // Show design decisions if any
      const designDoc = (planResult as any).designDecisions;
      if (designDoc && Array.isArray(designDoc) && designDoc.length > 0) {
        console.log(chalk.yellow('  💡 Design Decisions:'));
        designDoc.slice(0, 3).forEach((d: any) => {
          console.log(chalk.gray(`     • ${d.decision}: ${d.rationale?.substring(0, 80) || ''}`));
        });
        console.log('');
      }
      
      // Ask for approval or edits
      const answer = await askQuestion(rl, chalk.yellow('  Proceed? (y)es / (d)etail / (e)dit / (c)ancel: '));
      const choice = answer.toLowerCase().trim();
      
      if (choice === 'y' || choice === 'yes') {
        planApproved = true;
        printStep(icons.success, chalk.green('Plan approved!'));
      } else if (choice === 'd' || choice === 'detail') {
        // Show full task details
        console.log('');
        console.log(chalk.cyan('━'.repeat(60)));
        console.log(chalk.white.bold('  Full Task Details'));
        console.log(chalk.cyan('━'.repeat(60)));
        planResult.tasks.forEach((task, i) => {
          console.log('');
          console.log(chalk.yellow(`  Task ${i + 1}: ${task.title}`));
          console.log(chalk.white(`  ${task.description || 'No description'}`));
        });
        console.log('');
      } else if (choice === 'e' || choice === 'edit') {
        // Ask what to change
        const editRequest = await askQuestion(rl, chalk.cyan('  What would you like to change? '));
        if (editRequest.trim()) {
          console.log('');
          printStep(icons.planner, 'Planner Agent revising plan...');
          
          // Create a new plan with the modifications
          const revisedPlan = await plannerAgent.revisePlan(planResult, editRequest);
          if (revisedPlan) {
            planResult = revisedPlan;
            console.log(chalk.green('  ✓ Plan updated!'));
          } else {
            console.log(chalk.yellow('  ⚠ Could not revise plan. Keeping original.'));
          }
        }
      } else if (choice === 'c' || choice === 'cancel') {
        console.log(chalk.yellow('  ⚠ Project cancelled.'));
        return;
      }
    }
    
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
    // CODING
    // ═══════════════════════════════════════════════════════════
    console.log('');
    
    if (planResult.tasks.length === 0) {
      printStep(icons.success, chalk.green('No custom code needed!'), chalk.gray('Scaffold is complete'));
    } else {
      printStep(icons.coding, 'Coding...');
      
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
    // SUMMARY (shown immediately after code generation)
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.bold.green(`  ${icons.done} Code Complete!`));
    
    // Context usage bar
    console.log(chalk.gray(`  Context: ${getContextBar(sessionStats.totalTokens)}`));
    
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
    
    // Status line
    console.log('');
    console.log(chalk.gray(`  Tasks: ${planResult.tasks.length} | Files: ${filesWrittenFull.size}`));
    
    // AI-generated summary and next steps
    const taskTitles = planResult.tasks.map((t: any) => t.title || t.description);
    const aiResult = await generateAISummary(prompt, createdArray, taskTitles);
    if (aiResult.summary) {
      console.log('');
      console.log(chalk.white(`  ${aiResult.summary}`));
    }
    
    // Follow-up options
    console.log('');
    console.log(chalk.cyan.bold('  What next?'));
    console.log(chalk.gray('  ─────────────────────────────────'));
    console.log(chalk.white('  1. Run tests (find bugs)'));
    console.log(chalk.white('  2. Run review (quality check)'));
    console.log(chalk.white('  3. Continue (add more features)'));
    if (aiResult.nextSteps.length > 0) {
      aiResult.nextSteps.forEach((step, i) => {
        console.log(chalk.gray(`  ${i + 4}. ${step}`));
      });
    }
    console.log('');
    
    // Get user choice
    const choice = await new Promise<string>((resolve) => {
      rl.question(chalk.cyan('  Choice (1-3 or describe): '), resolve);
    });
    
    const choiceLower = choice.toLowerCase().trim();
    const runTests = choiceLower === '1' || choiceLower.includes('test');
    const runReview = choiceLower === '2' || choiceLower.includes('review');
    const continueBuilding = choiceLower === '3' || choiceLower.includes('continue');
    
    // Handle AI-suggested options (4, 5, etc.)
    const numChoice = parseInt(choice);
    if (numChoice >= 4 && numChoice < 4 + aiResult.nextSteps.length) {
      // User selected an AI suggestion - treat as continue with that prompt
      const selectedStep = aiResult.nextSteps[numChoice - 4];
      console.log('');
      console.log(chalk.gray(`  → Continuing with: ${selectedStep}`));
      // Queue the next request (will be handled by main loop)
      addToHistory('user', selectedStep);
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 3: TESTING (if selected)
    // ═══════════════════════════════════════════════════════════
    let testResult: { passed: boolean; bugs: Array<{severity: string; file: string; description: string}>; securityIssues: unknown[]; summary: string } = { 
      passed: true, 
      bugs: [], 
      securityIssues: [], 
      summary: 'Testing skipped' 
    };
    
    if (runTests) {
      console.log('');
      console.log(chalk.yellow.bold(`  ├─ TESTING`));
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
      
      testResult = await testerAgent.runTests(codeForReview, designDoc);
      
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
        
        // Show all issues
        if (testResult.bugs.length > 0) {
          console.log('');
          console.log(chalk.white('     All Issues:'));
          testResult.bugs.forEach((bug, i) => {
            const severity = bug.severity === 'critical' ? chalk.red('🔴') : 
                           bug.severity === 'high' ? chalk.yellow('🟡') : chalk.gray('⚪');
            console.log(`       ${severity} ${bug.file}: ${bug.description}`);
          });
        }
        
        // ASK IF USER WANTS CODER TO FIX THE BUGS
        console.log('');
        const fixBugs = await askConfirmation(rl, chalk.yellow('  Have Coder Agent fix these issues? (y/n): '));
        
        if (fixBugs) {
          console.log('');
          printStep(icons.coder, 'Coder Agent fixing issues...');
          
          // Convert test bugs to the format fixBugs expects
          const bugsToFix = testResult.bugs.map(b => ({
            file: b.file,
            issue: b.description,
            fix: `Fix this ${b.severity} issue`
          }));
          
          const fixResult = await coderAgent.fixBugs(bugsToFix, designDoc);
          
          if (fixResult.success && fixResult.operations) {
            for (const op of fixResult.operations) {
              if (op.path && op.content) {
                const outputPath = path.join(currentProject, op.path);
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, op.content);
                console.log(chalk.gray(`  ${icons.success} Fixed ${op.path}`));
              }
            }
            printStep(icons.success, chalk.green('Bug fixes applied!'));
          } else {
            printStep(icons.error, chalk.yellow('Could not fix all bugs'));
          }
        }
      } else {
        printStep(icons.success, chalk.green('Tests passed!'), chalk.gray('No critical issues'));
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // PHASE 4: REVIEW (if selected)
    // ═══════════════════════════════════════════════════════════
    if (runReview) {
      console.log('');
      console.log(chalk.yellow.bold(`  └─ REVIEW`));
      printStep(icons.review, 'Reviewer Agent final check...');
      
      // Gather code for review
      const codeForReview = new Map<string, string>();
      for (const filePath of filesWrittenFull) {
        try {
          const fullPath = path.join(currentProject, filePath);
          const content = fs.readFileSync(fullPath, 'utf-8');
          codeForReview.set(filePath, content);
        } catch {}
      }
      
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
      
      // Show missing items if any
      if (reviewResult.missingItems && reviewResult.missingItems.length > 0) {
        console.log('');
        console.log(chalk.white('     Missing Items:'));
        reviewResult.missingItems.slice(0, 5).forEach((s: string) => {
          console.log(chalk.gray(`       • ${s}`));
        });
      }
    }
    
    // Final status (only if tests/review were run)
    if (runTests || runReview) {
      console.log('');
      console.log(chalk.cyan('━'.repeat(60)));
      const statusText = runReview ? (runTests ? chalk.green('✓ Tested & Reviewed') : chalk.cyan('✓ Reviewed')) : 
                         runTests ? chalk.yellow('✓ Tested') : '';
      console.log(chalk.gray(`  ${statusText}`));
      console.log('');
    }
    
  } catch (error) {
    clearLine();
    console.log('');
    printStep(icons.error, chalk.red(`Error: ${error}`));

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

// Main build dispatcher - AUTO-DETECTS complexity using AI
async function buildProject(prompt: string, rl: readline.Interface): Promise<void> {
  // Go straight to full pipeline - Haiku already decided this is complex
  await buildProjectFull(prompt, rl);
}

// Helper to ask for confirmation
function askConfirmation(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Helper to ask a question and get the answer
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// ============ CHAT FUNCTION (with context and tools) ============

async function chat(message: string): Promise<void> {
  if (!coderAgent) {
    coderAgent = initializeCoderAgent();
  }

  isProcessing = true;
  
  // Add user message to history
  addToHistory('user', message);
  
  console.log('');
  
  let response = '';
  
  try {
    // Check if user is referencing an image
    const imageMatch = message.match(/(?:check|look at|view|see|analyze|open)\s+(.+\.(?:png|jpg|jpeg|gif|webp))/i) 
      || message.match(/(.+\.(?:png|jpg|jpeg|gif|webp))/i);
    
    if (imageMatch) {
      // Handle image vision request
      const imagePath = imageMatch[1].trim();
      const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(currentProject, imagePath);
      
      if (fs.existsSync(fullPath)) {
        process.stdout.write(chalk.cyan('  🖼️  Analyzing image...'));
        
        const imageBuffer = fs.readFileSync(fullPath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(fullPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' 
          : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
          : 'image/jpeg';
        
        const visionPrompt = `Analyze this image. ${message}

If the user is asking to create a UI like this image, describe in detail:
1. Layout structure (header, sidebar, main content, etc.)
2. Color scheme (background, text, accents)
3. UI components visible (buttons, inputs, cards, etc.)
4. Typography and spacing
5. Any specific design patterns

Then provide actionable guidance on how to recreate it.`;
        
        // Stream directly to terminal
        let firstChunk = true;
        console.log('');
        process.stdout.write('  ');
        
        const result = await coderAgent.chatWithVision(
          visionPrompt,
          base64,
          mimeType,
          (chunk: string, done: boolean) => {
            if (!done && chunk) {
              response += chunk;
              process.stdout.write(chalk.white(chunk));
            }
          }
        );
        
        console.log('\n');
        
        addToHistory('assistant', response, result?.tokensUsed);
        
        isProcessing = false;
        return;
      }
    }
    
    // Build context from conversation history
    const conversationContext = buildConversationContext();
    const hasContext = conversationHistory.length > 1;
    
    // Detect if this is a fix/edit request
    const isFixRequest = /\b(fix|debug|repair|broken|not working|doesn't work|error|bug|issue|wrong)\b/i.test(message);
    const isEditRequest = /\b(update|change|modify|edit|refactor|improve|add to|remove from)\b/i.test(message);
    
    // Initialize memory manager if not done
    if (!memoryManager) {
      memoryManager = createMemoryManager(currentProject);
    }
    
    // Get memory context
    const memoryContext = memoryManager.hasMemory() ? memoryManager.readMemory() : '';
    
    // Get todo context
    const todoContext = todoManager ? todoManager.toContext() : '';
    
    // Claude Code style system prompt
    const prompt = `${CLAUDE_CODE_SYSTEM_PROMPT}

# Environment
Working directory: ${currentProject}
Is git repo: ${isGitRepo() ? 'Yes' : 'No'}
Platform: ${process.platform}
Today's date: ${new Date().toLocaleDateString()}

# Available Tools
- list_directory: List folder contents
- read_file: Read file contents (ALWAYS use before editing)
- search_in_files: Search for text patterns
- file_exists: Check if file exists  
- write_file: Create or update files
- run_command: Execute shell commands
- web_search: Search the web
- fetch_url: Fetch webpage content

${memoryContext ? `# Project Memory (from AHURA.md)\n${memoryContext}\n` : ''}
${todoContext ? `# Current Tasks\n${todoContext}\n` : ''}
${isFixRequest || isEditRequest ? `# CRITICAL: FIX/EDIT REQUEST
You MUST read the file first before editing. Do NOT create new files when fixing.
1. Use read_file to see current content
2. Make targeted, minimal changes
3. Use write_file to save the fix
` : ''}
${hasContext ? `# Previous conversation\n${conversationContext}\n` : ''}
User: ${message}`;
    
    // Stream directly to terminal - Claude Code style
    let isFirstChunk = true;
    
    const result = await coderAgent.chatWithTools(
      prompt,
      (chunk: string, done: boolean) => {
        if (!done && chunk) {
          if (chunk.startsWith('__TOOL__')) {
            const progressInfo = chunk.replace('__TOOL__', '');
            if (!isFirstChunk) {
              process.stdout.write('\n');
            }
            process.stdout.write(chalk.gray(`  ${progressInfo}\r`));
          } else {
            if (isFirstChunk) {
              console.log('');
              process.stdout.write('  ');
              isFirstChunk = false;
            }
            response += chunk;
            process.stdout.write(chalk.white(chunk));
          }
        }
      },
      undefined,
      true
    );
    
    if (!isFirstChunk) {
      console.log('');
    }
    
    addToHistory('assistant', response, result?.tokensUsed);
    
    // Show context bar (concise)
    console.log(chalk.gray(`  ${getContextBar(sessionStats.totalTokens)}`));
  } catch (error) {
    console.log('');
    printStep(icons.error, `${error}`);
  } finally {
    isProcessing = false;
  }
}

// ============ STATUS, HISTORY & HELP ============

function showStatus(): void {
  const uptime = Math.floor((Date.now() - sessionStats.startTime.getTime()) / 1000);
  const minutes = Math.floor(uptime / 60);
  const seconds = uptime % 60;
  
  console.log('');
  console.log(chalk.bold.white('  📊 Session Status'));
  console.log(chalk.gray('  ' + '─'.repeat(45)));
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

async function compactHistory(instructions?: string): Promise<void> {
  if (conversationHistory.length <= 2) {
    console.log(chalk.yellow('  Not enough history to compact'));
    return;
  }
  
  console.log(chalk.gray('  Compacting conversation...'));
  
  // Keep first and last 2 messages, the rest is summarized
  const kept = [
    ...conversationHistory.slice(0, 1),
    ...conversationHistory.slice(-2)
  ];
  
  const compactedCount = conversationHistory.length - kept.length;
  conversationHistory = kept;
  
  console.log(chalk.green(`  ✓ Compacted ${compactedCount} messages from history`));
  if (contextSummarizer.hasSummary()) {
    console.log(chalk.gray('    Summary preserved for context'));
  }
  if (instructions) {
    console.log(chalk.gray(`    Focus: ${instructions}`));
  }
}

function showHelp(): void {
  console.log(`
${chalk.bold.cyan('  Ahura')} ${chalk.gray('- Claude Code style AI assistant')}
${chalk.gray('  ' + '─'.repeat(50))}

${chalk.white('  Usage:')} ${chalk.gray('Just type what you want to do')}
    ${chalk.green('> fix the bug in server.js')}
    ${chalk.green('> explain this code')}  
    ${chalk.green('> create a REST API')}

${chalk.white('  Key Behaviors:')}
    - ${chalk.gray('Concise responses (< 4 lines unless you ask for detail)')}
    - ${chalk.gray('Always reads files before editing')}
    - ${chalk.gray('Uses tools in parallel for speed')}
    - ${chalk.gray('No code comments unless asked')}

${chalk.white('  Commands:')}
    ${chalk.cyan('/status')}        Session info
    ${chalk.cyan('/todo')}          View current tasks  
    ${chalk.cyan('/memory')}        View/edit project memory (AHURA.md)
    ${chalk.cyan('/compact')}       Compact conversation history
    ${chalk.cyan('/clear')}         Clear conversation
    ${chalk.cyan('/cd <path>')}     Change directory
    ${chalk.cyan('/ls')}            List files
    ${chalk.cyan('/map')}           Show project structure
    ${chalk.cyan('/undo')}          Revert last changes (git)
    ${chalk.cyan('/init')}          Initialize AHURA.md memory file
    ${chalk.cyan('/help')}          Show this help
    ${chalk.cyan('/exit')}          Exit

${chalk.gray('  Working in: ' + currentProject)}
`);
}

// Show todos
function showTodos(): void {
  if (!todoManager) {
    todoManager = createTodoManager();
  }
  
  console.log('');
  console.log(chalk.white('  Tasks'));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
  console.log('  ' + todoManager.format());
  console.log('');
}

// Show/edit memory
function showMemory(): void {
  if (!memoryManager) {
    memoryManager = createMemoryManager(currentProject);
  }
  
  console.log('');
  console.log(chalk.white('  Project Memory'));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
  
  if (!memoryManager.hasMemory()) {
    console.log(chalk.gray('  No AHURA.md file found.'));
    console.log(chalk.gray('  Use /init to create one.'));
  } else {
    const content = memoryManager.readMemory();
    const lines = content.split('\n').slice(0, 20);
    for (const line of lines) {
      console.log(chalk.gray('  ' + line));
    }
    if (content.split('\n').length > 20) {
      console.log(chalk.gray('  ... (truncated)'));
    }
  }
  console.log('');
}

// Initialize memory file
function initMemory(): void {
  if (!memoryManager) {
    memoryManager = createMemoryManager(currentProject);
  }
  
  if (memoryManager.hasMemory()) {
    console.log(chalk.yellow('  AHURA.md already exists'));
  } else {
    memoryManager.initializeMemory();
    console.log(chalk.green('  ✓ Created AHURA.md'));
    console.log(chalk.gray('  Edit this file to store project context.'));
  }
}

// Show available tools (Claude Code style - concise)
function showTools(): void {
  if (toolRegistry.getAll().length === 0) {
    registerAllTools();
  }
  
  const tools = toolRegistry.getAll();
  
  console.log('');
  console.log(chalk.white('  Tools'));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
  
  for (const tool of tools) {
    console.log(chalk.cyan(`  ${tool.name}`) + chalk.gray(` - ${tool.description.slice(0, 50)}${tool.description.length > 50 ? '...' : ''}`));
  }
  
  console.log('');
}

// ============ INPUT PROCESSING ============

async function processInput(input: string, rl: readline.Interface): Promise<boolean> {
  const trimmed = input.trim();
  
  if (!trimmed) return true;

  if (isShutdownInProgress()) {
    console.log(chalk.yellow('  Shutting down...'));
    return false;
  }
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

      case 'context':
        console.log('');
        console.log(chalk.bold.white(`  ${icons.context} Context Window Status`));
        console.log(chalk.gray('  ' + '─'.repeat(45)));
        const ctx = contextSummarizer.getContext();
        console.log(`  ${chalk.gray('Messages in memory:')}  ${chalk.white(String(contextSummarizer.getMessageCount()))}`);
        console.log(`  ${chalk.gray('Recent messages:')}     ${chalk.white(String(ctx.recentMessages.length))}`);
        console.log(`  ${chalk.gray('Estimated tokens:')}    ${chalk.white(String(ctx.totalTokens))}`);
        console.log(`  ${chalk.gray('Summary active:')}      ${ctx.summary ? chalk.green('Yes') : chalk.gray('No')}`);
        if (ctx.summary) {
          console.log(`  ${chalk.gray('Summary preview:')}     ${chalk.cyan(ctx.summary.substring(0, 80) + '...')}`);
        }
        console.log('');
        break;

      case 'compact':
        await compactHistory(args || undefined);
        break;

      case 'todo':
      case 'todos':
        showTodos();
        break;

      case 'memory':
        showMemory();
        break;

      case 'init':
        initMemory();
        break;

      case 'tools':
        showTools();
        break;

      case 'clear':
        conversationHistory = []; // Clear conversation too
        contextSummarizer.clear(); // Also clear summarizer
        console.clear();
        showBanner();
        console.log(chalk.gray('  Conversation cleared.\n'));
        break;

      case 'reset':
        conversationHistory = [];
        contextSummarizer.clear(); // Also clear summarizer
        sessionStats = {
          totalTokens: 0,
          totalMessages: 0,
          filesCreated: [],
          filesModified: [],
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
            // Sync tools' working directory with CLI
            const { setWorkingDirectory } = await import('./tools/fileTools.js');
            setWorkingDirectory(resolved);
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
            console.log(chalk.gray('  (empty)'));
          } else {
            items.forEach(item => {
              const fullPath = path.join(currentProject, item);
              const isDir = fs.statSync(fullPath).isDirectory();
              console.log(isDir ? chalk.blue(`  ${item}/`) : chalk.white(`  ${item}`));
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

      case 'map':
        console.log(chalk.cyan('\n  Repository Map\n'));
        try {
          const repoMap = generateRepoMap(currentProject, 4, 100);
          const lines = repoMap.split('\n');
          for (const line of lines) {
            console.log(chalk.gray(`  ${line}`));
          }
          console.log('');
        } catch (e) {
          console.log(chalk.red('  ✗ Could not generate map'));
        }
        break;

      case 'undo':
        if (!isGitRepo()) {
          console.log(chalk.yellow('  ⚠ Not a git repository - cannot undo'));
        } else {
          try {
            // Get last commit message to show what we're undoing
            const lastMsg = execSync('git log -1 --pretty=%s', { cwd: currentProject, encoding: 'utf-8' }).trim();
            if (lastMsg.startsWith('[Ahura]')) {
              execSync('git reset --hard HEAD~1', { cwd: currentProject, stdio: 'pipe' });
              console.log(chalk.green(`  ✓ Reverted: ${lastMsg}`));
            } else {
              console.log(chalk.yellow('  ⚠ Last commit was not made by Ahura'));
              console.log(chalk.gray(`    Last commit: ${lastMsg}`));
            }
          } catch {
            console.log(chalk.red('  ✗ Failed to undo - no commits to revert'));
          }
        }
        break;

      default:
        console.log(chalk.yellow(`  Unknown command: /${command}`));
        console.log(chalk.gray('  Type /help for available commands'));
    }
    
    return true;
  }

  // Validate user input
  const validation = validatePrompt(trimmed);
  if (!validation.valid) {
    console.log(chalk.yellow(`  ⚠ ${validation.error}`));
    return true;
  }
  
  // Use sanitized input
  const sanitizedInput = validation.sanitized || trimmed;

  // Check for agent tags (@coder, @tester, @planner, @reviewer)
  const hasAgentTag = sanitizedInput.match(/^@(coder|tester|planner|reviewer)\s+/i);
  
  if (hasAgentTag) {
    const parsed = parseAgentTag(sanitizedInput);
    await chatWithAgent(parsed.agent, parsed.message);
    return true;
  }
  
  // Check if it's a build/create/modify request that needs file operations
  const lowerInput = sanitizedInput.toLowerCase();
  
  // Keywords that indicate EXPLANATION/QUESTION (should NOT create files)
  const explainKeywords = [
    'explain', 'what is', 'what does', 'how does', 'how do', 'why', 'tell me',
    'describe', 'show me', 'help me understand', 'walk me through',
    'analyze', 'analyse', 'summarize', 'summarise', 'overview',
    'list', 'what are', 'can you tell', 'could you tell'
  ];
  
  // If user wants explanation, ALWAYS use chat (no file creation)
  const wantsExplanation = explainKeywords.some(kw => lowerInput.includes(kw));
  if (wantsExplanation) {
    await chat(sanitizedInput);
    return true;
  }
  
  // Use AI (Haiku) to decide complexity for everything else
  printProgress('Analyzing request...');
  const analysis = await analyzePromptComplexity(sanitizedInput);
  lastDetectedComplexity = analysis;
  clearLine();
  
  if (analysis.complexity === 'full') {
    // Complex task → use full pipeline with planner
    await buildProject(sanitizedInput, rl);
  } else {
    // Quick task → use chat with tools
    await chat(sanitizedInput);
  }

  return true;
}

// ============ MAIN ============

function showBanner() {
  console.log(chalk.cyan(`
   █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗ 
  ██╔══██╗██║  ██║██║   ██║██╔══██╗██╔══██╗
  ███████║███████║██║   ██║██████╔╝███████║
  ██╔══██║██╔══██║██║   ██║██╔══██╗██╔══██║
  ██║  ██║██║  ██║╚██████╔╝██║  ██║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
`));
  console.log(chalk.gray(`  Ahurasense AI`) + chalk.white.bold(` • AI-Powered Code Generation`));
  console.log(chalk.dim(`  Type /help for commands\n`));
}

async function main(): Promise<void> {
  showBanner();

  // Check API key
  const hasApiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!hasApiKey) {
    console.log(chalk.yellow('  ⚠ Configuration required'));
    console.log(chalk.gray('  Please contact your administrator to configure the AI service.\n'));
    process.exit(1);
  }

  // Show working directory cleanly
  console.log(chalk.gray(`  📁 ${path.basename(currentProject)}`));
  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  // Register graceful shutdown handlers
  onShutdown(() => {
    console.log(chalk.gray('  Cleaning up...'));
    // Save any session state if needed
    if (conversationHistory.length > 0) {
      console.log(chalk.gray(`  Session had ${conversationHistory.length} messages, ${sessionStats.totalTokens} tokens used.`));
    }
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    if (isProcessing) {
      shouldAbort = true;
      clearLine();
      console.log(chalk.yellow('\n  Aborting current operation...'));
      console.log(chalk.gray('  Press Ctrl+C again to exit completely.'));
    } else {
      console.log(chalk.gray('\n  Goodbye! 👋\n'));
      rl.close();
      process.exit(0);
    }
  });

  const showPrompt = () => {
    const dir = path.basename(currentProject);
    // Show icon based on last detected complexity
    const modeIcon = lastDetectedComplexity 
      ? (lastDetectedComplexity.complexity === 'full' ? chalk.magenta('🏗️') : chalk.yellow('⚡'))
      : chalk.blue('🤖');
    const contextIndicator = conversationHistory.length > 0 
      ? chalk.green('●') 
      : chalk.gray('○');
    rl.setPrompt(chalk.cyan(`${modeIcon}${contextIndicator} ${dir} ❯ `));
    rl.prompt();
  };

  showPrompt();

  rl.on('line', async (line) => {
    try {
      const continueLoop = await processInput(line, rl);
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
