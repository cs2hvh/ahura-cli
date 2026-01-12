/**
 * Tester Agent
 * QA/Security role - adversarial testing from a different AI provider
 * Uses GPT-4o to avoid model bias and provide independent review
 */

import { BaseAgent } from './baseAgent.js';
import { 
  AgentResponse, 
  TestResult, 
  SecurityIssue,
  CodeReviewResult
} from '../types/index.js';
import { AGENT_CONFIGS } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface TesterOutput {
  overallStatus: 'pass' | 'fail';
  bugs: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    line?: number;
    type: 'bug' | 'security' | 'logic' | 'performance';
    description: string;
    impact: string;
    fix: string;
  }>;
  securityIssues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    file: string;
    description: string;
    recommendation: string;
  }>;
  suggestions: string[];
  passedChecks: string[];
}

export interface TestingResult {
  passed: boolean;
  bugs: TesterOutput['bugs'];
  securityIssues: TesterOutput['securityIssues'];
  suggestions: string[];
  passedChecks: string[];
  summary: string;
}

export class TesterAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.tester);
  }

  /**
   * Main task processor for the Tester
   */
  async processTask(task: string, context?: Record<string, unknown>): Promise<AgentResponse> {
    const contextStr = context ? JSON.stringify(context, null, 2) : undefined;
    return await this.chat(task, contextStr);
  }

  /**
   * Run comprehensive tests on the codebase
   */
  async runTests(
    files: Map<string, string>, 
    designDoc: string
  ): Promise<TestingResult> {
    logger.section('Testing Phase');
    logger.info('Running comprehensive code analysis...', 'tester');

    // Convert files map to readable format
    const filesContent = Array.from(files.entries())
      .map(([path, content]) => `
--- FILE: ${path} ---
${content}
--- END FILE ---
`).join('\n');

    const testPrompt = `
You are performing adversarial testing on a codebase. Your job is to FIND PROBLEMS.

Design Document (Original Requirements):
${designDoc}

CODEBASE TO TEST:
${filesContent}

Perform the following checks:

1. BUG DETECTION
   - Logic errors
   - Off-by-one errors
   - Null/undefined handling
   - Race conditions
   - Memory leaks
   - Resource handling

2. SECURITY ANALYSIS
   - SQL Injection vulnerabilities
   - XSS vulnerabilities
   - CSRF vulnerabilities
   - Authentication flaws
   - Authorization issues
   - Sensitive data exposure
   - Insecure dependencies
   - Hardcoded secrets

3. CODE QUALITY
   - Missing error handling
   - Poor input validation
   - Incomplete implementations
   - Missing edge case handling

4. REQUIREMENTS COMPLIANCE
   - Does the code meet the design document specifications?
   - Are all required features implemented?

Be THOROUGH and CRITICAL. You are the last line of defense.
Respond with detailed JSON following your output format.
`;

    const response = await this.chat(testPrompt);
    
    if (!response.success) {
      return {
        passed: false,
        bugs: [],
        securityIssues: [],
        suggestions: [],
        passedChecks: [],
        summary: `Testing failed: ${response.error}`
      };
    }

    try {
      const output = this.parseJsonResponse<TesterOutput>(response.content);
      
      if (!output) {
        return {
          passed: false,
          bugs: [],
          securityIssues: [],
          suggestions: [],
          passedChecks: [],
          summary: 'Could not parse test results'
        };
      }

      const hasCriticalIssues = 
        output.bugs.some(b => b.severity === 'critical' || b.severity === 'high') ||
        output.securityIssues.some(s => s.severity === 'critical' || s.severity === 'high');

      const result: TestingResult = {
        passed: output.overallStatus === 'pass' && !hasCriticalIssues,
        bugs: output.bugs || [],
        securityIssues: output.securityIssues || [],
        suggestions: output.suggestions || [],
        passedChecks: output.passedChecks || [],
        summary: this.generateSummary(output)
      };

      // Log results
      this.logTestResults(result);

      return result;
    } catch (error) {
      return {
        passed: false,
        bugs: [],
        securityIssues: [],
        suggestions: [],
        passedChecks: [],
        summary: `Error analyzing code: ${error}`
      };
    }
  }

  /**
   * Test a single file
   */
  async testFile(
    filePath: string, 
    content: string, 
    context?: string
  ): Promise<CodeReviewResult> {
    const testPrompt = `
Analyze this file for bugs and security issues:

File: ${filePath}

\`\`\`
${content}
\`\`\`

${context ? `Additional Context:\n${context}` : ''}

Look for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Missing error handling
4. Code quality issues

Respond with JSON:
{
  "file": "${filePath}",
  "issues": [
    { "type": "bug|style|performance|security|logic", "severity": "error|warning|info", "line": 0, "message": "", "suggestion": "" }
  ],
  "suggestions": ["improvement suggestions"],
  "approved": true/false
}
`;

    const response = await this.chat(testPrompt);
    
    if (!response.success) {
      return {
        file: filePath,
        issues: [],
        suggestions: [],
        approved: false
      };
    }

    try {
      const result = this.parseJsonResponse<CodeReviewResult>(response.content);
      return result || { file: filePath, issues: [], suggestions: [], approved: false };
    } catch {
      return {
        file: filePath,
        issues: [],
        suggestions: [],
        approved: false
      };
    }
  }

  /**
   * Verify that bugs have been fixed
   */
  async verifyFixes(
    originalBugs: TesterOutput['bugs'],
    updatedFiles: Map<string, string>
  ): Promise<{ allFixed: boolean; remainingBugs: TesterOutput['bugs'] }> {
    logger.info('Verifying bug fixes...', 'tester');

    const filesContent = Array.from(updatedFiles.entries())
      .filter(([path]) => originalBugs.some(b => b.file === path))
      .map(([path, content]) => `
--- FILE: ${path} ---
${content}
--- END FILE ---
`).join('\n');

    const verifyPrompt = `
Verify that the following bugs have been fixed in the updated code:

ORIGINAL BUGS:
${originalBugs.map((bug, i) => `
${i + 1}. [${bug.severity.toUpperCase()}] ${bug.file}${bug.line ? `:${bug.line}` : ''}
   Type: ${bug.type}
   Issue: ${bug.description}
   Required Fix: ${bug.fix}
`).join('\n')}

UPDATED CODE:
${filesContent}

For each bug, determine if it has been properly fixed.

Respond with JSON:
{
  "results": [
    { "bugIndex": 0, "fixed": true/false, "notes": "explanation" }
  ],
  "remainingBugs": [
    // Include only bugs that are NOT fixed, with same structure as input
  ]
}
`;

    const response = await this.chat(verifyPrompt);
    
    if (!response.success) {
      return { allFixed: false, remainingBugs: originalBugs };
    }

    try {
      const result = this.parseJsonResponse<{
        results: Array<{ bugIndex: number; fixed: boolean; notes: string }>;
        remainingBugs: TesterOutput['bugs'];
      }>(response.content);

      if (result) {
        const allFixed = result.remainingBugs.length === 0;
        logger.info(
          allFixed 
            ? 'All bugs have been fixed!' 
            : `${result.remainingBugs.length} bugs remaining`,
          'tester'
        );
        return { allFixed, remainingBugs: result.remainingBugs };
      }
    } catch {
      // Fall through to return all bugs
    }

    return { allFixed: false, remainingBugs: originalBugs };
  }

  /**
   * Run security-focused scan
   */
  async securityScan(files: Map<string, string>): Promise<SecurityIssue[]> {
    logger.info('Running security scan...', 'tester');

    const filesContent = Array.from(files.entries())
      .map(([path, content]) => `
--- FILE: ${path} ---
${content}
--- END FILE ---
`).join('\n');

    const securityPrompt = `
Perform a focused SECURITY AUDIT on this codebase.

CODEBASE:
${filesContent}

Check for:
1. Injection Attacks (SQL, NoSQL, Command, LDAP)
2. Cross-Site Scripting (XSS) - Reflected, Stored, DOM-based
3. Cross-Site Request Forgery (CSRF)
4. Broken Authentication
5. Sensitive Data Exposure
6. XML External Entities (XXE)
7. Broken Access Control
8. Security Misconfiguration
9. Insecure Deserialization
10. Using Components with Known Vulnerabilities

For each issue found, provide:
- Severity (critical/high/medium/low)
- Type of vulnerability
- Affected file and line
- Description of the issue
- Recommendation to fix

Respond with JSON array of security issues.
`;

    const response = await this.chat(securityPrompt);
    
    if (!response.success) {
      return [];
    }

    try {
      const issues = this.parseJsonResponse<SecurityIssue[]>(response.content);
      return issues || [];
    } catch {
      return [];
    }
  }

  /**
   * Generate test summary
   */
  private generateSummary(output: TesterOutput): string {
    const criticalBugs = output.bugs.filter(b => b.severity === 'critical').length;
    const highBugs = output.bugs.filter(b => b.severity === 'high').length;
    const criticalSec = output.securityIssues.filter(s => s.severity === 'critical').length;
    const highSec = output.securityIssues.filter(s => s.severity === 'high').length;

    if (output.overallStatus === 'pass') {
      return `✅ All tests passed. ${output.passedChecks.length} checks completed successfully.`;
    }

    return `❌ Testing failed. Found ${criticalBugs} critical bugs, ${highBugs} high-severity bugs, ${criticalSec} critical security issues, ${highSec} high-severity security issues.`;
  }

  /**
   * Log test results in a readable format
   */
  private logTestResults(result: TestingResult): void {
    if (result.passed) {
      logger.success('All tests passed!');
    } else {
      logger.failure('Tests failed - issues found');
    }

    if (result.bugs.length > 0) {
      logger.info(`Found ${result.bugs.length} bugs:`, 'tester');
      result.bugs.forEach(bug => {
        const icon = bug.severity === 'critical' ? '🔴' : 
                    bug.severity === 'high' ? '🟠' : 
                    bug.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${icon} [${bug.severity.toUpperCase()}] ${bug.file}: ${bug.description}`);
      });
    }

    if (result.securityIssues.length > 0) {
      logger.info(`Found ${result.securityIssues.length} security issues:`, 'tester');
      result.securityIssues.forEach(issue => {
        const icon = issue.severity === 'critical' ? '🔴' : 
                    issue.severity === 'high' ? '🟠' : 
                    issue.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      });
    }

    if (result.passedChecks.length > 0) {
      logger.info('Passed checks:', 'tester');
      result.passedChecks.slice(0, 5).forEach(check => {
        console.log(`  ✅ ${check}`);
      });
      if (result.passedChecks.length > 5) {
        console.log(`  ... and ${result.passedChecks.length - 5} more`);
      }
    }
  }

  /**
   * Parse JSON from potentially markdown-wrapped response
   */
  private parseJsonResponse<T>(content: string): T | null {
    try {
      return JSON.parse(content) as T;
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch {
          // Continue
        }
      }
      
      const objectMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]) as T;
        } catch {
          // Fall through
        }
      }
    }
    return null;
  }
}
