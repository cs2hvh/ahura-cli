/**
 * Logger Utility
 * Provides colorful, structured logging for the agent system
 */

import chalk from 'chalk';
import { AgentRole, LogEntry } from '../types/index.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const AGENT_COLORS: Record<AgentRole, typeof chalk.blue> = {
  planner: chalk.magenta,
  coder: chalk.cyan,
  tester: chalk.yellow,
  reviewer: chalk.green
};

const AGENT_ICONS: Record<AgentRole, string> = {
  planner: '📋',
  coder: '💻',
  tester: '🔍',
  reviewer: '✅'
};

export class Logger {
  private minLevel: LogLevel;
  private logs: LogEntry[] = [];

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatTimestamp(): string {
    return new Date().toISOString().split('T')[1].split('.')[0];
  }

  private log(level: LogLevel, message: string, agent?: AgentRole, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      agent,
      timestamp: new Date(),
      data
    };
    this.logs.push(entry);

    const timestamp = chalk.gray(`[${this.formatTimestamp()}]`);
    const levelBadge = this.getLevelBadge(level);
    const agentBadge = agent ? this.getAgentBadge(agent) : '';

    console.log(`${timestamp} ${levelBadge} ${agentBadge}${message}`);
    
    if (data && this.minLevel === 'debug') {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }

  private getLevelBadge(level: LogLevel): string {
    switch (level) {
      case 'debug': return chalk.gray('[DEBUG]');
      case 'info': return chalk.blue('[INFO] ');
      case 'warn': return chalk.yellow('[WARN] ');
      case 'error': return chalk.red('[ERROR]');
    }
  }

  private getAgentBadge(agent: AgentRole): string {
    const color = AGENT_COLORS[agent];
    const icon = AGENT_ICONS[agent];
    return color(`${icon} [${agent.toUpperCase()}] `);
  }

  debug(message: string, agent?: AgentRole, data?: unknown): void {
    this.log('debug', message, agent, data);
  }

  info(message: string, agent?: AgentRole, data?: unknown): void {
    this.log('info', message, agent, data);
  }

  warn(message: string, agent?: AgentRole, data?: unknown): void {
    this.log('warn', message, agent, data);
  }

  error(message: string, agent?: AgentRole, data?: unknown): void {
    this.log('error', message, agent, data);
  }

  // Special formatted outputs
  header(title: string): void {
    console.log('\n' + chalk.bold.white('═'.repeat(60)));
    console.log(chalk.bold.white(`  ${title}`));
    console.log(chalk.bold.white('═'.repeat(60)) + '\n');
  }

  section(title: string): void {
    console.log('\n' + chalk.cyan('─'.repeat(40)));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan('─'.repeat(40)));
  }

  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  failure(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  progress(current: number, total: number, label: string): void {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 5);
    const empty = 20 - filled;
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    console.log(`${bar} ${percent}% - ${label}`);
  }

  agentThinking(agent: AgentRole): void {
    const color = AGENT_COLORS[agent];
    const icon = AGENT_ICONS[agent];
    console.log(color(`\n${icon} ${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent is thinking...`));
  }

  agentResponse(agent: AgentRole, summary: string): void {
    const color = AGENT_COLORS[agent];
    const icon = AGENT_ICONS[agent];
    console.log(color(`${icon} ${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent: ${summary}\n`));
  }

  fileOperation(operation: 'create' | 'update' | 'delete', path: string): void {
    const icons = { create: '📄', update: '📝', delete: '🗑️' };
    const colors = { create: chalk.green, update: chalk.yellow, delete: chalk.red };
    console.log(colors[operation](`  ${icons[operation]} ${operation.toUpperCase()}: ${path}`));
  }

  taskStatus(taskId: string, title: string, status: string): void {
    const statusIcons: Record<string, string> = {
      'pending': '⏳',
      'in-progress': '🔄',
      'completed': '✅',
      'failed': '❌',
      'blocked': '🚫'
    };
    const icon = statusIcons[status] || '•';
    console.log(`  ${icon} Task ${taskId}: ${title} [${status}]`);
  }

  retryWarning(taskId: string, attempt: number, maxAttempts: number): void {
    console.log(chalk.yellow(`\n⚠️ Retry ${attempt}/${maxAttempts} for task ${taskId}`));
  }

  escalation(message: string): void {
    console.log(chalk.red.bold(`\n🚨 ESCALATION: ${message}`));
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  exportLogs(): string {
    return this.logs.map(entry => 
      `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] ${entry.agent ? `[${entry.agent}] ` : ''}${entry.message}`
    ).join('\n');
  }
}

// Singleton instance
export const logger = new Logger('info');
