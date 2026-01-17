/**
 * Repository Map - Structural Context for AI
 * 
 * Creates a skeletal representation of the codebase showing:
 * - File structure
 * - Class/function signatures
 * - Exports and imports
 * 
 * This gives the AI structural understanding without overwhelming tokens.
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileStub {
  path: string;
  type: 'file' | 'directory';
  language?: string;
  exports?: string[];
  imports?: string[];
  classes?: ClassStub[];
  functions?: FunctionStub[];
  size?: number;
}

interface ClassStub {
  name: string;
  extends?: string;
  implements?: string[];
  methods: string[];
  properties?: string[];
}

interface FunctionStub {
  name: string;
  signature: string;
  isExported: boolean;
  isAsync: boolean;
}

// File extensions to analyze
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.json', '.yaml', '.yml', '.toml'
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'venv', '.venv',
  'coverage', '.nyc_output', '.turbo', '.vercel'
]);

/**
 * Generate a repository map for the given directory
 */
export function generateRepoMap(rootDir: string, maxDepth: number = 4, maxFiles: number = 100): string {
  const files: FileStub[] = [];
  
  function scanDir(dir: string, depth: number, relativePath: string = '') {
    if (depth > maxDepth || files.length >= maxFiles) return;
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (files.length >= maxFiles) break;
        if (SKIP_DIRS.has(item) || item.startsWith('.')) continue;
        
        const fullPath = path.join(dir, item);
        const relPath = relativePath ? `${relativePath}/${item}` : item;
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            files.push({ path: relPath + '/', type: 'directory' });
            scanDir(fullPath, depth + 1, relPath);
          } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (CODE_EXTENSIONS.has(ext)) {
              const stub = analyzeFile(fullPath, relPath, ext);
              if (stub) files.push(stub);
            }
          }
        } catch {
          // Skip files we can't access
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  scanDir(rootDir, 0);
  
  return formatRepoMap(files);
}

/**
 * Analyze a single file and extract structure
 */
function analyzeFile(fullPath: string, relPath: string, ext: string): FileStub | null {
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const size = content.length;
    
    // Skip very large files
    if (size > 100000) {
      return { path: relPath, type: 'file', language: getLanguage(ext), size };
    }
    
    const stub: FileStub = {
      path: relPath,
      type: 'file',
      language: getLanguage(ext),
      exports: [],
      imports: [],
      classes: [],
      functions: [],
      size
    };
    
    // Extract based on language
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      extractTypeScriptStructure(content, stub);
    } else if (ext === '.py') {
      extractPythonStructure(content, stub);
    } else if (ext === '.json' && relPath.includes('package.json')) {
      extractPackageJsonInfo(content, stub);
    }
    
    return stub;
  } catch {
    return { path: relPath, type: 'file', language: getLanguage(ext) };
  }
}

/**
 * Extract structure from TypeScript/JavaScript files
 */
function extractTypeScriptStructure(content: string, stub: FileStub): void {
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Imports
    const importMatch = trimmed.match(/^import\s+(?:{[^}]+}|[^;]+)\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      stub.imports!.push(importMatch[1]);
      continue;
    }
    
    // Exports
    if (trimmed.startsWith('export default')) {
      stub.exports!.push('default');
    } else if (trimmed.startsWith('export ')) {
      const exportMatch = trimmed.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
      if (exportMatch) {
        stub.exports!.push(exportMatch[1]);
      }
    }
    
    // Classes
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/);
    if (classMatch) {
      stub.classes!.push({
        name: classMatch[1],
        extends: classMatch[2],
        implements: classMatch[3]?.split(',').map(s => s.trim()),
        methods: []
      });
      continue;
    }
    
    // Functions (top-level)
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/);
    if (funcMatch) {
      stub.functions!.push({
        name: funcMatch[1],
        signature: `${funcMatch[1]}(${funcMatch[2]})${funcMatch[3] ? ': ' + funcMatch[3].trim() : ''}`,
        isExported: trimmed.startsWith('export'),
        isAsync: trimmed.includes('async ')
      });
      continue;
    }
    
    // Arrow functions (const/let)
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/);
    if (arrowMatch) {
      stub.functions!.push({
        name: arrowMatch[1],
        signature: arrowMatch[1],
        isExported: trimmed.startsWith('export'),
        isAsync: trimmed.includes('async')
      });
    }
  }
  
  // Limit to most important items
  stub.imports = stub.imports!.slice(0, 10);
  stub.exports = stub.exports!.slice(0, 15);
  stub.classes = stub.classes!.slice(0, 5);
  stub.functions = stub.functions!.slice(0, 10);
}

/**
 * Extract structure from Python files
 */
function extractPythonStructure(content: string, stub: FileStub): void {
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Imports
    const importMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
    if (importMatch) {
      stub.imports!.push(importMatch[1] || importMatch[2].split(',')[0].trim());
      continue;
    }
    
    // Classes
    const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?:/);
    if (classMatch) {
      stub.classes!.push({
        name: classMatch[1],
        extends: classMatch[2]?.split(',')[0]?.trim(),
        methods: []
      });
      continue;
    }
    
    // Functions (top-level only - not indented)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
      if (funcMatch) {
        stub.functions!.push({
          name: funcMatch[1],
          signature: `${funcMatch[1]}(${funcMatch[2]})${funcMatch[3] ? ' -> ' + funcMatch[3].trim() : ''}`,
          isExported: !funcMatch[1].startsWith('_'),
          isAsync: trimmed.startsWith('async')
        });
      }
    }
  }
  
  stub.imports = stub.imports!.slice(0, 10);
  stub.classes = stub.classes!.slice(0, 5);
  stub.functions = stub.functions!.slice(0, 10);
}

/**
 * Extract info from package.json
 */
function extractPackageJsonInfo(content: string, stub: FileStub): void {
  try {
    const pkg = JSON.parse(content);
    stub.exports = [];
    
    if (pkg.name) stub.exports.push(`name: ${pkg.name}`);
    if (pkg.version) stub.exports.push(`version: ${pkg.version}`);
    if (pkg.main) stub.exports.push(`main: ${pkg.main}`);
    
    // Key dependencies
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
    if (deps.length > 0) {
      stub.imports = deps;
    }
  } catch {}
}

/**
 * Get language from file extension
 */
function getLanguage(ext: string): string {
  const langMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c', '.cpp': 'c++', '.h': 'c',
    '.vue': 'vue', '.svelte': 'svelte',
    '.css': 'css', '.scss': 'scss',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml'
  };
  return langMap[ext] || 'text';
}

/**
 * Format the repo map as a concise string for the AI
 */
function formatRepoMap(files: FileStub[]): string {
  const lines: string[] = ['REPOSITORY STRUCTURE:'];
  
  for (const file of files) {
    if (file.type === 'directory') {
      lines.push(`📁 ${file.path}`);
      continue;
    }
    
    let line = `📄 ${file.path}`;
    
    // Add exports summary
    if (file.exports && file.exports.length > 0) {
      line += ` [exports: ${file.exports.slice(0, 5).join(', ')}${file.exports.length > 5 ? '...' : ''}]`;
    }
    
    // Add class names
    if (file.classes && file.classes.length > 0) {
      const classNames = file.classes.map(c => c.name).join(', ');
      line += ` {classes: ${classNames}}`;
    }
    
    // Add function names (only if no classes)
    if ((!file.classes || file.classes.length === 0) && file.functions && file.functions.length > 0) {
      const funcNames = file.functions.slice(0, 5).map(f => f.name).join(', ');
      line += ` {functions: ${funcNames}${file.functions.length > 5 ? '...' : ''}}`;
    }
    
    lines.push(line);
  }
  
  return lines.join('\n');
}

/**
 * Get a compact repo summary (for context limit)
 */
export function getRepoSummary(rootDir: string): string {
  try {
    const map = generateRepoMap(rootDir, 3, 50);
    return map;
  } catch {
    return 'Unable to generate repository map';
  }
}
