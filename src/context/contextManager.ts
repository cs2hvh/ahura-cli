/**
 * Context Manager
 * Orchestrates context management, compaction, and memory
 */

import {
  ModelConfig,
  TokenBudget,
  ConversationMessage,
  ConversationSummary,
  WorkingMemory,
  ContextState,
  CompactionOptions,
  CompactionResult
} from './types.js';
import { getModelConfig, calculateTokenBudget, shouldCompact } from './modelConfigs.js';
import { TokenCounter, estimateTokens, formatTokenCount } from './tokenCounter.js';
import { Summarizer, getSummarizer } from './summarizer.js';
import { logger } from '../utils/logger.js';

/**
 * Default working memory
 */
function createDefaultWorkingMemory(): WorkingMemory {
  return {
    projectName: '',
    projectDescription: '',
    techStack: [],
    keyDecisions: [],
    currentPhase: 'initial',
    criticalConstraints: [],
    recentFiles: [],
    activeIssues: [],
    lastUpdated: new Date()
  };
}

/**
 * Context Manager - handles all context/memory operations for an agent
 */
export class ContextManager {
  private modelConfig: ModelConfig;
  private tokenBudget: TokenBudget;
  private tokenCounter: TokenCounter;
  private summarizer: Summarizer;
  
  private workingMemory: WorkingMemory;
  private summaries: ConversationSummary[] = [];
  private recentMessages: ConversationMessage[] = [];
  private messageIdCounter: number = 0;
  private compactionCount: number = 0;

  constructor(modelId: string) {
    this.modelConfig = getModelConfig(modelId);
    this.tokenBudget = calculateTokenBudget(this.modelConfig);
    this.tokenCounter = new TokenCounter(this.modelConfig.provider);
    this.summarizer = getSummarizer();
    this.workingMemory = createDefaultWorkingMemory();

    logger.debug(
      `ContextManager initialized for ${this.modelConfig.name}: ` +
      `${formatTokenCount(this.modelConfig.contextWindow)} context, ` +
      `budget: ${formatTokenCount(this.tokenBudget.recentContext)} recent`
    );
  }

  /**
   * Update model (e.g., when user switches models)
   */
  updateModel(modelId: string): void {
    const oldConfig = this.modelConfig;
    this.modelConfig = getModelConfig(modelId);
    this.tokenBudget = calculateTokenBudget(this.modelConfig);
    this.tokenCounter = new TokenCounter(this.modelConfig.provider);

    logger.info(
      `Model changed: ${oldConfig.name} → ${this.modelConfig.name} ` +
      `(${formatTokenCount(oldConfig.contextWindow)} → ${formatTokenCount(this.modelConfig.contextWindow)})`
    );

    // Check if we need to compact due to smaller context window
    if (this.getTotalTokens() > this.tokenBudget.total * 0.7) {
      logger.warn('New model has smaller context, triggering compaction');
      this.compact();
    }
  }

  /**
   * Add a message to the conversation
   */
  addMessage(role: 'user' | 'assistant' | 'system', content: string, agentName?: string): ConversationMessage {
    const tokenCount = this.tokenCounter.count(content);
    
    const message: ConversationMessage = {
      id: `msg-${++this.messageIdCounter}`,
      role,
      content,
      timestamp: new Date(),
      tokenCount,
      agentName
    };

    this.recentMessages.push(message);

    // Check if compaction needed
    if (shouldCompact(this.getTotalTokens(), this.modelConfig)) {
      logger.info('Context threshold reached, triggering compaction');
      this.compact();
    }

    return message;
  }

  /**
   * Get total tokens currently in context
   */
  getTotalTokens(): number {
    const summaryTokens = this.summaries.reduce((sum, s) => sum + s.tokenCount, 0);
    const recentTokens = this.recentMessages.reduce((sum, m) => sum + m.tokenCount, 0);
    const memoryTokens = this.tokenCounter.count(this.serializeWorkingMemory());
    
    return summaryTokens + recentTokens + memoryTokens;
  }

  /**
   * Get context state for debugging/display
   */
  getState(): ContextState {
    return {
      modelConfig: this.modelConfig,
      tokenBudget: this.tokenBudget,
      workingMemory: this.workingMemory,
      summaries: [...this.summaries],
      recentMessages: [...this.recentMessages],
      totalTokensUsed: this.getTotalTokens(),
      compactionCount: this.compactionCount
    };
  }

  /**
   * Get context percentage used
   */
  getUsagePercentage(): number {
    return Math.round((this.getTotalTokens() / this.tokenBudget.total) * 100);
  }

  /**
   * Build the context to inject into a prompt
   */
  buildContext(): string {
    const sections: string[] = [];

    // 1. Working Memory (always included if non-empty)
    const memoryStr = this.serializeWorkingMemory();
    if (memoryStr) {
      sections.push(`<working_memory>\n${memoryStr}\n</working_memory>`);
    }

    // 2. Summarized History (if any)
    if (this.summaries.length > 0) {
      const summaryContent = this.summaries.map(s => s.content).join('\n\n---\n\n');
      sections.push(`<conversation_history_summary>\n${summaryContent}\n</conversation_history_summary>`);
    }

    // 3. Recent Messages (verbatim)
    if (this.recentMessages.length > 0) {
      const recentContent = this.recentMessages.map(m => {
        const prefix = m.agentName ? `[${m.agentName}]` : `[${m.role.toUpperCase()}]`;
        return `${prefix}:\n${m.content}`;
      }).join('\n\n');
      sections.push(`<recent_conversation>\n${recentContent}\n</recent_conversation>`);
    }

    return sections.join('\n\n');
  }

  /**
   * Compact the context by summarizing older messages
   */
  async compact(options?: Partial<CompactionOptions>): Promise<CompactionResult> {
    const defaultOptions: CompactionOptions = {
      keepLastN: 6,  // Keep last 6 messages verbatim
      targetTokens: Math.floor(this.tokenBudget.total * 0.5),
      preserveKeyFacts: true,
      summarizationModel: 'anthropic/claude-haiku-4.5'
    };

    const opts = { ...defaultOptions, ...options };
    
    // If not enough messages to compact, skip
    if (this.recentMessages.length <= opts.keepLastN) {
      return {
        success: true,
        tokensSaved: 0,
        messagesCompacted: 0,
        newSummary: {
          id: 'skip',
          createdAt: new Date(),
          messagesCount: 0,
          tokenCount: 0,
          originalTokenCount: 0,
          content: '',
          keyFacts: [],
          decisions: [],
          filesCreated: []
        }
      };
    }

    const startTokens = this.getTotalTokens();

    try {
      // Split messages: older ones to summarize, recent ones to keep
      const messagesToSummarize = this.recentMessages.slice(0, -opts.keepLastN);
      const messagesToKeep = this.recentMessages.slice(-opts.keepLastN);

      // Summarize older messages
      const newSummary = await this.summarizer.summarize(messagesToSummarize, this.workingMemory);

      // Update working memory with extracted info
      const memoryUpdate = this.summarizer.extractWorkingMemory(newSummary, this.workingMemory);
      this.workingMemory = { ...this.workingMemory, ...memoryUpdate };

      // Add new summary and update recent messages
      this.summaries.push(newSummary);
      this.recentMessages = messagesToKeep;
      this.compactionCount++;

      const endTokens = this.getTotalTokens();
      const tokensSaved = startTokens - endTokens;

      logger.info(
        `Compaction complete: ${messagesToSummarize.length} messages summarized, ` +
        `${formatTokenCount(tokensSaved)} tokens saved (${this.getUsagePercentage()}% used)`
      );

      return {
        success: true,
        tokensSaved,
        messagesCompacted: messagesToSummarize.length,
        newSummary
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Compaction failed: ${errorMsg}`);

      // Fallback: just trim oldest messages
      if (this.recentMessages.length > opts.keepLastN * 2) {
        this.recentMessages = this.recentMessages.slice(-opts.keepLastN * 2);
      }

      return {
        success: false,
        tokensSaved: 0,
        messagesCompacted: 0,
        newSummary: {
          id: 'failed',
          createdAt: new Date(),
          messagesCount: 0,
          tokenCount: 0,
          originalTokenCount: 0,
          content: '',
          keyFacts: [],
          decisions: [],
          filesCreated: []
        },
        error: errorMsg
      };
    }
  }

  /**
   * Update working memory
   */
  updateWorkingMemory(update: Partial<WorkingMemory>): void {
    this.workingMemory = {
      ...this.workingMemory,
      ...update,
      lastUpdated: new Date()
    };
  }

  /**
   * Set project info in working memory
   */
  setProjectInfo(name: string, description: string, techStack: string[]): void {
    this.workingMemory.projectName = name;
    this.workingMemory.projectDescription = description;
    this.workingMemory.techStack = techStack;
    this.workingMemory.lastUpdated = new Date();
  }

  /**
   * Add a key decision
   */
  addDecision(decision: string): void {
    this.workingMemory.keyDecisions.push(decision);
    // Keep only last 20 decisions
    if (this.workingMemory.keyDecisions.length > 20) {
      this.workingMemory.keyDecisions = this.workingMemory.keyDecisions.slice(-20);
    }
  }

  /**
   * Add a file to recent files
   */
  addFile(filePath: string): void {
    if (!this.workingMemory.recentFiles.includes(filePath)) {
      this.workingMemory.recentFiles.push(filePath);
      // Keep only last 30 files
      if (this.workingMemory.recentFiles.length > 30) {
        this.workingMemory.recentFiles = this.workingMemory.recentFiles.slice(-30);
      }
    }
  }

  /**
   * Serialize working memory to string
   */
  private serializeWorkingMemory(): string {
    const m = this.workingMemory;
    const parts: string[] = [];

    if (m.projectName) {
      parts.push(`Project: ${m.projectName}`);
    }
    if (m.projectDescription) {
      parts.push(`Description: ${m.projectDescription}`);
    }
    if (m.techStack.length > 0) {
      parts.push(`Tech Stack: ${m.techStack.join(', ')}`);
    }
    if (m.currentPhase) {
      parts.push(`Current Phase: ${m.currentPhase}`);
    }
    if (m.keyDecisions.length > 0) {
      parts.push(`Key Decisions:\n${m.keyDecisions.map(d => `  • ${d}`).join('\n')}`);
    }
    if (m.criticalConstraints.length > 0) {
      parts.push(`Constraints:\n${m.criticalConstraints.map(c => `  • ${c}`).join('\n')}`);
    }
    if (m.recentFiles.length > 0) {
      parts.push(`Recent Files: ${m.recentFiles.slice(-10).join(', ')}`);
    }
    if (m.activeIssues.length > 0) {
      parts.push(`Active Issues:\n${m.activeIssues.map(i => `  • ${i}`).join('\n')}`);
    }

    return parts.join('\n');
  }

  /**
   * Clear all context (for new session)
   */
  clear(): void {
    this.workingMemory = createDefaultWorkingMemory();
    this.summaries = [];
    this.recentMessages = [];
    this.compactionCount = 0;
    logger.debug('Context cleared');
  }

  /**
   * Get a status summary for display
   */
  getStatusSummary(): string {
    const used = this.getTotalTokens();
    const total = this.tokenBudget.total;
    const percentage = this.getUsagePercentage();
    
    return `Context: ${formatTokenCount(used)}/${formatTokenCount(total)} (${percentage}%) | ` +
           `Messages: ${this.recentMessages.length} | Summaries: ${this.summaries.length} | ` +
           `Compactions: ${this.compactionCount}`;
  }
}

// Factory for creating context managers
const contextManagers: Map<string, ContextManager> = new Map();

/**
 * Get or create a context manager for an agent
 */
export function getContextManager(agentId: string, modelId: string): ContextManager {
  const key = `${agentId}-${modelId}`;
  
  if (!contextManagers.has(key)) {
    contextManagers.set(key, new ContextManager(modelId));
  }
  
  return contextManagers.get(key)!;
}

/**
 * Clear all context managers
 */
export function clearAllContextManagers(): void {
  contextManagers.forEach(cm => cm.clear());
  contextManagers.clear();
}
