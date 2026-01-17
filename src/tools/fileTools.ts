/**
 * File Tools
 * Tools for reading, writing, and managing files
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolResult, toolRegistry } from './toolRegistry.js';

// Get current working directory (set by CLI)
let workingDirectory = process.cwd();

export function setWorkingDirectory(dir: string): void {
  workingDirectory = dir;
}

export function getWorkingDirectory(): string {
  return workingDirectory;
}

// Read File Tool
const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content as text.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to the file to read',
      required: true
    },
    {
      name: 'encoding',
      type: 'string',
      description: 'The file encoding (default: utf-8)',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    const encoding = (params.encoding as BufferEncoding) || 'utf-8';
    
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workingDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      
      const content = fs.readFileSync(fullPath, encoding);
      return { success: true, data: content };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Write File Tool
const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it doesn\'t exist, or overwrites it if it does.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to the file to write',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content to write to the file',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    const content = params.content as string;
    
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workingDirectory, filePath);
      
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content, 'utf-8');
      return { success: true, data: `File written: ${filePath}` };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// List Directory Tool
const listDirectoryTool: ToolDefinition = {
  name: 'list_directory',
  description: 'List the contents of a directory. Returns file and folder names.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to the directory (default: current directory)',
      required: false
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'Whether to list recursively (default: false)',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const dirPath = (params.path as string) || '.';
    const recursive = params.recursive as boolean || false;
    
    try {
      const fullPath = path.isAbsolute(dirPath) 
        ? dirPath 
        : path.join(workingDirectory, dirPath);
      
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `Directory not found: ${dirPath}` };
      }
      
      const listDir = (dir: string, prefix = ''): string[] => {
        const items = fs.readdirSync(dir);
        const results: string[] = [];
        
        for (const item of items) {
          // Skip node_modules and hidden files
          if (item === 'node_modules' || item.startsWith('.')) continue;
          
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          const relativePath = prefix ? `${prefix}/${item}` : item;
          
          if (stat.isDirectory()) {
            results.push(`📁 ${relativePath}/`);
            if (recursive) {
              results.push(...listDir(itemPath, relativePath));
            }
          } else {
            results.push(`📄 ${relativePath}`);
          }
        }
        
        return results;
      };
      
      const files = listDir(fullPath);
      return { success: true, data: files.join('\n') };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// File Exists Tool
const fileExistsTool: ToolDefinition = {
  name: 'file_exists',
  description: 'Check if a file or directory exists.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to check',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workingDirectory, filePath);
      
      const exists = fs.existsSync(fullPath);
      const isDirectory = exists && fs.statSync(fullPath).isDirectory();
      
      return { 
        success: true, 
        data: { exists, isDirectory, path: filePath } 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to check file: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Delete File Tool
const deleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Delete a file or empty directory.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to delete',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workingDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmdirSync(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
      
      return { success: true, data: `Deleted: ${filePath}` };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Search in Files Tool
const searchInFilesTool: ToolDefinition = {
  name: 'search_in_files',
  description: 'Search for a pattern in files within a directory.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The text or regex pattern to search for',
      required: true
    },
    {
      name: 'path',
      type: 'string',
      description: 'The directory to search in (default: current directory)',
      required: false
    },
    {
      name: 'filePattern',
      type: 'string',
      description: 'File extension filter (e.g., ".ts", ".js")',
      required: false
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const pattern = params.pattern as string;
    const dirPath = (params.path as string) || '.';
    const filePattern = params.filePattern as string;
    
    try {
      const fullPath = path.isAbsolute(dirPath) 
        ? dirPath 
        : path.join(workingDirectory, dirPath);
      
      const results: Array<{ file: string; line: number; content: string }> = [];
      const regex = new RegExp(pattern, 'gi');
      
      const searchDir = (dir: string): void => {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          if (item === 'node_modules' || item.startsWith('.')) continue;
          
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            searchDir(itemPath);
          } else if (!filePattern || item.endsWith(filePattern)) {
            try {
              const content = fs.readFileSync(itemPath, 'utf-8');
              const lines = content.split('\n');
              
              lines.forEach((line, index) => {
                // Use match() instead of test() to avoid lastIndex bug with global regex
                if (line.match(regex)) {
                  results.push({
                    file: path.relative(workingDirectory, itemPath),
                    line: index + 1,
                    content: line.trim().substring(0, 100)
                  });
                }
              });
            } catch {
              // Skip binary files
            }
          }
        }
      };
      
      searchDir(fullPath);
      
      if (results.length === 0) {
        return { success: true, data: 'No matches found' };
      }
      
      const formatted = results.slice(0, 20).map(r => 
        `${r.file}:${r.line} - ${r.content}`
      ).join('\n');
      
      return { 
        success: true, 
        data: `Found ${results.length} matches:\n${formatted}${results.length > 20 ? '\n... and more' : ''}` 
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};

// Register all file tools
export function registerFileTools(): void {
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(listDirectoryTool);
  toolRegistry.register(fileExistsTool);
  toolRegistry.register(deleteFileTool);
  toolRegistry.register(searchInFilesTool);
  toolRegistry.register(readImageTool);
}

// Read Image Tool - returns base64 for vision analysis
const readImageTool: ToolDefinition = {
  name: 'read_image',
  description: 'Read an image file and return its base64 encoding for vision analysis. Supports PNG, JPG, JPEG, GIF, WEBP.',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'The relative or absolute path to the image file',
      required: true
    }
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workingDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `Image not found: ${filePath}` };
      }
      
      const ext = path.extname(fullPath).toLowerCase();
      const supportedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      
      if (!supportedExts.includes(ext)) {
        return { success: false, error: `Unsupported image format: ${ext}. Supported: ${supportedExts.join(', ')}` };
      }
      
      const imageBuffer = fs.readFileSync(fullPath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = ext === '.png' ? 'image/png' 
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg';
      
      return { 
        success: true, 
        data: {
          base64,
          mimeType,
          path: filePath,
          size: imageBuffer.length
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to read image: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
};
