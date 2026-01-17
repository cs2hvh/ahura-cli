/**
 * Model Configurations
 * Defines token limits and capabilities for all supported models
 */

import { ModelConfig, TokenBudget } from './types.js';

/**
 * Comprehensive model configurations with context windows
 * All values are in tokens
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ═══════════════════════════════════════════════════════════
  // ANTHROPIC MODELS
  // ═══════════════════════════════════════════════════════════
  
  // Claude 4 Series
  'anthropic/claude-opus-4': {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    supportsTools: true,
    supportsVision: true,
  },
  'anthropic/claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsTools: true,
    supportsVision: true,
  },
  'anthropic/claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 1000000,  // 1M context!
    maxOutputTokens: 64000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsTools: true,
    supportsVision: true,
  },
  
  // Claude 3.5 Series
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsTools: true,
    supportsVision: true,
  },
  'anthropic/claude-3.5-haiku': {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    supportsTools: true,
    supportsVision: true,
  },
  
  // Claude 3 Series
  'anthropic/claude-3-opus': {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    supportsTools: true,
    supportsVision: true,
  },
  'anthropic/claude-3-sonnet': {
    id: 'anthropic/claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    supportsTools: true,
    supportsVision: true,
  },
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 12000,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    supportsTools: true,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // OPENAI MODELS
  // ═══════════════════════════════════════════════════════════
  
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    supportsTools: true,
    supportsVision: true,
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    supportsTools: true,
    supportsVision: true,
  },
  'openai/gpt-4-turbo': {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    supportsTools: true,
    supportsVision: true,
  },
  'openai/gpt-4': {
    id: 'openai/gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    supportsTools: true,
    supportsVision: false,
  },
  'openai/o1': {
    id: 'openai/o1',
    name: 'o1',
    provider: 'openai',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
    supportsTools: false,
    supportsVision: true,
  },
  'openai/o1-mini': {
    id: 'openai/o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.012,
    supportsTools: false,
    supportsVision: true,
  },
  'openai/o1-preview': {
    id: 'openai/o1-preview',
    name: 'o1 Preview',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
    supportsTools: false,
    supportsVision: false,
  },

  // ═══════════════════════════════════════════════════════════
  // GOOGLE MODELS
  // ═══════════════════════════════════════════════════════════
  
  'google/gemini-pro-1.5': {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'google',
    contextWindow: 2000000,  // 2M context!
    maxOutputTokens: 8192,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.005,
    supportsTools: true,
    supportsVision: true,
  },
  'google/gemini-flash-1.5': {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
    supportsTools: true,
    supportsVision: true,
  },
  'google/gemini-2.0-flash': {
    id: 'google/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0004,
    supportsTools: true,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // META (LLAMA) MODELS
  // ═══════════════════════════════════════════════════════════
  
  'meta-llama/llama-3.1-405b-instruct': {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'meta',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.003,
    supportsTools: true,
    supportsVision: false,
  },
  'meta-llama/llama-3.1-70b-instruct': {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'meta',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.0008,
    supportsTools: true,
    supportsVision: false,
  },
  'meta-llama/llama-3.3-70b-instruct': {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.0008,
    supportsTools: true,
    supportsVision: false,
  },

  // ═══════════════════════════════════════════════════════════
  // MISTRAL MODELS
  // ═══════════════════════════════════════════════════════════
  
  'mistralai/mistral-large': {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.009,
    supportsTools: true,
    supportsVision: false,
  },
  'mistralai/mistral-medium': {
    id: 'mistralai/mistral-medium',
    name: 'Mistral Medium',
    provider: 'mistral',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.0027,
    costPer1kOutput: 0.0081,
    supportsTools: true,
    supportsVision: false,
  },
  'mistralai/codestral': {
    id: 'mistralai/codestral',
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.003,
    supportsTools: true,
    supportsVision: false,
  },

  // ═══════════════════════════════════════════════════════════
  // DEEPSEEK MODELS
  // ═══════════════════════════════════════════════════════════
  
  'deepseek/deepseek-chat': {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    contextWindow: 64000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00028,
    supportsTools: true,
    supportsVision: false,
  },
  'deepseek/deepseek-coder': {
    id: 'deepseek/deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    contextWindow: 64000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00028,
    supportsTools: true,
    supportsVision: false,
  },
  'deepseek/deepseek-r1': {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00219,
    supportsTools: true,
    supportsVision: false,
  },
};

/**
 * Get model configuration by ID
 * Falls back to a sensible default if model not found
 */
export function getModelConfig(modelId: string): ModelConfig {
  // Direct match
  if (MODEL_CONFIGS[modelId]) {
    return MODEL_CONFIGS[modelId];
  }
  
  // Try partial match (e.g., "claude-sonnet-4.5" matches "anthropic/claude-sonnet-4.5")
  const partialMatch = Object.keys(MODEL_CONFIGS).find(key => 
    key.toLowerCase().includes(modelId.toLowerCase()) ||
    modelId.toLowerCase().includes(key.split('/')[1]?.toLowerCase() || '')
  );
  
  if (partialMatch) {
    return MODEL_CONFIGS[partialMatch];
  }
  
  // Default fallback - assume 128K context for unknown models
  return {
    id: modelId,
    name: modelId,
    provider: 'other',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    supportsTools: true,
    supportsVision: false,
  };
}

/**
 * Calculate token budget for a given model
 * Uses optimal allocation ratios
 */
export function calculateTokenBudget(modelConfig: ModelConfig): TokenBudget {
  const total = modelConfig.contextWindow;
  
  // Leave 10% buffer for safety
  const usableTokens = Math.floor(total * 0.9);
  
  return {
    total: usableTokens,
    systemPrompt: Math.floor(usableTokens * 0.05),      // 5% for system prompt
    summaryHistory: Math.floor(usableTokens * 0.20),    // 20% for summarized history
    recentContext: Math.floor(usableTokens * 0.60),     // 60% for recent messages
    currentQuery: Math.floor(usableTokens * 0.15),      // 15% for current query + response
  };
}

/**
 * Get the best summarization model (fast & cheap)
 */
export function getSummarizationModel(): string {
  // Claude 3 Haiku is ideal - fast, cheap, good at summarization
  return 'anthropic/claude-haiku-4.5';
}

/**
 * Check if context compaction is needed
 */
export function shouldCompact(
  currentTokens: number, 
  modelConfig: ModelConfig,
  threshold: number = 0.7  // Compact at 70% usage
): boolean {
  const usableTokens = modelConfig.contextWindow * 0.9;
  return currentTokens >= usableTokens * threshold;
}

/**
 * Get a readable summary of model capabilities
 */
export function getModelSummary(modelId: string): string {
  const config = getModelConfig(modelId);
  const contextK = Math.round(config.contextWindow / 1000);
  const outputK = Math.round(config.maxOutputTokens / 1000);
  
  let contextStr = `${contextK}K`;
  if (contextK >= 1000) {
    contextStr = `${(contextK / 1000).toFixed(1)}M`;
  }
  
  return `${config.name}: ${contextStr} context, ${outputK}K output, $${config.costPer1kInput}/$${config.costPer1kOutput} per 1K`;
}
