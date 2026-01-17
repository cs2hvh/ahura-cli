/**
 * Self-Correction Loop
 * 
 * Implements reflexion pattern: when a tool or command fails,
 * feed the error back to the AI for automatic retry/fix.
 */

import OpenAI from 'openai';

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface CorrectionAttempt {
  attempt: number;
  error: string;
  correction: string;
  result: ExecutionResult;
}

/**
 * Self-correcting executor
 */
export class SelfCorrector {
  private openrouter: OpenAI | null = null;
  private maxAttempts: number;
  private history: CorrectionAttempt[] = [];
  
  constructor(maxAttempts: number = 3) {
    this.maxAttempts = maxAttempts;
    
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
   * Execute with automatic correction on failure
   */
  async executeWithCorrection<T>(
    task: string,
    executor: (input: string) => Promise<ExecutionResult>,
    initialInput: string,
    onAttempt?: (attempt: number, action: string) => void
  ): Promise<{ success: boolean; finalResult: ExecutionResult; attempts: number }> {
    
    let currentInput = initialInput;
    let lastResult: ExecutionResult = { success: false };
    
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (onAttempt) {
        onAttempt(attempt, attempt === 1 ? 'Executing...' : 'Retrying with fix...');
      }
      
      // Execute
      lastResult = await executor(currentInput);
      
      if (lastResult.success) {
        return { success: true, finalResult: lastResult, attempts: attempt };
      }
      
      // If failed and we have more attempts, try to self-correct
      if (attempt < this.maxAttempts && lastResult.error) {
        const correction = await this.getCorrection(task, currentInput, lastResult.error);
        
        if (correction) {
          this.history.push({
            attempt,
            error: lastResult.error,
            correction,
            result: lastResult
          });
          
          currentInput = correction;
        } else {
          // Couldn't generate correction, stop trying
          break;
        }
      }
    }
    
    return { success: false, finalResult: lastResult, attempts: this.maxAttempts };
  }
  
  /**
   * Get AI-generated correction for an error
   */
  private async getCorrection(task: string, originalInput: string, error: string): Promise<string | null> {
    if (!this.openrouter) return null;
    
    try {
      const response = await this.openrouter.chat.completions.create({
        model: 'anthropic/claude-haiku-4.5', // Fast for corrections
        max_tokens: 1000,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a code debugging assistant. The previous attempt failed with an error.
Analyze the error and provide a CORRECTED version of the input.
Only output the corrected code/command - no explanations.`
          },
          {
            role: 'user',
            content: `TASK: ${task}

ORIGINAL INPUT:
${originalInput.substring(0, 2000)}

ERROR:
${error.substring(0, 1000)}

Provide the corrected version:`
          }
        ]
      });
      
      return response.choices?.[0]?.message?.content || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Analyze error and suggest fix without executing
   */
  async analyzeError(context: string, error: string): Promise<string | null> {
    if (!this.openrouter) return null;
    
    try {
      const response = await this.openrouter.chat.completions.create({
        model: 'anthropic/claude-haiku-4.5',
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful debugging assistant. Explain the error briefly and suggest a fix in 1-2 sentences.'
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nError: ${error}`
          }
        ]
      });
      
      return response.choices?.[0]?.message?.content || null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get correction history
   */
  getHistory(): CorrectionAttempt[] {
    return [...this.history];
  }
  
  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }
}

/**
 * Simple retry wrapper for async functions
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Execute command with self-correction
 */
export async function executeWithSelfCorrection(
  command: string,
  executor: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
  context: string = '',
  maxAttempts: number = 2
): Promise<{ success: boolean; output: string; attempts: number }> {
  const corrector = new SelfCorrector(maxAttempts);
  
  const result = await corrector.executeWithCorrection(
    context || 'Execute command',
    async (cmd) => {
      try {
        const { stdout, stderr, exitCode } = await executor(cmd);
        return {
          success: exitCode === 0,
          output: stdout,
          error: stderr || (exitCode !== 0 ? `Exit code: ${exitCode}` : undefined),
          exitCode
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    command
  );
  
  return {
    success: result.success,
    output: result.finalResult.output || result.finalResult.error || '',
    attempts: result.attempts
  };
}
