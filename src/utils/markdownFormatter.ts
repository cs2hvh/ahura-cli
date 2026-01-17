/**
 * Markdown Formatter for CLI
 * Converts markdown to beautiful terminal output
 */

import chalk from 'chalk';

// Box drawing characters
const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  // Alternative for code blocks
  codeTop: '┌',
  codeBottom: '└',
  codeSide: '│'
};

/**
 * Format markdown text for terminal display
 */
export function formatMarkdown(text: string): string {
  if (!text) return '';
  
  let formatted = text;
  
  // Process code blocks FIRST (before other formatting)
  formatted = formatCodeBlocks(formatted);
  
  // Process inline code
  formatted = formatInlineCode(formatted);
  
  // Process headers
  formatted = formatHeaders(formatted);
  
  // Process bold and italic
  formatted = formatBoldItalic(formatted);
  
  // Process lists
  formatted = formatLists(formatted);
  
  // Process horizontal rules
  formatted = formatHorizontalRules(formatted);
  
  // Process links
  formatted = formatLinks(formatted);
  
  // Process blockquotes
  formatted = formatBlockquotes(formatted);
  
  return formatted;
}

/**
 * Format code blocks with syntax highlighting hints
 */
function formatCodeBlocks(text: string): string {
  // Match ```language\ncode\n```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  
  return text.replace(codeBlockRegex, (_, language, code) => {
    const lang = language || 'code';
    const lines = code.trimEnd().split('\n');
    const maxLength = Math.max(...lines.map((l: string) => stripAnsi(l).length), lang.length + 4);
    const width = Math.min(maxLength + 4, 80);
    
    // Build the code box
    const topBorder = chalk.gray(`  ${BOX.codeTop}${'─'.repeat(width)}${BOX.topRight}`);
    const langLabel = chalk.gray(`  ${BOX.codeSide} `) + chalk.cyan.bold(lang) + chalk.gray(' '.repeat(width - lang.length - 1) + BOX.codeSide);
    const separator = chalk.gray(`  ├${'─'.repeat(width)}┤`);
    const bottomBorder = chalk.gray(`  ${BOX.codeBottom}${'─'.repeat(width)}${BOX.bottomRight}`);
    
    const formattedLines = lines.map((line: string) => {
      const padding = width - stripAnsi(line).length - 1;
      return chalk.gray(`  ${BOX.codeSide} `) + chalk.green(line) + ' '.repeat(Math.max(0, padding)) + chalk.gray(BOX.codeSide);
    });
    
    return '\n' + topBorder + '\n' + langLabel + '\n' + separator + '\n' + formattedLines.join('\n') + '\n' + bottomBorder + '\n';
  });
}

/**
 * Format inline code `code`
 */
function formatInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, (_, code) => {
    return chalk.bgGray.white(` ${code} `);
  });
}

/**
 * Format headers # ## ###
 */
function formatHeaders(text: string): string {
  const lines = text.split('\n');
  
  return lines.map(line => {
    // H1: # Header
    if (/^# (.+)$/.test(line)) {
      const match = line.match(/^# (.+)$/);
      if (match) {
        return '\n' + chalk.bold.cyan.underline(`  ${match[1]}`) + '\n';
      }
    }
    
    // H2: ## Header
    if (/^## (.+)$/.test(line)) {
      const match = line.match(/^## (.+)$/);
      if (match) {
        return '\n' + chalk.bold.yellow(`  ${match[1]}`) + '\n' + chalk.gray('  ' + '─'.repeat(match[1].length));
      }
    }
    
    // H3: ### Header
    if (/^### (.+)$/.test(line)) {
      const match = line.match(/^### (.+)$/);
      if (match) {
        return chalk.bold.white(`  ${match[1]}`);
      }
    }
    
    // H4: #### Header
    if (/^#### (.+)$/.test(line)) {
      const match = line.match(/^#### (.+)$/);
      if (match) {
        return chalk.bold.gray(`  ${match[1]}`);
      }
    }
    
    return line;
  }).join('\n');
}

/**
 * Format bold **text** and italic *text*
 */
function formatBoldItalic(text: string): string {
  // Bold: **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, (_, content) => chalk.bold(content));
  text = text.replace(/__([^_]+)__/g, (_, content) => chalk.bold(content));
  
  // Italic: *text* or _text_ (but not inside words)
  text = text.replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, (_, content) => chalk.italic(content));
  text = text.replace(/(?<![_\w])_([^_]+)_(?![_\w])/g, (_, content) => chalk.italic(content));
  
  // Strikethrough: ~~text~~
  text = text.replace(/~~([^~]+)~~/g, (_, content) => chalk.strikethrough(content));
  
  return text;
}

/**
 * Format lists - and * and numbered
 */
function formatLists(text: string): string {
  const lines = text.split('\n');
  
  return lines.map(line => {
    // Unordered list with -
    if (/^(\s*)- (.+)$/.test(line)) {
      const match = line.match(/^(\s*)- (.+)$/);
      if (match) {
        const indent = match[1] || '';
        return `${indent}  ${chalk.cyan('•')} ${match[2]}`;
      }
    }
    
    // Unordered list with *
    if (/^(\s*)\* (.+)$/.test(line)) {
      const match = line.match(/^(\s*)\* (.+)$/);
      if (match) {
        const indent = match[1] || '';
        return `${indent}  ${chalk.cyan('•')} ${match[2]}`;
      }
    }
    
    // Ordered list
    if (/^(\s*)(\d+)\. (.+)$/.test(line)) {
      const match = line.match(/^(\s*)(\d+)\. (.+)$/);
      if (match) {
        const indent = match[1] || '';
        return `${indent}  ${chalk.yellow(match[2] + '.')} ${match[3]}`;
      }
    }
    
    // Checkbox - [ ] and - [x]
    if (/^(\s*)- \[ \] (.+)$/.test(line)) {
      const match = line.match(/^(\s*)- \[ \] (.+)$/);
      if (match) {
        const indent = match[1] || '';
        return `${indent}  ${chalk.gray('☐')} ${match[2]}`;
      }
    }
    if (/^(\s*)- \[x\] (.+)$/i.test(line)) {
      const match = line.match(/^(\s*)- \[x\] (.+)$/i);
      if (match) {
        const indent = match[1] || '';
        return `${indent}  ${chalk.green('☑')} ${match[2]}`;
      }
    }
    
    return line;
  }).join('\n');
}

/**
 * Format horizontal rules ---
 */
function formatHorizontalRules(text: string): string {
  return text.replace(/^-{3,}$/gm, chalk.gray('  ' + '─'.repeat(50)));
}

/**
 * Format links [text](url)
 */
function formatLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    return chalk.blue.underline(linkText) + chalk.gray(` (${url})`);
  });
}

/**
 * Format blockquotes > text
 */
function formatBlockquotes(text: string): string {
  const lines = text.split('\n');
  
  return lines.map(line => {
    if (/^> (.+)$/.test(line)) {
      const match = line.match(/^> (.+)$/);
      if (match) {
        return chalk.gray('  │ ') + chalk.italic.gray(match[1]);
      }
    }
    return line;
  }).join('\n');
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Format a complete response with nice borders
 */
export function formatResponse(text: string, agentName?: string): string {
  const formatted = formatMarkdown(text);
  
  const lines = formatted.split('\n');
  const header = agentName ? chalk.bold.cyan(`  ${agentName}`) + '\n' : '';
  
  return header + lines.map(line => {
    // Don't double-indent lines that are already formatted
    if (line.startsWith('  ')) return line;
    return '  ' + line;
  }).join('\n');
}

/**
 * Create a simple info box
 */
export function infoBox(title: string, content: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(title.length, ...lines.map(l => stripAnsi(l).length));
  const width = maxLength + 4;
  
  const top = chalk.cyan(`  ${BOX.topLeft}${'─'.repeat(width)}${BOX.topRight}`);
  const titleLine = chalk.cyan(`  ${BOX.vertical} `) + chalk.bold.white(title) + ' '.repeat(width - title.length - 1) + chalk.cyan(BOX.vertical);
  const sep = chalk.cyan(`  ├${'─'.repeat(width)}┤`);
  const bottom = chalk.cyan(`  ${BOX.bottomLeft}${'─'.repeat(width)}${BOX.bottomRight}`);
  
  const contentLines = lines.map(line => {
    const padding = width - stripAnsi(line).length - 1;
    return chalk.cyan(`  ${BOX.vertical} `) + line + ' '.repeat(Math.max(0, padding)) + chalk.cyan(BOX.vertical);
  });
  
  return [top, titleLine, sep, ...contentLines, bottom].join('\n');
}

/**
 * Create a success box
 */
export function successBox(message: string): string {
  return chalk.green(`  ✓ ${message}`);
}

/**
 * Create an error box
 */
export function errorBox(message: string): string {
  return chalk.red(`  ✗ ${message}`);
}

/**
 * Create a warning box
 */
export function warningBox(message: string): string {
  return chalk.yellow(`  ⚠ ${message}`);
}
