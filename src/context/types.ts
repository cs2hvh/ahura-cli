/**
 * Context Management Types
 * Type definitions for the context/memory management system
 */

/**
 * Model-specific configuration including context limits
 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'deepseek' | 'other';
  contextWindow: number;        // Total context window in tokens
  maxOutputTokens: number;      // Maximum output tokens
  costPer1kInput: number;       // Cost per 1K input tokens (USD)
  costPer1kOutput: number;      // Cost per 1K output tokens (USD)
  supportsTools: boolean;       // Whether model supports tool/function calling
  supportsVision: boolean;      // Whether model supports image input
}

/**
 * Token budget allocation for context management
 */
export interface TokenBudget {
  total: number;                // Total available tokens
  systemPrompt: number;         // Reserved for system prompt (~5%)
  summaryHistory: number;       // Reserved for summarized history (~20%)
  recentContext: number;        // Reserved for recent messages (~60%)
  currentQuery: number;         // Reserved for current query + response (~15%)
}

/**
 * A single message in the conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokenCount: number;
  agentName?: string;
  metadata?: {
    toolsUsed?: string[];
    filesModified?: string[];
    keyDecisions?: string[];
  };
}

/**
 * Summarized version of older conversation
 */
export interface ConversationSummary {
  id: string;
  createdAt: Date;
  messagesCount: number;        // How many messages were summarized
  tokenCount: number;           // Tokens in the summary
  originalTokenCount: number;   // Original tokens before summarization
  content: string;              // The actual summary text
  keyFacts: string[];           // Extracted key facts
  decisions: string[];          // Important decisions made
  filesCreated: string[];       // Files created/modified
  techStack?: string[];         // Technologies mentioned
}

/**
 * Working memory - critical facts to always include
 */
export interface WorkingMemory {
  projectName: string;
  projectDescription: string;
  techStack: string[];
  keyDecisions: string[];
  currentPhase: string;
  criticalConstraints: string[];
  recentFiles: string[];        // Recently modified files
  activeIssues: string[];       // Unresolved issues/bugs
  lastUpdated: Date;
}

/**
 * Full context state for an agent
 */
export interface ContextState {
  modelConfig: ModelConfig;
  tokenBudget: TokenBudget;
  workingMemory: WorkingMemory;
  summaries: ConversationSummary[];
  recentMessages: ConversationMessage[];
  totalTokensUsed: number;
  compactionCount: number;      // How many times context was compacted
}

/**
 * Options for context compaction
 */
export interface CompactionOptions {
  keepLastN: number;            // Keep last N messages verbatim
  targetTokens: number;         // Target token count after compaction
  preserveKeyFacts: boolean;    // Extract and preserve key facts
  summarizationModel: string;   // Model to use for summarization
}

/**
 * Result of a compaction operation
 */
export interface CompactionResult {
  success: boolean;
  tokensSaved: number;
  messagesCompacted: number;
  newSummary: ConversationSummary;
  error?: string;
}
