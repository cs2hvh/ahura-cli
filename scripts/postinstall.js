#!/usr/bin/env node
/**
 * Post-install script for Ahurasense CLI
 * Shows welcome message and setup instructions
 */

import chalk from 'chalk';
import boxen from 'boxen';

const message = `
${chalk.cyan.bold('✨ Ahurasense CLI installed successfully!')}

${chalk.white('Quick Start:')}
  ${chalk.gray('$')} ${chalk.green('ahura init')}          ${chalk.gray('# Set up API keys')}
  ${chalk.gray('$')} ${chalk.green('ahura build')}         ${chalk.gray('# Start building')}
  ${chalk.gray('$')} ${chalk.green('ahura --help')}        ${chalk.gray('# See all commands')}

${chalk.white('Or use the full command:')}
  ${chalk.gray('$')} ${chalk.green('ahurasense build "Create a todo app"')}

${chalk.yellow('⚠️  Requires API keys:')}
  ${chalk.gray('• ANTHROPIC_API_KEY (required)')}
  ${chalk.gray('• OPENAI_API_KEY (for Tester agent)')}
`;

console.log(
  boxen(message, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  })
);
