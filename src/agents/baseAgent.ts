/**
 * Base Agent Class
 * Abstract base class that all agents extend from
 * Supports OpenRouter (100+ models), Anthropic, and OpenAI
 * Now with tool calling capabilities!
 * Includes context management for long conversations
 * Includes retry with exponential backoff and timeouts
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { 
  AgentConfig, 
  AgentRole, 
  AgentResponse, 
  AgentMessage 
} from '../types/index.js';
import { getOpenRouterApiKey, getAnthropicApiKey, getOpenAIApiKey, getAvailableProvider } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { toolRegistry, registerAllTools } from '../tools/index.js';
import { ContextManager, getModelConfig, formatTokenCount } from '../context/index.js';
import { withRetry, withTimeout, TimeoutError } from '../utils/robustness.js';

// Default timeout for API calls (2 minutes)
const DEFAULT_API_TIMEOUT = 120000;

export type StreamCallback = (chunk: string, done: boolean) => void;

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected anthropic: Anthropic | null = null;
  protected openai: OpenAI | null = null;
  protected openrouter: OpenAI | null = null;
  protected provider: 'openrouter' | 'anthropic' | 'openai' | null = null;
  protected conversationHistory: AgentMessage[] = [];
  protected isInitialized: boolean = false;
  
  // Context management
  protected contextManager: ContextManager;
  protected contextEnabled: boolean = true;
  
  // API settings
  protected apiTimeout: number = DEFAULT_API_TIMEOUT;
  protected maxRetries: number = 3;

  constructor(config: AgentConfig) {
    this.config = config;
    // Initialize context manager with the model's config
    this.contextManager = new ContextManager(config.model);
  }

  /**
   * Enable/disable context management
   */
  setContextEnabled(enabled: boolean): void {
    this.contextEnabled = enabled;
  }

  /**
   * Get the context manager for external access
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get context usage status
   */
  getContextStatus(): string {
    return this.contextManager.getStatusSummary();
  }

  /**
   * Initialize the API client
   * Priority: OpenRouter > Anthropic > OpenAI
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.provider = getAvailableProvider();
      
      if (this.provider === 'openrouter') {
        // OpenRouter - supports 100+ models via OpenAI-compatible API
        this.openrouter = new OpenAI({
          apiKey: getOpenRouterApiKey(),
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://ahurasense.com',
            'X-Title': 'Ahura CLI'
          }
        });
        logger.debug(`${this.config.name} initialized with OpenRouter (${this.config.model})`, this.config.role);
      } else if (this.provider === 'anthropic') {
        // Direct Anthropic API
        this.anthropic = new Anthropic({
          apiKey: getAnthropicApiKey()
        });
        logger.debug(`${this.config.name} initialized with Anthropic (${this.config.model})`, this.config.role);
      } else if (this.provider === 'openai') {
        // Direct OpenAI API
        this.openai = new OpenAI({
          apiKey: getOpenAIApiKey()
        });
        logger.debug(`${this.config.name} initialized with OpenAI (${this.config.model})`, this.config.role);
      } else {
        throw new Error('No API key found. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY');
      }
      
      this.isInitialized = true;
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
   * Update the system prompt dynamically
   * Useful for injecting context like working directory, git status, memory files
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  /**
   * Quick one-shot completion without history/context management
   * Used for lightweight tasks like generating summaries
   */
  async quickCompletion(prompt: string): Promise<string> {
    await this.initialize();
    
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant. Be concise. Respond only with valid JSON.' },
      { role: 'user' as const, content: prompt }
    ];

    if (this.provider === 'openrouter' && this.openrouter) {
      const response = await this.openrouter.chat.completions.create({
        model: this.config.model,
        messages,
        max_tokens: 200,
        temperature: 0.3
      });
      return response.choices[0]?.message?.content || '';
    } else if (this.provider === 'anthropic' && this.anthropic) {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a helpful assistant. Be concise. Respond only with valid JSON.'
      });
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock && 'text' in textBlock ? textBlock.text : '';
    } else if (this.provider === 'openai' && this.openai) {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        max_tokens: 200,
        temperature: 0.3
      });
      return response.choices[0]?.message?.content || '';
    }
    
    return '';
  }

  /**
   * Send a message with streaming response
   */
  async chatStream(userMessage: string, onChunk: StreamCallback, context?: string): Promise<AgentResponse> {
    await this.initialize();

    const startTime = Date.now();

    try {
      // Build message with context management
      let fullMessage: string;
      
      if (this.contextEnabled) {
        // Add user message to context manager
        this.contextManager.addMessage('user', userMessage);
        
        // Build context-aware message
        const managedContext = this.contextManager.buildContext();
        const externalContext = context ? `\n\nAdditional Context:\n${context}` : '';
        
        fullMessage = managedContext 
          ? `${managedContext}${externalContext}\n\n---\n\nCurrent Task:\n${userMessage}`
          : (context ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}` : userMessage);
      } else {
        fullMessage = context 
          ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}`
          : userMessage;
      }

      let responseContent = '';
      let tokensUsed = 0;

      if (this.openrouter) {
        // OpenRouter (primary)
        const result = await this.callOpenRouterStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else if (this.anthropic) {
        // Direct Anthropic
        const result = await this.callAnthropicStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else if (this.openai) {
        // Direct OpenAI
        const result = await this.callOpenAIStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else {
        throw new Error('No API client initialized');
      }

      const duration = Date.now() - startTime;

      // Add assistant response to context manager
      if (this.contextEnabled) {
        this.contextManager.addMessage('assistant', responseContent, this.config.name);
      }

      this.conversationHistory.push(
        { role: 'user', content: userMessage, timestamp: new Date() },
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
   * OpenRouter streaming call (supports 100+ models)
   */
  private async callOpenRouterStream(message: string, onChunk: StreamCallback): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openrouter) throw new Error('OpenRouter client not initialized');

    let content = '';
    let tokensUsed = 0;

    const stream = await this.openrouter.chat.completions.create({
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
      // OpenRouter returns usage in the final chunk
      if (chunk.usage) {
        tokensUsed = (chunk.usage.prompt_tokens || 0) + (chunk.usage.completion_tokens || 0);
      }
    }

    onChunk('', true);
    return { content, tokensUsed };
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
      // Build message with context management
      let fullMessage: string;
      
      if (this.contextEnabled) {
        // Add user message to context manager
        this.contextManager.addMessage('user', userMessage);
        
        // Build context-aware message
        const managedContext = this.contextManager.buildContext();
        const externalContext = context ? `\n\nAdditional Context:\n${context}` : '';
        
        fullMessage = managedContext 
          ? `${managedContext}${externalContext}\n\n---\n\nCurrent Task:\n${userMessage}`
          : (context ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}` : userMessage);
      } else {
        fullMessage = context 
          ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}`
          : userMessage;
      }

      let responseContent: string;
      let tokensUsed: number | undefined;

      if (this.openrouter) {
        const response = await this.callOpenRouter(fullMessage);
        responseContent = response.content;
        tokensUsed = response.tokensUsed;
      } else if (this.anthropic) {
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

      // Add assistant response to context manager
      if (this.contextEnabled) {
        this.contextManager.addMessage('assistant', responseContent, this.config.name);
      }

      this.conversationHistory.push(
        { role: 'user', content: userMessage, timestamp: new Date() },
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
   * Non-streaming OpenRouter call with retry and timeout
   */
  private async callOpenRouter(message: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openrouter) throw new Error('OpenRouter client not initialized');

    return withRetry(async () => {
      const response = await withTimeout(
        this.openrouter!.chat.completions.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: message }
          ]
        }),
        this.apiTimeout,
        'OpenRouter API call'
      );

      const content = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      return { content, tokensUsed };
    }, { maxRetries: this.maxRetries });
  }

  /**
   * Non-streaming Anthropic call with retry and timeout
   */
  private async callAnthropic(message: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    return withRetry(async () => {
      const response = await withTimeout(
        this.anthropic!.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: this.config.systemPrompt,
          messages: [{ role: 'user', content: message }]
        }),
        this.apiTimeout,
        'Anthropic API call'
      );

      const content = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';

      return {
        content,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
      };
    }, { maxRetries: this.maxRetries });
  }

  /**
   * Non-streaming OpenAI call with retry and timeout
   */
  private async callOpenAI(message: string): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    return withRetry(async () => {
      const response = await withTimeout(
        this.openai!.chat.completions.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: message }
          ]
        }),
        this.apiTimeout,
        'OpenAI API call'
      );

      const content = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      return { content, tokensUsed };
    }, { maxRetries: this.maxRetries });
  }

  /**
   * Clear conversation history (for context management)
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.debug(`${this.config.name} conversation history cleared`, this.config.role);
  }

  /**
   * Chat with vision - analyze images with streaming
   * Uses Claude's vision capability to understand images
   */
  async chatWithVision(userMessage: string, imageBase64: string, imageMimeType: string, onChunk: StreamCallback): Promise<AgentResponse> {
    await this.initialize();
    const startTime = Date.now();

    try {
      if (!this.openrouter) {
        throw new Error('Vision requires OpenRouter with Claude model');
      }

      // Use Claude Sonnet for vision WITH STREAMING
      const stream = await this.openrouter.chat.completions.create({
        model: 'anthropic/claude-sonnet-4',
        max_tokens: 4096,
        stream: true,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageMimeType};base64,${imageBase64}`
                }
              },
              {
                type: 'text',
                text: userMessage
              }
            ]
          }
        ]
      });

      let content = '';
      let tokensUsed = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          onChunk(delta, false);
        }
        if (chunk.usage?.total_tokens) {
          tokensUsed = chunk.usage.total_tokens;
        }
      }

      onChunk('', true);

      return {
        success: true,
        content,
        agentName: this.config.name,
        role: this.config.role,
        tokensUsed,
        duration: Date.now() - startTime
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
   * Chat with tool calling support
   * The agent can use tools like web search, file operations, and terminal commands
   */
  async chatWithTools(userMessage: string, onChunk: StreamCallback, context?: string, enableTools: boolean = true): Promise<AgentResponse> {
    await this.initialize();
    
    // Register all tools if not already done
    if (enableTools && toolRegistry.getAll().length === 0) {
      registerAllTools();
    }

    const startTime = Date.now();

    try {
      // Build message with context management
      let fullMessage: string;
      
      if (this.contextEnabled) {
        // Add user message to context manager
        this.contextManager.addMessage('user', userMessage);
        
        // Build context-aware message
        const managedContext = this.contextManager.buildContext();
        const externalContext = context ? `\n\nAdditional Context:\n${context}` : '';
        
        fullMessage = managedContext 
          ? `${managedContext}${externalContext}\n\n---\n\nCurrent Task:\n${userMessage}`
          : (context ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}` : userMessage);
      } else {
        fullMessage = context 
          ? `Context:\n${context}\n\n---\n\nTask:\n${userMessage}`
          : userMessage;
      }

      let responseContent = '';
      let tokensUsed = 0;
      let toolsUsed: string[] = [];

      // Get tools in OpenAI format
      const tools = enableTools ? toolRegistry.getOpenAIFormat() : undefined;
      
      if (this.openrouter) {
        const result = await this.callOpenRouterWithTools(fullMessage, onChunk, tools);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
        toolsUsed = result.toolsUsed;
      } else if (this.openai) {
        const result = await this.callOpenAIWithTools(fullMessage, onChunk, tools);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
        toolsUsed = result.toolsUsed;
      } else if (this.anthropic) {
        // Anthropic uses different tool format - fall back to non-tool streaming
        const result = await this.callAnthropicStream(fullMessage, onChunk);
        responseContent = result.content;
        tokensUsed = result.tokensUsed;
      } else {
        throw new Error('No API client initialized');
      }

      const duration = Date.now() - startTime;

      // Add assistant response to context manager
      if (this.contextEnabled) {
        this.contextManager.addMessage('assistant', responseContent, this.config.name);
      }

      this.conversationHistory.push(
        { role: 'user', content: userMessage, timestamp: new Date() },
        { role: 'assistant', content: responseContent, timestamp: new Date(), agentName: this.config.name }
      );

      return {
        success: true,
        content: responseContent,
        agentName: this.config.name,
        role: this.config.role,
        tokensUsed,
        duration,
        toolsUsed
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
   * OpenRouter call with tool support
   */
  private async callOpenRouterWithTools(
    message: string, 
    onChunk: StreamCallback, 
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
  ): Promise<{ content: string; tokensUsed: number; toolsUsed: string[] }> {
    if (!this.openrouter) throw new Error('OpenRouter client not initialized');

    let content = '';
    let tokensUsed = 0;
    let toolsUsed: string[] = [];
    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: message }
    ];

    // Loop for multi-turn tool calling
    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.openrouter.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;
      
      // Track token usage
      if (response.usage) {
        tokensUsed += (response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0);
      }

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(assistantMessage);

        // Track files created/modified for summary
        const filesCreated: string[] = [];
        const filesModified: string[] = [];
        const commandsRun: string[] = [];

        // Process each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          toolsUsed.push(toolName);
          
          // Show progress with tool info
          const progressInfo = this.getToolProgressInfo(toolName, toolArgs);
          if (progressInfo) {
            onChunk(`__TOOL__${progressInfo}`, false);
          }
          
          // Execute tool
          const toolResult = await toolRegistry.execute(toolName, toolArgs);
          const resultStr = toolResult.success 
            ? (typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data, null, 2))
            : `Error: ${toolResult.error}`;
          
          // Helper for relative paths from cwd (like Claude Code)
          const getRelPath = (p: string) => {
            if (!p) return 'file';
            const cwd = process.cwd().replace(/\\/g, '/');
            const norm = p.replace(/\\/g, '/');
            if (norm.startsWith(cwd)) {
              const rel = norm.substring(cwd.length);
              return rel.startsWith('/') ? rel.substring(1) : rel;
            }
            // Find common base
            const cwdParts = cwd.split('/').filter(x => x);
            const fileParts = norm.split('/').filter(x => x);
            let common = 0;
            for (let i = 0; i < Math.min(cwdParts.length, fileParts.length); i++) {
              if (cwdParts[i].toLowerCase() === fileParts[i].toLowerCase()) common = i + 1;
              else break;
            }
            if (common > 0) return fileParts.slice(common).join('/');
            return fileParts.slice(-3).join('/');
          };
          
          // Track what was done
          if (toolName === 'write_file' && toolResult.success) {
            const filePath = toolArgs.path || toolArgs.file_path || 'file';
            // Check if file existed (modified) or was new (created)
            if (resultStr.includes('created') || resultStr.includes('Created')) {
              filesCreated.push(filePath);
            } else {
              filesModified.push(filePath);
            }
          } else if (toolName === 'run_command' && toolResult.success) {
            commandsRun.push(toolArgs.command || '');
          }
          
          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultStr.substring(0, 8000) // Limit tool output
          });
          
          // Show immediate feedback after file operations with proper path
          if (toolResult.success) {
            const filePath = toolArgs.path || toolArgs.file_path || '';
            const relPath = getRelPath(filePath);
            
            if (toolName === 'write_file') {
              const isNew = resultStr.includes('created') || resultStr.includes('Created');
              onChunk(`__TOOL__${isNew ? '✅ Created' : '📝 Updated'}: ${relPath}`, false);
            } else if (toolName === 'delete_file') {
              onChunk(`__TOOL__🗑️  Deleted: ${relPath}`, false);
            } else if (toolName === 'rename_file' || toolName === 'move_file') {
              const toPath = toolArgs.to || toolArgs.destination || toolArgs.new_path || '';
              onChunk(`__TOOL__📦 Moved: ${relPath} → ${getRelPath(toPath)}`, false);
            } else if (toolName === 'copy_file') {
              const destPath = toolArgs.destination || toolArgs.to || '';
              onChunk(`__TOOL__📋 Copied: ${relPath} → ${getRelPath(destPath)}`, false);
            } else if (toolName === 'create_directory' || toolName === 'mkdir') {
              onChunk(`__TOOL__📁 Created folder: ${relPath}/`, false);
            }
          }
        }
        
        // Show what's happening next based on tools used
        const lastTool = toolsUsed[toolsUsed.length - 1];
        const hasWritten = toolsUsed.includes('write_file');
        const onlyReading = toolsUsed.every(t => t === 'read_file' || t === 'list_directory' || t === 'search_in_files' || t === 'file_exists');
        
        if (lastTool === 'run_command') {
          onChunk('__TOOL__✅ Command completed', false);
        } else if (onlyReading) {
          // Only read operations - we're analyzing, not changing
          onChunk('__TOOL__🧠 Analyzing...', false);
        } else if (hasWritten && lastTool !== 'write_file') {
          // Already wrote something, continuing with other work
          onChunk('__TOOL__🧠 Continuing...', false);
        } else if (!hasWritten) {
          onChunk('__TOOL__🧠 Thinking...', false);
        }
        
        // Continue loop to get response after tool results
        continue;
      }

      // No more tool calls - stream the final response
      if (assistantMessage.content) {
        content = assistantMessage.content;
        // Signal that response is ready
        onChunk('__TOOL__✨ Done', false);
        // Don't stream character-by-character as it's too slow
        // Just send the content directly
        onChunk(content, false);
      }
      
      break;
    }

    onChunk('', true);
    return { content, tokensUsed, toolsUsed };
  }

  /**
   * OpenAI call with tool support
   */
  private async callOpenAIWithTools(
    message: string, 
    onChunk: StreamCallback, 
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
  ): Promise<{ content: string; tokensUsed: number; toolsUsed: string[] }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    let content = '';
    let tokensUsed = 0;
    let toolsUsed: string[] = [];
    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: message }
    ];

    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;
      
      if (response.usage) {
        tokensUsed += response.usage.total_tokens || 0;
      }

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          toolsUsed.push(toolName);
          
          // Show progress with tool info
          const progressInfo = this.getToolProgressInfo(toolName, toolArgs);
          if (progressInfo) {
            onChunk(`__TOOL__${progressInfo}`, false);
          }
          
          const toolResult = await toolRegistry.execute(toolName, toolArgs);
          const resultStr = toolResult.success 
            ? (typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data, null, 2))
            : `Error: ${toolResult.error}`;
          
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultStr.substring(0, 8000)
          });
          
          // Helper for relative paths from cwd (like Claude Code)
          const getRelPath = (p: string) => {
            if (!p) return 'file';
            const cwd = process.cwd().replace(/\\/g, '/');
            const norm = p.replace(/\\/g, '/');
            if (norm.startsWith(cwd)) {
              const rel = norm.substring(cwd.length);
              return rel.startsWith('/') ? rel.substring(1) : rel;
            }
            // Find common base
            const cwdParts = cwd.split('/').filter(x => x);
            const fileParts = norm.split('/').filter(x => x);
            let common = 0;
            for (let i = 0; i < Math.min(cwdParts.length, fileParts.length); i++) {
              if (cwdParts[i].toLowerCase() === fileParts[i].toLowerCase()) common = i + 1;
              else break;
            }
            if (common > 0) return fileParts.slice(common).join('/');
            return fileParts.slice(-3).join('/');
          };
          
          // Show immediate feedback after file operations with proper path
          if (toolResult.success) {
            const filePath = toolArgs.path || toolArgs.file_path || '';
            const relPath = getRelPath(filePath);
            
            if (toolName === 'write_file') {
              const isNew = resultStr.includes('created') || resultStr.includes('Created');
              onChunk(`__TOOL__${isNew ? '✅ Created' : '📝 Updated'}: ${relPath}`, false);
            } else if (toolName === 'delete_file') {
              onChunk(`__TOOL__🗑️  Deleted: ${relPath}`, false);
            } else if (toolName === 'rename_file' || toolName === 'move_file') {
              const toPath = toolArgs.to || toolArgs.destination || toolArgs.new_path || '';
              onChunk(`__TOOL__📦 Moved: ${relPath} → ${getRelPath(toPath)}`, false);
            } else if (toolName === 'copy_file') {
              const destPath = toolArgs.destination || toolArgs.to || '';
              onChunk(`__TOOL__📋 Copied: ${relPath} → ${getRelPath(destPath)}`, false);
            } else if (toolName === 'create_directory' || toolName === 'mkdir') {
              onChunk(`__TOOL__📁 Created folder: ${relPath}/`, false);
            }
          }
        }
        
        // Show what's happening next based on tools used
        const lastToolUsed = toolsUsed[toolsUsed.length - 1];
        const hasWrittenFile = toolsUsed.includes('write_file');
        const onlyReadOps = toolsUsed.every(t => t === 'read_file' || t === 'list_directory' || t === 'search_in_files' || t === 'file_exists');
        
        if (lastToolUsed === 'run_command') {
          onChunk('__TOOL__✅ Command completed', false);
        } else if (onlyReadOps) {
          onChunk('__TOOL__🧠 Analyzing...', false);
        } else if (!hasWrittenFile) {
          onChunk('__TOOL__🧠 Thinking...', false);
        }
        
        continue;
      }

      if (assistantMessage.content) {
        content = assistantMessage.content;
        // Signal progress and send content directly (not char-by-char)
        onChunk('__TOOL__✨ Done', false);
        onChunk(content, false);
      }
      
      break;
    }

    onChunk('', true);
    return { content, tokensUsed, toolsUsed };
  }

  /**
   * Get human-readable progress info for a tool call
   */
  private getToolProgressInfo(toolName: string, args: Record<string, any>): string | null {
    // Helper to get relative path from current working directory (like Claude Code)
    const getRelativePath = (filePath: string): string => {
      if (!filePath) return 'file';
      const cwd = process.cwd().replace(/\\/g, '/');
      const normalized = filePath.replace(/\\/g, '/');
      
      // If path starts with cwd, show relative path from there
      if (normalized.startsWith(cwd)) {
        const relative = normalized.substring(cwd.length);
        return relative.startsWith('/') ? relative.substring(1) : relative;
      }
      
      // Try to find common base and show relative
      const cwdParts = cwd.split('/').filter(p => p);
      const fileParts = normalized.split('/').filter(p => p);
      
      // Find common prefix length
      let commonLen = 0;
      for (let i = 0; i < Math.min(cwdParts.length, fileParts.length); i++) {
        if (cwdParts[i].toLowerCase() === fileParts[i].toLowerCase()) {
          commonLen = i + 1;
        } else {
          break;
        }
      }
      
      // If we found common base, show relative path
      if (commonLen > 0) {
        return fileParts.slice(commonLen).join('/');
      }
      
      // Fallback: show last few segments
      return fileParts.slice(-3).join('/');
    };

    switch (toolName) {
      case 'list_directory':
        const dir = args.path || args.directory || '.';
        const relDir = getRelativePath(dir);
        return `📂 Scanning ${relDir === '.' || !relDir ? './' : relDir + '/'}`;
      case 'read_file':
        const file = args.path || args.file_path || args.filename;
        if (file) {
          return `📖 Reading ${getRelativePath(file)}`;
        }
        return null;
      case 'search_in_files':
        const pattern = args.pattern || args.query || args.search;
        return pattern ? `🔍 Searching: "${pattern.substring(0, 30)}${pattern.length > 30 ? '...' : ''}"` : '🔍 Searching files...';
      case 'file_exists':
        const checkFile = args.path || 'file';
        return `🔍 Checking ${getRelativePath(checkFile)}`;
      case 'write_file':
        const writeFile = args.path || args.file_path || 'file';
        return `✏️  Writing ${getRelativePath(writeFile)}`;
      case 'delete_file':
        const deleteFile = args.path || args.file_path || 'file';
        return `🗑️  Deleting ${getRelativePath(deleteFile)}`;
      case 'rename_file':
      case 'move_file':
        const fromFile = args.from || args.source || args.old_path || 'file';
        const toFile = args.to || args.destination || args.new_path || 'file';
        return `📦 Moving ${getRelativePath(fromFile)} → ${getRelativePath(toFile)}`;
      case 'copy_file':
        const srcFile = args.source || args.from || 'file';
        const destFile = args.destination || args.to || 'file';
        return `📋 Copying ${getRelativePath(srcFile)} → ${getRelativePath(destFile)}`;
      case 'create_directory':
      case 'mkdir':
        const newDir = args.path || args.directory || 'folder';
        return `📁 Creating ${getRelativePath(newDir)}/`;
      case 'run_command':
        const cmd = args.command || '';
        return `🖥️  Running: ${cmd.substring(0, 50)}${cmd.length > 50 ? '...' : ''}`;
      case 'web_search':
        return `🌐 Searching: ${(args.query || '').substring(0, 40)}...`;
      case 'fetch_url':
        const url = args.url || '';
        const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || url;
        return `🌐 Fetching ${domain.substring(0, 40)}`;
      default:
        return `⚙️  ${toolName}...`;
    }
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
