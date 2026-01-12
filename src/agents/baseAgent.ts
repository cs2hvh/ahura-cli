/**
 * Base Agent Class
 * Abstract base class that all agents extend from
 * Supports streaming responses for real-time output
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { 
  AgentConfig, 
  AgentRole, 
  AgentResponse, 
  AgentMessage 
} from '../types/index.js';
import { getAnthropicApiKey, getOpenAIApiKey } from '../config/index.js';
import { logger } from '../utils/logger.js';

export type StreamCallback = (chunk: string, done: boolean) => void;

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected anthropic: Anthropic | null = null;
  protected openai: OpenAI | null = null;
  protected conversationHistory: AgentMessage[] = [];
  protected isInitialized: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Initialize the API client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (this.config.model.startsWith('claude')) {
        this.anthropic = new Anthropic({
          apiKey: getAnthropicApiKey()
        });
      } else if (this.config.model.startsWith('gpt') || this.config.model.startsWith('o1')) {
        this.openai = new OpenAI({
          apiKey: getOpenAIApiKey()
        });
      }
      this.isInitialized = true;
      logger.debug(`${this.config.name} initialized with model ${this.config.model}`, this.config.role);
    } catch (error) {
      logger.error(`Failed to initialize ${this.config.name}: ${error}`, this.config.role);
      throw error;
    }
  }

  /**
   * Get the agent's role
   */
  getRole(): AgentRole {
    return this.config.role;
  }

  /**
   * Get the agent's name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Send a message with streaming response
   */
  async chatStream(userMessage: string, onChunk: StreamCallback, context?: string): Promise<AgentResponse> {
    await this.initialize();

    const startTime = Date.now();

    try {
      const fullMessage = context 
        ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}`
        : userMessage;

      let responseContent = '';
      let tokensUsed = 0;

      if (this.anthropic) {
        const result = await this.callAnthropicStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else if (this.openai) {
        const result = await this.callOpenAIStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else {
        throw new Error('No API client initialized');
      }

      const duration = Date.now() - startTime;

      this.conversationHistory.push(
        { role: 'user', content: fullMessage, timestamp: new Date() },
        { role: 'assistant', content: responseContent, timestamp: new Date(), agentName: this.config.name }
      );

      return {
        success: true,
        content: responseContent,
        agentName: this.config.name,
        role: this.config.role,
        tokensUsed,
        duration
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onChunk(`\nError: ${errorMessage}`, true);
      
      return {
        success: false,
        content: '',
        agentName: this.config.name,
        role: this.config.role,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Anthropic streaming call
   */
  private async callAnthropicStream(message: string, onChunk: StreamCallback): Promise<{ content: string; tokensUsed: number }> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    let content = '';
    let tokensUsed = 0;

    const stream = this.anthropic.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: this.config.systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        content += chunk;
        onChunk(chunk, false);
      }
    }

    const finalMessage = await stream.finalMessage();
    tokensUsed = finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;
    
    onChunk('', true);
    return { content, tokensUsed };
  }

  /**
   * OpenAI streaming call
   */
  private async callOpenAIStream(message: string, onChunk: StreamCallback): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    let content = '';

    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: message }
      ],
      stream: true
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        content += text;
        onChunk(text, false);
      }
    }

    onChunk('', true);
    return { content, tokensUsed: 0 }; // OpenAI doesn't return token count in streaming
  }

  /**
   * Non-streaming chat (original method)
   */
  async chat(userMessage: string, context?: string): Promise<AgentResponse> {
    await this.initialize();

    const startTime = Date.now();

    try {
      const fullMessage = context 
        ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}`
        : userMessage;

      let responseContent: string;
      let tokensUsed: number | undefined;

      if (this.anthropic) {
        const response = await this.callAnthropic(fullMessage);
        responseContent = response.content;
        tokensUsed = response.tokensUsed;
      } else if (this.openai) {
        const response = await this.callOpenAI(fullMessage);
        responseContent = response.content;
        tokensUsed = response.tokensUsed;
      } else {
        throw new Error('No API client initialized');
      }

      const duration = Date.now() - startTime;

      this.conversationHistory.push(
        { role: 'user', content: fullMessage, timestamp: new Date() },
        { role: 'assistant', content: responseContent, timestamp: new Date(), agentName: this.config.name }
      );

      return {
        success: true,
        content: responseContent,
        agentName: this.config.name,
        role: this.config.role,
        tokensUsed,
        duration
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        content: '',
        agentName: this.config.name,
        role: this.config.role,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Non-streaming Anthropic call
   */
  private async callAnthropic(message: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: this.config.systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      content,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens
    };
  }

  /**
   * Non-streaming OpenAI call
   */
  private async callOpenAI(message: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: message }
      ]
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return { content, tokensUsed };
  }

  /**
   * Clear conversation history (for context management)
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.debug(`${this.config.name} conversation history cleared`, this.config.role);
  }

  /**
   * Get the last N messages from history
   */
  getRecentHistory(count: number): AgentMessage[] {
    return this.conversationHistory.slice(-count);
  }

  /**
   * Abstract method for processing specific task types
   */
  abstract processTask(task: string, context?: Record<string, unknown>): Promise<AgentResponse>;
}
