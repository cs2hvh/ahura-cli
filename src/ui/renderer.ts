/**
 * Terminal UI Renderer
 * Handles all terminal output formatting and live updates
 */

import chalk from 'chalk';
import boxen from 'boxen';
import logUpdate from 'log-update';
import cliSpinners from 'cli-spinners';
import { AgentRole } from '../types/index.js';

const AGENT_COLORS: Record<AgentRole, (text: string) => string> = {
  planner: chalk.magenta,
  coder: chalk.cyan,
  tester: chalk.yellow,
  reviewer: chalk.green
};

const AGENT_ICONS: Record<AgentRole, string> = {
  planner: '🧠',
  coder: '💻',
  tester: '🔍',
  reviewer: '✅'
};

const AGENT_NAMES: Record<AgentRole, string> = {
  planner: 'Planner',
  coder: 'Coder',
  tester: 'Tester',
  reviewer: 'Reviewer'
};

export class Renderer {
  private spinnerFrame = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private currentSpinnerText = '';
  private spinner = cliSpinners.dots;

  /**
   * Show the main banner
   */
  banner(): void {
    const logo = chalk.cyan(`
   █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗ 
  ██╔══██╗██║  ██║██║   ██║██╔══██╗██╔══██╗
  ███████║███████║██║   ██║██████╔╝███████║
  ██╔══██║██╔══██║██║   ██║██╔══██╗██╔══██║
  ██║  ██║██║  ██║╚██████╔╝██║  ██║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
`);
    console.log(logo);
    console.log(chalk.gray('  Self-Agent Dev Swarm • Type /help for commands\n'));
  }

  /**
   * Show welcome message
   */
  welcome(): void {
    console.log(boxen(
      chalk.white('Welcome to ') + chalk.cyan.bold('Ahurasense') + chalk.white('!\n\n') +
      chalk.gray('Just type what you want to build and press Enter.\n') +
      chalk.gray('The AI agents will plan, code, test, and deliver.\n\n') +
      chalk.dim('Examples:\n') +
      chalk.cyan('  "Build a todo app with React"\n') +
      chalk.cyan('  "Create a REST API with authentication"\n') +
      chalk.cyan('  "Make a CLI tool for file management"'),
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 2, right: 2 },
        borderStyle: 'round',
        borderColor: 'cyan'
      }
    ));
  }

  /**
   * Show the prompt
   */
  prompt(): void {
    process.stdout.write(chalk.cyan('\n❯ '));
  }

  /**
   * Show agent header when agent starts working (role-based)
   */
  agentHeader(roleOrName: AgentRole | string, action: string): void {
    // Handle string agent names for backward compatibility
    const roleKey = typeof roleOrName === 'string' 
      ? roleOrName.toLowerCase() as AgentRole 
      : roleOrName;
    
    const color = AGENT_COLORS[roleKey] || chalk.white;
    const icon = AGENT_ICONS[roleKey] || '🤖';
    const name = AGENT_NAMES[roleKey] || roleOrName;
    
    console.log('\n' + color('─'.repeat(60)));
    console.log(color(`${icon} ${name} Agent`) + chalk.gray(` • ${action}`));
    console.log(color('─'.repeat(60)));
  }

  /**
   * Show agent thinking with spinner (role-based)
   */
  startThinking(roleOrText: AgentRole | string, task?: string): () => void {
    // If first arg is a known role, use role-based display
    const roleKey = roleOrText.toLowerCase() as AgentRole;
    const isRole = AGENT_COLORS[roleKey] !== undefined;
    
    const color = isRole ? AGENT_COLORS[roleKey] : chalk.cyan;
    const icon = isRole ? AGENT_ICONS[roleKey] : '⏳';
    const name = isRole ? AGENT_NAMES[roleKey] : '';
    
    this.currentSpinnerText = task 
      ? `${icon} ${name} is working on: ${task}`
      : isRole 
        ? `${icon} ${name} is thinking...`
        : `${icon} ${roleOrText}`;
    
    this.spinnerFrame = 0;
    this.spinnerInterval = setInterval(() => {
      const frame = this.spinner.frames[this.spinnerFrame % this.spinner.frames.length];
      logUpdate(color(`${frame} ${this.currentSpinnerText}`));
      this.spinnerFrame++;
    }, this.spinner.interval);

    // Return a stop function for convenience
    return () => this.stopThinking();
  }

  /**
   * Stop the spinner
   */
  stopThinking(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      logUpdate.clear();
    }
  }

  /**
   * Stream text character by character (like ChatGPT/Claude)
   */
  async streamText(text: string, color: (s: string) => string = chalk.white, delay = 5): Promise<void> {
    for (const char of text) {
      process.stdout.write(color(char));
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Show agent message (non-streaming)
   */
  agentMessage(role: AgentRole, message: string): void {
    const color = AGENT_COLORS[role];
    const icon = AGENT_ICONS[role];
    console.log(color(`${icon} `) + chalk.white(message));
  }

  /**
   * Show a divider line
   */
  divider(color: (s: string) => string = chalk.gray): void {
    console.log(color('─'.repeat(60)));
  }

  /**
   * Show a section header
   */
  section(title: string, icon = '📋'): void {
    console.log('\n' + chalk.cyan(`${icon} ${title}`));
    console.log(chalk.cyan('─'.repeat(40)));
  }

  /**
   * Show a task item
   */
  task(id: string, title: string, status: 'pending' | 'in-progress' | 'completed' | 'failed'): void {
    const icons = {
      'pending': chalk.gray('○'),
      'in-progress': chalk.yellow('◐'),
      'completed': chalk.green('●'),
      'failed': chalk.red('✗')
    };
    const colors = {
      'pending': chalk.gray,
      'in-progress': chalk.yellow,
      'completed': chalk.green,
      'failed': chalk.red
    };
    console.log(`  ${icons[status]} ${colors[status](title)} ${chalk.dim(`[${id}]`)}`);
  }

  /**
   * Show file operation
   */
  fileOp(operation: 'create' | 'update' | 'delete', path: string): void {
    const icons = { create: '📄', update: '📝', delete: '🗑️' };
    const colors = { 
      create: chalk.green, 
      update: chalk.yellow, 
      delete: chalk.red 
    };
    console.log(colors[operation](`  ${icons[operation]} ${operation.toUpperCase()}: ${path}`));
  }

  /**
   * Show code block with syntax highlighting
   */
  codeBlock(code: string, language = 'javascript', filename?: string): void {
    if (filename) {
      console.log(chalk.dim(`\n┌─ ${filename}`));
    }
    console.log(chalk.dim('│'));
    
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      const lineNum = chalk.dim(`${String(i + 1).padStart(3)} │`);
      console.log(`${lineNum} ${chalk.white(line)}`);
    });
    
    console.log(chalk.dim('└' + '─'.repeat(50)));
  }

  /**
   * Show a diff (old vs new code)
   */
  diff(filename: string, removed: string[], added: string[]): void {
    console.log(chalk.dim(`\n┌─ ${filename}`));
    removed.forEach(line => {
      console.log(chalk.red(`- ${line}`));
    });
    added.forEach(line => {
      console.log(chalk.green(`+ ${line}`));
    });
    console.log(chalk.dim('└' + '─'.repeat(50)));
  }

  /**
   * Show success message
   */
  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  /**
   * Show error message
   */
  error(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  /**
   * Show warning message
   */
  warn(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  /**
   * Show warning message (alias)
   */
  warning(message: string): void {
    this.warn(message);
  }

  /**
   * Show info message
   */
  info(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }

  /**
   * Show progress bar
   */
  progress(current: number, total: number, label: string): void {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 5);
    const empty = 20 - filled;
    const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(`  ${bar} ${percent}% ${chalk.gray(label)}`);
  }

  /**
   * Show a box with content
   */
  box(content: string, options?: { title?: string; borderColor?: string }): void {
    console.log(boxen(content, {
      padding: 1,
      borderStyle: 'round',
      borderColor: (options?.borderColor as any) || 'white',
      title: options?.title
    }));
  }

  /**
   * Show plan summary (simple version)
   */
  planSummary(tasksCount: number, filesCount: number, estimatedTime: string): void {
    console.log('\n' + boxen(
      chalk.white.bold(`📋 Development Plan Created\n\n`) +
      chalk.cyan(`Tasks: `) + chalk.white(`${tasksCount}\n`) +
      chalk.cyan(`Files: `) + chalk.white(`${filesCount}\n`) +
      chalk.cyan(`Estimated: `) + chalk.white(estimatedTime),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
        title: '🧠 Planner'
      }
    ));
  }

  /**
   * Show detailed plan summary
   */
  planSummaryDetailed(plan: { projectName: string; tasks: { title: string }[]; techStack: any }): void {
    console.log('\n' + boxen(
      chalk.white.bold(`📋 Project: ${plan.projectName}\n\n`) +
      chalk.cyan('Tasks:\n') +
      plan.tasks.map((t, i) => chalk.gray(`  ${i + 1}. ${t.title}`)).join('\n') +
      '\n\n' +
      chalk.cyan('Tech Stack:\n') +
      chalk.gray(`  Frontend: ${plan.techStack.frontend?.join(', ') || 'N/A'}\n`) +
      chalk.gray(`  Backend: ${plan.techStack.backend?.join(', ') || 'N/A'}\n`) +
      chalk.gray(`  Database: ${plan.techStack.database?.join(', ') || 'N/A'}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
        title: '🧠 Planner Output'
      }
    ));
  }

  /**
   * Show build complete (simple version)
   */
  buildComplete(phasesCompleted: number, duration: number): void {
    const seconds = Math.round(duration / 1000);
    console.log('\n' + boxen(
      chalk.green.bold('✅ BUILD COMPLETE\n\n') +
      chalk.cyan(`Phases: `) + chalk.white(`${phasesCompleted}\n`) +
      chalk.cyan(`Duration: `) + chalk.white(`${seconds}s`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green'
      }
    ));
  }

  /**
   * Show build complete (detailed version)
   */
  buildCompleteDetailed(success: boolean, projectPath: string, summary: string): void {
    const content = success
      ? chalk.green.bold('✅ BUILD SUCCESSFUL\n\n') +
        chalk.white(`📁 ${projectPath}\n\n`) +
        chalk.gray(summary)
      : chalk.yellow.bold('⚠️ BUILD COMPLETED WITH ISSUES\n\n') +
        chalk.white(`📁 ${projectPath}\n\n`) +
        chalk.gray(summary);

    console.log('\n' + boxen(content, {
      padding: 1,
      borderStyle: 'round',
      borderColor: success ? 'green' : 'yellow'
    }));
  }

  /**
   * Show help
   */
  help(): void {
    console.log(boxen(
      chalk.cyan.bold('Commands:\n\n') +
      chalk.white('/help, /h') + chalk.gray('        - Show this help\n') +
      chalk.white('/status, /s') + chalk.gray('      - Show current status\n') +
      chalk.white('/plan') + chalk.gray('            - Show current plan\n') +
      chalk.white('/files') + chalk.gray('           - List created files\n') +
      chalk.white('/clear') + chalk.gray('           - Clear screen\n') +
      chalk.white('/stop') + chalk.gray('            - Stop current task\n') +
      chalk.white('/retry') + chalk.gray('           - Retry failed task\n') +
      chalk.white('/output <dir>') + chalk.gray('    - Set output directory\n') +
      chalk.white('/exit, /quit') + chalk.gray('     - Exit Ahurasense\n\n') +
      chalk.cyan.bold('Talk to Agents:\n\n') +
      chalk.white('@planner') + chalk.gray('         - Ask the Planner\n') +
      chalk.white('@coder') + chalk.gray('           - Ask the Coder\n') +
      chalk.white('@tester') + chalk.gray('          - Ask the Tester\n') +
      chalk.white('@reviewer') + chalk.gray('        - Ask the Reviewer\n\n') +
      chalk.cyan.bold('Quick Actions:\n\n') +
      chalk.white('"Build a todo app"') + chalk.gray(' - Start building\n') +
      chalk.white('"Fix the bug in..."') + chalk.gray(' - Fix specific issue\n') +
      chalk.white('"Add feature..."') + chalk.gray('   - Add to current project'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: '❓ Help'
      }
    ));
  }

  /**
   * Clear the screen
   */
  clear(): void {
    console.clear();
  }

  /**
   * Newline
   */
  newline(): void {
    console.log('');
  }
}

export const renderer = new Renderer();
