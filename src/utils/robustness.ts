/**
 * Robustness Utilities
 * Retry logic, JSON sanitization, input validation, and error handling
 */

import { logger } from './logger.js';

// ═══════════════════════════════════════════════════════════
// RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate_limit',
    '429',
    '503',
    '502',
    'overloaded',
    'capacity',
    'timeout'
  ]
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const errorStr = lastError.message.toLowerCase();
      const isRetryable = opts.retryableErrors.some(e => errorStr.includes(e.toLowerCase()));
      
      if (!isRetryable || attempt === opts.maxRetries) {
        throw lastError;
      }

      // Log retry attempt
      logger.warn(`API call failed (attempt ${attempt + 1}/${opts.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`);

      // Wait with exponential backoff
      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════
// TIMEOUT WRAPPER
// ═══════════════════════════════════════════════════════════

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// JSON SANITIZATION & PARSING
// ═══════════════════════════════════════════════════════════

/**
 * Sanitize and parse JSON from potentially malformed LLM output
 */
export function safeParseJSON<T = unknown>(text: string): { success: true; data: T } | { success: false; error: string } {
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'Input is not a string' };
  }

  // Try direct parse first
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch {
    // Continue to sanitization
  }

  // Sanitize the text
  let sanitized = text;

  try {
    // Remove markdown code blocks
    sanitized = sanitized.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Remove leading/trailing whitespace
    sanitized = sanitized.trim();
    
    // Try to extract JSON object or array
    const jsonMatch = sanitized.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      sanitized = jsonMatch[1];
    }

    // Fix common LLM JSON mistakes
    sanitized = sanitized
      // Replace smart quotes with regular quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // Fix unescaped newlines in strings (dangerous, but common)
      .replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n')
      // Remove trailing commas before closing brackets
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix missing commas between properties (heuristic)
      .replace(/"\s*\n\s*"/g, '",\n"')
      // Remove any control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    const data = JSON.parse(sanitized) as T;
    return { success: true, data };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown parse error';
    return { success: false, error: `JSON parse failed: ${errorMsg}. Sanitized text: ${sanitized.substring(0, 200)}...` };
  }
}

/**
 * Extract JSON from mixed text (prose + JSON)
 */
export function extractJSON<T = unknown>(text: string): T | null {
  const result = safeParseJSON<T>(text);
  return result.success ? result.data : null;
}

// ═══════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

/**
 * Validate user input prompt
 */
export function validatePrompt(input: string, maxLength: number = 100000): ValidationResult {
  // Check for null/undefined
  if (input === null || input === undefined) {
    return { valid: false, error: 'Input is required' };
  }

  // Convert to string if needed
  const str = String(input);

  // Check for empty or whitespace-only
  const trimmed = str.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Input cannot be empty' };
  }

  // Check length
  if (trimmed.length > maxLength) {
    return { 
      valid: false, 
      error: `Input too long (${trimmed.length} chars). Maximum is ${maxLength} characters.` 
    };
  }

  // Check for minimum meaningful length
  if (trimmed.length < 2) {
    return { valid: false, error: 'Input too short. Please provide more detail.' };
  }

  // Sanitize control characters but keep newlines and tabs
  const sanitized = trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
}

/**
 * Validate file path for safety
 */
export function validateFilePath(filePath: string): ValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  const trimmed = filePath.trim();

  // Check for path traversal attempts
  if (trimmed.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  // Check for absolute paths trying to escape (Unix)
  if (trimmed.startsWith('/etc/') || trimmed.startsWith('/root/') || trimmed.startsWith('/var/')) {
    return { valid: false, error: 'Access to system directories is not allowed' };
  }

  // Check for Windows system paths
  const lowerPath = trimmed.toLowerCase();
  if (lowerPath.includes('\\windows\\') || lowerPath.includes('\\system32\\')) {
    return { valid: false, error: 'Access to Windows system directories is not allowed' };
  }

  // Check for null bytes (path injection)
  if (trimmed.includes('\x00')) {
    return { valid: false, error: 'Invalid characters in path' };
  }

  return { valid: true, sanitized: trimmed };
}

// ═══════════════════════════════════════════════════════════
// OS DETECTION
// ═══════════════════════════════════════════════════════════

export type OSType = 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * Detect the current operating system
 */
export function detectOS(): OSType {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

/**
 * Get the appropriate shell for the current OS
 */
export function getDefaultShell(): string {
  const os = detectOS();
  
  switch (os) {
    case 'windows':
      return 'powershell.exe';
    case 'macos':
    case 'linux':
      return process.env.SHELL || '/bin/bash';
    default:
      return '/bin/sh';
  }
}

/**
 * Adapt a command for the current OS
 */
export function adaptCommand(command: string): string {
  const os = detectOS();
  
  if (os === 'windows') {
    // Convert Unix-style commands to Windows equivalents
    return command
      // ls -> dir (but prefer Get-ChildItem in PS)
      .replace(/^ls\s/i, 'Get-ChildItem ')
      .replace(/^ls$/i, 'Get-ChildItem')
      // cat -> Get-Content
      .replace(/^cat\s/i, 'Get-Content ')
      // rm -> Remove-Item
      .replace(/^rm\s/i, 'Remove-Item ')
      // mkdir -p -> New-Item -ItemType Directory -Force
      .replace(/mkdir\s+-p\s+/i, 'New-Item -ItemType Directory -Force -Path ')
      // touch -> New-Item
      .replace(/^touch\s/i, 'New-Item -ItemType File -Path ')
      // which -> Get-Command
      .replace(/^which\s/i, 'Get-Command ')
      // Forward slashes in paths (careful with URLs)
      .replace(/(?<!https?:)\/(?!\/)/g, '\\');
  }
  
  return command;
}

/**
 * Check if a command is safe to execute
 */
export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCmd = command.toLowerCase().trim();
  
  // Dangerous patterns
  const dangerousPatterns = [
    { pattern: /rm\s+-rf\s+[\/\\]/, reason: 'Recursive delete of root directory' },
    { pattern: /rm\s+-rf\s+\*/, reason: 'Recursive delete of all files' },
    { pattern: /format\s+[a-z]:/i, reason: 'Disk format command' },
    { pattern: /del\s+\/[fs]\s+\/[sq]/i, reason: 'Recursive delete command' },
    { pattern: /shutdown|reboot|halt/i, reason: 'System shutdown/reboot command' },
    { pattern: /mkfs\./i, reason: 'Filesystem format command' },
    { pattern: /dd\s+if=.*of=\/dev/i, reason: 'Direct disk write' },
    { pattern: />\s*\/dev\/[sh]d[a-z]/i, reason: 'Direct device write' },
    { pattern: /chmod\s+777\s+\//i, reason: 'Dangerous permission change' },
    { pattern: /:(){ :|:& };:/i, reason: 'Fork bomb detected' },
  ];
  
  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(lowerCmd)) {
      return { safe: false, reason };
    }
  }
  
  return { safe: true };
}

// ═══════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════

type ShutdownHandler = () => void | Promise<void>;

const shutdownHandlers: ShutdownHandler[] = [];
let isShuttingDown = false;

/**
 * Register a handler to be called on graceful shutdown
 */
export function onShutdown(handler: ShutdownHandler): void {
  shutdownHandlers.push(handler);
}

/**
 * Initialize graceful shutdown handling
 */
export function initGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n\n  Received ${signal}. Shutting down gracefully...`);
    
    // Run all shutdown handlers
    for (const handler of shutdownHandlers) {
      try {
        await handler();
      } catch (error) {
        console.error('Error in shutdown handler:', error);
      }
    }
    
    console.log('  Goodbye! 👋\n');
    process.exit(0);
  };

  // Handle various termination signals
  process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
  process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
  
  // SIGHUP is not available on Windows
  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => shutdown('SIGHUP'));   // terminal closed
  }
}

/**
 * Check if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}
