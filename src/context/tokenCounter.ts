/**
 * Token Counter Utility
 * Estimates token counts for context management
 * Uses character-based estimation with model-specific adjustments
 */

import { ModelConfig } from './types.js';

/**
 * Average characters per token by provider
 * These are approximations - actual tokenization varies
 */
const CHARS_PER_TOKEN: Record<string, number> = {
  anthropic: 3.5,   // Claude models
  openai: 4.0,      // GPT models
  google: 4.0,      // Gemini models
  meta: 4.0,        // Llama models
  mistral: 4.0,     // Mistral models
  deepseek: 3.8,    // DeepSeek models
  other: 4.0,       // Default
};

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string, provider: string = 'anthropic'): number {
  if (!text) return 0;
  
  const charsPerToken = CHARS_PER_TOKEN[provider] || CHARS_PER_TOKEN.other;
  
  // Basic estimation
  let estimate = Math.ceil(text.length / charsPerToken);
  
  // Adjust for code content (tends to have more tokens due to special chars)
  const codeBlockCount = (text.match(/```/g) || []).length / 2;
  if (codeBlockCount > 0) {
    estimate = Math.ceil(estimate * 1.15); // 15% increase for code
  }
  
  // Adjust for JSON content
  if (text.includes('{') && text.includes('}')) {
    const jsonChars = (text.match(/[{}\[\]:,"]/g) || []).length;
    estimate += Math.ceil(jsonChars * 0.3); // JSON punctuation adds tokens
  }
  
  return estimate;
}

/**
 * Count tokens in an array of messages
 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>,
  provider: string = 'anthropic'
): number {
  let total = 0;
  
  for (const msg of messages) {
    // Message role overhead (~4 tokens per message)
    total += 4;
    // Content tokens
    total += estimateTokens(msg.content, provider);
  }
  
  // Request overhead
  total += 3;
  
  return total;
}

/**
 * Token counter class with caching for efficiency
 */
export class TokenCounter {
  private cache: Map<string, number> = new Map();
  private provider: string;
  private maxCacheSize: number;

  constructor(provider: string = 'anthropic', maxCacheSize: number = 1000) {
    this.provider = provider;
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Count tokens with caching
   */
  count(text: string): number {
    if (!text) return 0;
    
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Calculate tokens
    const tokens = estimateTokens(text, this.provider);
    
    // Cache result (with size limit)
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries (first 10%)
      const keysToRemove = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxCacheSize * 0.1));
      keysToRemove.forEach(key => this.cache.delete(key));
    }
    this.cache.set(cacheKey, tokens);
    
    return tokens;
  }

  /**
   * Count tokens for multiple texts
   */
  countMany(texts: string[]): number {
    return texts.reduce((total, text) => total + this.count(text), 0);
  }

  /**
   * Get cache key (hash for long strings)
   */
  private getCacheKey(text: string): string {
    if (text.length <= 100) {
      return text;
    }
    // Simple hash for longer strings
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash:${hash}:${text.length}`;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${tokens}`;
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelConfig: ModelConfig
): { inputCost: number; outputCost: number; totalCost: number } {
  const inputCost = (inputTokens / 1000) * modelConfig.costPer1kInput;
  const outputCost = (outputTokens / 1000) * modelConfig.costPer1kOutput;
  
  return {
    inputCost: Math.round(inputCost * 10000) / 10000,
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
  };
}

/**
 * Estimate how much text can fit in given token budget
 */
export function estimateMaxChars(tokens: number, provider: string = 'anthropic'): number {
  const charsPerToken = CHARS_PER_TOKEN[provider] || CHARS_PER_TOKEN.other;
  return Math.floor(tokens * charsPerToken * 0.9); // 10% safety margin
}
