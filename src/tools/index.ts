/**
 * Tools System for Ahura
 * Provides agents with capabilities to interact with the environment
 */

export * from './toolRegistry.js';
export * from './webSearch.js';
export * from './fileTools.js';
export * from './terminalTools.js';

import { registerFileTools } from './fileTools.js';
import { registerWebTools } from './webSearch.js';
import { registerTerminalTools } from './terminalTools.js';

let toolsRegistered = false;

/**
 * Register all available tools
 */
export function registerAllTools(): void {
  if (toolsRegistered) return;
  
  registerFileTools();
  registerWebTools();
  registerTerminalTools();
  
  toolsRegistered = true;
  // Tools registered silently
}
