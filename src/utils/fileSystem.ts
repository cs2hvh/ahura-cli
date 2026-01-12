/**
 * File System Manager
 * Handles all file and directory operations for the agents
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { FileOperation, FileTreeNode, FileSystemState } from '../types/index.js';
import { logger } from './logger.js';

export class FileSystemManager {
  private rootDir: string;
  private state: FileSystemState;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.state = {
      rootDir: this.rootDir,
      files: new Map(),
      directories: new Set()
    };
  }

  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Initialize the output directory
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.rootDir);
    logger.info(`Initialized output directory: ${this.rootDir}`);
  }

  /**
   * Create a directory (and all parent directories)
   */
  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    await fs.ensureDir(fullPath);
    this.state.directories.add(fullPath);
    logger.fileOperation('create', dirPath);
  }

  /**
   * Create or overwrite a file
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf-8');
    this.state.files.set(fullPath, content);
    logger.fileOperation('create', filePath);
  }

  /**
   * Update an existing file
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    await fs.writeFile(fullPath, content, 'utf-8');
    this.state.files.set(fullPath, content);
    logger.fileOperation('update', filePath);
  }

  /**
   * Read a file's content
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.remove(fullPath);
    this.state.files.delete(fullPath);
    logger.fileOperation('delete', filePath);
  }

  /**
   * Check if a path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    const fullPath = this.resolvePath(targetPath);
    return await fs.pathExists(fullPath);
  }

  /**
   * Execute multiple file operations
   */
  async executeOperations(operations: FileOperation[]): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'create':
            if (op.content !== undefined) {
              await this.createFile(op.path, op.content);
            } else {
              await this.createDirectory(op.path);
            }
            break;
          case 'update':
            if (op.content !== undefined) {
              await this.updateFile(op.path, op.content);
            }
            break;
          case 'delete':
            await this.deleteFile(op.path);
            break;
          case 'read':
            // Read operations don't modify anything
            break;
        }
      } catch (error) {
        const errorMsg = `Failed to ${op.type} ${op.path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Create the entire file tree from a plan
   */
  async createFileTree(tree: FileTreeNode[], basePath: string = ''): Promise<void> {
    for (const node of tree) {
      const nodePath = basePath ? path.join(basePath, node.name) : node.name;
      
      if (node.type === 'directory') {
        await this.createDirectory(nodePath);
        if (node.children) {
          await this.createFileTree(node.children, nodePath);
        }
      } else if (node.type === 'file' && node.content) {
        await this.createFile(nodePath, node.content);
      }
    }
  }

  /**
   * Get the current file tree
   */
  async getFileTree(dirPath: string = ''): Promise<FileTreeNode[]> {
    const fullPath = this.resolvePath(dirPath);
    const tree: FileTreeNode[] = [];

    if (!await fs.pathExists(fullPath)) {
      return tree;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        tree.push({
          name: entry.name,
          type: 'directory',
          path: entryPath,
          children: await this.getFileTree(entryPath)
        });
      } else {
        tree.push({
          name: entry.name,
          type: 'file',
          path: entryPath,
          language: this.detectLanguage(entry.name)
        });
      }
    }

    return tree;
  }

  /**
   * Get all files matching a pattern
   */
  async findFiles(pattern: string): Promise<string[]> {
    const files = await glob(pattern, { cwd: this.rootDir });
    return files;
  }

  /**
   * Read all files in the project
   */
  async readAllFiles(): Promise<Map<string, string>> {
    const files = await this.findFiles('**/*');
    const contents = new Map<string, string>();

    for (const file of files) {
      const fullPath = this.resolvePath(file);
      const stats = await fs.stat(fullPath);
      
      if (stats.isFile()) {
        try {
          const content = await this.readFile(file);
          contents.set(file, content);
        } catch {
          // Skip binary files
        }
      }
    }

    return contents;
  }

  /**
   * Get a summary of the project for context
   */
  async getProjectSummary(): Promise<string> {
    const tree = await this.getFileTree();
    return this.formatTreeAsString(tree);
  }

  private formatTreeAsString(tree: FileTreeNode[], indent: string = ''): string {
    let result = '';
    
    for (const node of tree) {
      if (node.type === 'directory') {
        result += `${indent}📁 ${node.name}/\n`;
        if (node.children) {
          result += this.formatTreeAsString(node.children, indent + '  ');
        }
      } else {
        result += `${indent}📄 ${node.name}\n`;
      }
    }
    
    return result;
  }

  /**
   * Execute a terminal command
   */
  async executeCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const execDir = cwd ? this.resolvePath(cwd) : this.rootDir;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd: execDir });
      return { stdout, stderr, code: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || (error instanceof Error ? error.message : 'Unknown error'),
        code: execError.code || 1
      };
    }
  }

  private resolvePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.join(this.rootDir, relativePath);
  }

  private detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'shellscript',
      '.bash': 'shellscript',
      '.ps1': 'powershell',
      '.xml': 'xml',
      '.env': 'plaintext',
      '.txt': 'plaintext'
    };
    return langMap[ext] || 'plaintext';
  }
}
