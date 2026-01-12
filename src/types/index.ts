/**
 * Agent Orchestra - Type Definitions
 * Core types for the multi-agent orchestration system
 */

// ============ Agent Types ============

export type AgentRole = 'planner' | 'coder' | 'tester' | 'reviewer';

export type AgentModel = 
  | 'claude-opus-4-20250514'         // Planner - high reasoning
  | 'claude-sonnet-4-20250514'       // Coder & Reviewer - fast execution
  | 'gpt-4o'                         // Tester - adversarial testing (different provider)
  | 'o1-preview';                    // Alternative reasoning model

export interface AgentConfig {
  name: string;
  role: AgentRole;
  model: AgentModel;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentName?: string;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  agentName: string;
  role: AgentRole;
  tokensUsed?: number;
  duration?: number;
  error?: string;
}

// ============ Task & Project Types ============

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: AgentRole;
  dependencies: string[];
  retryCount: number;
  maxRetries: number;
  output?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export type TaskStatus = 
  | 'pending' 
  | 'in-progress' 
  | 'completed' 
  | 'failed' 
  | 'blocked'
  | 'needs-simplification';

export interface ProjectPlan {
  projectName: string;
  description: string;
  scaffoldCommand?: string | null;
  postScaffoldCommands?: string[];
  architecture: ArchitectureSpec;
  tasks: Task[];
  fileTree: FileTreeNode[];
  techStack: TechStack;
  createdAt: Date;
  status: ProjectStatus;
}

export type ProjectStatus = 
  | 'planning' 
  | 'development' 
  | 'testing' 
  | 'review' 
  | 'completed' 
  | 'failed';

export interface ArchitectureSpec {
  overview: string;
  components: ComponentSpec[];
  dataFlow: string;
  apiEndpoints?: ApiEndpoint[];
  databaseSchema?: DatabaseSchema;
}

export interface ComponentSpec {
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'utility';
  description: string;
  files: string[];
  dependencies: string[];
}

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
}

export interface DatabaseSchema {
  type: 'sql' | 'nosql' | 'graph';
  tables?: TableSchema[];
  collections?: CollectionSchema[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  relations?: string[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: string;
}

export interface CollectionSchema {
  name: string;
  fields: Record<string, string>;
}

export interface TechStack {
  frontend?: string[];
  backend?: string[];
  database?: string[];
  devOps?: string[];
  testing?: string[];
}

// ============ File System Types ============

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileTreeNode[];
  content?: string;
  language?: string;
}

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'read';
  path: string;
  content?: string;
  reason?: string;
}

export interface FileSystemState {
  rootDir: string;
  files: Map<string, string>;
  directories: Set<string>;
}

// ============ Design Document Types ============

export interface DesignDocument {
  projectName: string;
  version: string;
  lastUpdated: Date;
  sections: DesignSection[];
  variables: Record<string, string>;
  decisions: DesignDecision[];
}

export interface DesignSection {
  title: string;
  content: string;
  updatedBy: AgentRole;
  updatedAt: Date;
}

export interface DesignDecision {
  id: string;
  decision: string;
  rationale: string;
  madeBy: AgentRole;
  timestamp: Date;
  relatedTo?: string[];
}

// ============ Testing Types ============

export interface TestResult {
  testId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  suggestions?: string[];
}

export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  file: string;
  line?: number;
  description: string;
  recommendation: string;
}

export interface CodeReviewResult {
  file: string;
  issues: CodeIssue[];
  suggestions: string[];
  approved: boolean;
}

export interface CodeIssue {
  type: 'bug' | 'style' | 'performance' | 'security' | 'logic';
  severity: 'error' | 'warning' | 'info';
  line: number;
  message: string;
  suggestion?: string;
}

// ============ Orchestration Types ============

export interface OrchestratorConfig {
  maxRetryAttempts: number;
  contextWindowLimit: number;
  enableFileSystemAccess: boolean;
  outputDir: string;
  designDocPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface OrchestratorState {
  currentPhase: ProjectStatus;
  activeAgent: AgentRole | null;
  taskQueue: Task[];
  completedTasks: Task[];
  failedTasks: Task[];
  retryHistory: RetryRecord[];
}

export interface RetryRecord {
  taskId: string;
  attemptNumber: number;
  error: string;
  timestamp: Date;
  resolution?: string;
}

export interface AgentCommunication {
  from: AgentRole;
  to: AgentRole;
  type: 'task-assignment' | 'task-result' | 'clarification' | 'escalation';
  payload: unknown;
  timestamp: Date;
}

// ============ CLI Types ============

export interface CLIOptions {
  prompt?: string;
  config?: string;
  output?: string;
  verbose?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
}

export interface ProjectInput {
  prompt: string;
  constraints?: string[];
  preferences?: Record<string, string>;
}

// ============ Logging Types ============

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  agent?: AgentRole;
  timestamp: Date;
  data?: unknown;
}
