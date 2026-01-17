/**
 * Terminal Tools
 * Execute shell commands and manage processes
 * With OS detection and command adaptation
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { ToolDefinition, ToolResult, toolRegistry } from './toolRegistry.js';
import { getWorkingDirectory } from './fileTools.js';
import { detectOS, getDefaultShell, adaptCommand, isCommandSafe } from '../utils/robustness.js';

// Track running background processes
const runningProcesses: Map<string, ChildProcess> = new Map();

// Detect OS once at module load
const currentOS = detectOS();
const defaultShell = getDefaultShell();

// Run Command Tool
const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description: `Execute a shell command and return the output. Use for npm, git, and other CLI tools. Current OS: ${currentOS}, Shell: ${defaultShell}`,
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The command to execute',
      required: true
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in milliseconds (default: 30000)',
      required: false
    },
    {
      name: 'adaptForOS',
      type: 'boolean',
      description: 'Automatically adapt Unix commands for Windows (default: true)',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    let command = params.command as string;
    const timeout = (params.timeout as number) || 30000;
    const adaptForOS = params.adaptForOS !== false;
    
    // Security: Check if command is safe
    const safetyCheck = isCommandSafe(command);
    if (!safetyCheck.safe) {
      return { success: false, error: `Command blocked: ${safetyCheck.reason}` };
    }
    
    // Adapt command for current OS if requested
    if (adaptForOS) {
      command = adaptCommand(command);
    }
    
    try {
      const output = execSync(command, {
        cwd: getWorkingDirectory(),
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: defaultShell,
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      
      return { success: true, data: output.trim() || '(command completed with no output)' };
    } catch (error: unknown) {
      const execError = error as { stderr?: string; stdout?: string; message: string };
      const stderr = execError.stderr || '';
      const stdout = execError.stdout || '';
      const message = execError.message || 'Unknown error';
      
      return { 
        success: false, 
        error: `Command failed: ${message}\n${stderr}\n${stdout}`.trim()
      };
    }
  }
};

// Start Background Process Tool
const startProcessTool: ToolDefinition = {
  name: 'start_process',
  description: 'Start a long-running background process (like a dev server). Returns a process ID.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The command to execute',
      required: true
    },
    {
      name: 'name',
      type: 'string',
      description: 'A name to identify this process',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const command = params.command as string;
    const name = params.name as string;
    
    try {
      // Parse command into parts
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      
      const child = spawn(cmd, args, {
        cwd: getWorkingDirectory(),
        detached: true,
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      
      const processId = `${name}-${Date.now()}`;
      runningProcesses.set(processId, child);
      
      // Capture output
      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data) => {
        output += data.toString();
      });
      
      // Clean up on exit
      child.on('exit', () => {
        runningProcesses.delete(processId);
      });
      
      // Wait a bit to see if it starts successfully
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (child.exitCode !== null) {
        return { 
          success: false, 
          error: `Process exited immediately with code ${child.exitCode}\n${output}` 
        };
      }
      
      return { 
        success: true, 
        data: { processId, pid: child.pid, message: `Process '${name}' started` } 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Stop Background Process Tool
const stopProcessTool: ToolDefinition = {
  name: 'stop_process',
  description: 'Stop a background process by its ID.',
  parameters: [
    {
      name: 'processId',
      type: 'string',
      description: 'The process ID returned from start_process',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const processId = params.processId as string;
    
    const child = runningProcesses.get(processId);
    if (!child) {
      return { success: false, error: `Process '${processId}' not found` };
    }
    
    try {
      child.kill();
      runningProcesses.delete(processId);
      return { success: true, data: `Process '${processId}' stopped` };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to stop process: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// List Running Processes Tool
const listProcessesTool: ToolDefinition = {
  name: 'list_processes',
  description: 'List all running background processes started by this session.',
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    if (runningProcesses.size === 0) {
      return { success: true, data: 'No background processes running' };
    }
    
    const list = Array.from(runningProcesses.entries()).map(([id, child]) => 
      `- ${id} (PID: ${child.pid})`
    ).join('\n');
    
    return { success: true, data: `Running processes:\n${list}` };
  }
};

// Get Environment Variable Tool
const getEnvTool: ToolDefinition = {
  name: 'get_env',
  description: 'Get the value of an environment variable.',
  parameters: [
    {
      name: 'name',
      type: 'string',
      description: 'The name of the environment variable',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const name = params.name as string;
    
    // Block sensitive env vars
    const blockedVars = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PASSWORD', 'SECRET', 'TOKEN'];
    if (blockedVars.some(v => name.toUpperCase().includes(v))) {
      return { success: false, error: 'Access to sensitive environment variables is blocked' };
    }
    
    const value = process.env[name];
    if (value === undefined) {
      return { success: true, data: `Environment variable '${name}' is not set` };
    }
    
    return { success: true, data: value };
  }
};

// Register terminal tools
export function registerTerminalTools(): void {
  toolRegistry.register(runCommandTool);
  toolRegistry.register(startProcessTool);
  toolRegistry.register(stopProcessTool);
  toolRegistry.register(listProcessesTool);
  toolRegistry.register(getEnvTool);
}
