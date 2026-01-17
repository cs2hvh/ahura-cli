/**
 * Memory Manager - AHURA.md persistence
 * 
 * Based on Claude Code's MemoryTool - manages project-specific memory
 * that persists across sessions via AHURA.md file.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface MemoryEntry {
  key: string;
  value: string;
  timestamp: Date;
}

export interface MemoryFile {
  projectPath: string;
  content: string;
  lastModified: Date;
}

const MEMORY_FILENAME = 'AHURA.md';
const LOCAL_MEMORY_FILENAME = 'AHURA.local.md';

/**
 * Memory Manager handles persistent storage of project context
 */
export class MemoryManager {
  private workingDirectory: string;
  private cache: Map<string, string> = new Map();
  
  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }
  
  /**
   * Get the path to the project memory file
   */
  getMemoryPath(local: boolean = false): string {
    return path.join(this.workingDirectory, local ? LOCAL_MEMORY_FILENAME : MEMORY_FILENAME);
  }
  
  /**
   * Get the path to the user's global memory file
   */
  getGlobalMemoryPath(): string {
    const ahuraDir = path.join(os.homedir(), '.ahurasense');
    if (!fs.existsSync(ahuraDir)) {
      fs.mkdirSync(ahuraDir, { recursive: true });
    }
    return path.join(ahuraDir, MEMORY_FILENAME);
  }
  
  /**
   * Check if memory file exists
   */
  hasMemory(local: boolean = false): boolean {
    return fs.existsSync(this.getMemoryPath(local));
  }
  
  /**
   * Check if global memory file exists
   */
  hasGlobalMemory(): boolean {
    return fs.existsSync(this.getGlobalMemoryPath());
  }
  
  /**
   * Read memory file contents
   */
  readMemory(local: boolean = false): string {
    const memoryPath = this.getMemoryPath(local);
    if (!fs.existsSync(memoryPath)) {
      return '';
    }
    
    try {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      this.cache.set(memoryPath, content);
      return content;
    } catch (error) {
      console.error(`Failed to read memory file: ${error}`);
      return '';
    }
  }
  
  /**
   * Read global memory file contents
   */
  readGlobalMemory(): string {
    const memoryPath = this.getGlobalMemoryPath();
    if (!fs.existsSync(memoryPath)) {
      return '';
    }
    
    try {
      return fs.readFileSync(memoryPath, 'utf-8');
    } catch (error) {
      console.error(`Failed to read global memory file: ${error}`);
      return '';
    }
  }
  
  /**
   * Write memory file contents
   */
  writeMemory(content: string, local: boolean = false): boolean {
    const memoryPath = this.getMemoryPath(local);
    
    try {
      fs.writeFileSync(memoryPath, content, 'utf-8');
      this.cache.set(memoryPath, content);
      return true;
    } catch (error) {
      console.error(`Failed to write memory file: ${error}`);
      return false;
    }
  }
  
  /**
   * Append to memory file
   */
  appendMemory(entry: string, local: boolean = false): boolean {
    const currentContent = this.readMemory(local);
    const newContent = currentContent 
      ? `${currentContent}\n\n${entry}`
      : entry;
    return this.writeMemory(newContent, local);
  }
  
  /**
   * Get combined memory context (project + local + global)
   */
  getFullContext(): string {
    const parts: string[] = [];
    
    // Global memory (user preferences)
    const globalMemory = this.readGlobalMemory();
    if (globalMemory) {
      parts.push(`## Global Preferences\n${globalMemory}`);
    }
    
    // Project memory
    const projectMemory = this.readMemory(false);
    if (projectMemory) {
      parts.push(`## Project Memory\n${projectMemory}`);
    }
    
    // Local memory (gitignored, personal notes)
    const localMemory = this.readMemory(true);
    if (localMemory) {
      parts.push(`## Local Notes\n${localMemory}`);
    }
    
    return parts.join('\n\n');
  }
  
  /**
   * Create initial memory file with template
   */
  initializeMemory(): boolean {
    if (this.hasMemory()) {
      return false; // Already exists
    }
    
    const template = `# Project Memory

This file stores project-specific context for Ahura CLI.
It will be read at the start of each session.

## Tech Stack
- (Add your tech stack here)

## Conventions
- (Add coding conventions here)

## Important Files
- (Add key files to remember here)

## Notes
- (Add any important notes here)
`;
    
    return this.writeMemory(template);
  }
  
  /**
   * Parse memory file into structured entries
   */
  parseMemory(): Map<string, string[]> {
    const content = this.readMemory();
    const sections = new Map<string, string[]>();
    
    const lines = content.split('\n');
    let currentSection = 'General';
    let currentItems: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentItems.length > 0) {
          sections.set(currentSection, currentItems);
        }
        // Start new section
        currentSection = line.slice(3).trim();
        currentItems = [];
      } else if (line.startsWith('- ')) {
        currentItems.push(line.slice(2).trim());
      } else if (line.trim() && !line.startsWith('#')) {
        currentItems.push(line.trim());
      }
    }
    
    // Save last section
    if (currentItems.length > 0) {
      sections.set(currentSection, currentItems);
    }
    
    return sections;
  }
  
  /**
   * Add entry to a specific section
   */
  addToSection(section: string, entry: string, local: boolean = false): boolean {
    const content = this.readMemory(local);
    const sectionHeader = `## ${section}`;
    
    if (content.includes(sectionHeader)) {
      // Find section and add entry
      const parts = content.split(sectionHeader);
      const beforeSection = parts[0];
      const afterSectionParts = parts[1].split('\n## ');
      const sectionContent = afterSectionParts[0];
      const afterSection = afterSectionParts.slice(1).map(p => `## ${p}`).join('\n');
      
      const newSectionContent = `${sectionContent.trimEnd()}\n- ${entry}`;
      const newContent = `${beforeSection}${sectionHeader}${newSectionContent}${afterSection ? '\n\n' + afterSection : ''}`;
      
      return this.writeMemory(newContent, local);
    } else {
      // Create new section
      const newSection = `\n\n## ${section}\n- ${entry}`;
      return this.writeMemory(content + newSection, local);
    }
  }
  
  /**
   * Smart memory update - uses AI to integrate new info
   */
  async smartUpdate(newInfo: string, aiCallback: (prompt: string) => Promise<string>): Promise<boolean> {
    const currentContent = this.readMemory();
    
    const prompt = `You have been asked to add or update information in the memory file.

Current memory file content:
\`\`\`
${currentContent || '[empty file]'}
\`\`\`

New information to add/update:
\`\`\`
${newInfo}
\`\`\`

Please follow these guidelines:
- If the input is an update to an existing memory, edit or replace the existing entry
- Do not elaborate on the memory or add unnecessary commentary
- Preserve the existing structure of the file and integrate new memories naturally
- If the file is empty, just add the new memory as a bullet entry under an appropriate section

Return ONLY the updated file content, nothing else.`;

    try {
      const updatedContent = await aiCallback(prompt);
      return this.writeMemory(updatedContent);
    } catch (error) {
      // Fallback to simple append
      return this.appendMemory(`- ${newInfo}`);
    }
  }
}

/**
 * Get memory prompt for system context
 */
export function getMemoryPrompt(memoryManager: MemoryManager): string {
  if (!memoryManager.hasMemory() && !memoryManager.hasGlobalMemory()) {
    return '';
  }
  
  const context = memoryManager.getFullContext();
  if (!context) {
    return '';
  }
  
  return `# Project Memory (from AHURA.md)
The following information has been saved from previous sessions. Use it to maintain context and follow established patterns.

${context}`;
}

/**
 * Create memory manager for current working directory
 */
export function createMemoryManager(workingDirectory: string): MemoryManager {
  return new MemoryManager(workingDirectory);
}
