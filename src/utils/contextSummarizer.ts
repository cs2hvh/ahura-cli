/**
 * Context Summarization
 * 
 * Manages conversation history and summarizes older messages
 * to prevent context overflow while preserving important information.
 */

import OpenAI from 'openai';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
}

export interface ContextWindow {
  recentMessages: ConversationMessage[];
  summary: string | null;
  totalTokens: number;
}

// Rough token estimation (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Context Manager - handles conversation history with smart summarization
 */
export class ContextSummarizer {
  private messages: ConversationMessage[] = [];
  private summary: string | null = null;
  private maxRecentMessages: number;
  private maxTokens: number;
  private summarizeThreshold: number;
  private openrouter: OpenAI | null = null;
  
  constructor(options: {
    maxRecentMessages?: number;
    maxTokens?: number;
    summarizeThreshold?: number;
  } = {}) {
    this.maxRecentMessages = options.maxRecentMessages || 10;
    this.maxTokens = options.maxTokens || 8000;
    this.summarizeThreshold = options.summarizeThreshold || 6000;
    
    // Initialize API client for summarization
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openrouter = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/ahurasense',
        }
      });
    }
  }
  
  /**
   * Add a message to the conversation history
   */
  addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({
      role,
      content,
      timestamp: new Date(),
      tokens: estimateTokens(content)
    });
    
    // Check if we need to summarize
    this.checkAndSummarize();
  }
  
  /**
   * Get the current context window
   */
  getContext(): ContextWindow {
    const totalTokens = this.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    
    return {
      recentMessages: this.messages.slice(-this.maxRecentMessages),
      summary: this.summary,
      totalTokens
    };
  }
  
  /**
   * Build context string for the AI
   */
  buildContextString(): string {
    const parts: string[] = [];
    
    // Add summary of older conversation if exists
    if (this.summary) {
      parts.push(`CONVERSATION SUMMARY (older messages):\n${this.summary}\n`);
    }
    
    // Add recent messages
    const recent = this.messages.slice(-this.maxRecentMessages);
    if (recent.length > 0) {
      parts.push('RECENT CONVERSATION:');
      for (const msg of recent) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        // Truncate very long messages in context
        const content = msg.content.length > 500 
          ? msg.content.substring(0, 500) + '...[truncated]'
          : msg.content;
        parts.push(`${role}: ${content}`);
      }
    }
    
    return parts.join('\n');
  }
  
  /**
   * Check if summarization is needed and perform it
   */
  private async checkAndSummarize(): Promise<void> {
    const totalTokens = this.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    
    // Only summarize if we exceed threshold and have enough messages
    if (totalTokens < this.summarizeThreshold || this.messages.length < this.maxRecentMessages + 3) {
      return;
    }
    
    // Messages to summarize (older ones, not recent)
    const toSummarize = this.messages.slice(0, -this.maxRecentMessages);
    if (toSummarize.length < 3) return;
    
    try {
      const newSummary = await this.summarizeMessages(toSummarize);
      if (newSummary) {
        // Update summary (append to existing if present)
        if (this.summary) {
          this.summary = `${this.summary}\n\nLATER: ${newSummary}`;
        } else {
          this.summary = newSummary;
        }
        
        // Remove summarized messages, keeping only recent
        this.messages = this.messages.slice(-this.maxRecentMessages);
      }
    } catch {
      // Fallback: just truncate old messages without summary
      if (this.messages.length > this.maxRecentMessages * 2) {
        this.messages = this.messages.slice(-this.maxRecentMessages);
      }
    }
  }
  
  /**
   * Summarize a batch of messages using fast model
   */
  private async summarizeMessages(messages: ConversationMessage[]): Promise<string | null> {
    if (!this.openrouter) return null;
    
    const conversation = messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${m.content.substring(0, 300)}`;
    }).join('\n');
    
    try {
      const response = await this.openrouter.chat.completions.create({
        model: 'anthropic/claude-haiku-4.5', // Fast & cheap
        max_tokens: 300,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Summarize this conversation in 2-3 sentences, focusing on: 1) What the user wanted to build/do, 2) What was created/modified, 3) Any important decisions or constraints. Be concise.'
          },
          {
            role: 'user',
            content: conversation
          }
        ]
      });
      
      return response.choices?.[0]?.message?.content || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.messages = [];
    this.summary = null;
  }
  
  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }
  
  /**
   * Check if summary exists
   */
  hasSummary(): boolean {
    return this.summary !== null;
  }
}

// Singleton instance
let _summarizer: ContextSummarizer | null = null;

export function getContextSummarizer(): ContextSummarizer {
  if (!_summarizer) {
    _summarizer = new ContextSummarizer();
  }
  return _summarizer;
}
