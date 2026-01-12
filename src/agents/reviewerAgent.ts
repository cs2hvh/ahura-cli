/**
 * Reviewer Agent
 * Final quality gate - ensures output matches original requirements
 * Uses Claude Sonnet 4.5 for thorough review
 */

import { BaseAgent } from './baseAgent.js';
import { 
  AgentResponse, 
  ProjectPlan
} from '../types/index.js';
import { AGENT_CONFIGS } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface ReviewOutput {
  approved: boolean;
  completionPercentage: number;
  requirementsCoverage: Array<{
    requirement: string;
    status: 'fulfilled' | 'partial' | 'missing';
    notes: string;
  }>;
  codeQuality: {
    score: number;
    strengths: string[];
    weaknesses: string[];
  };
  missingItems: string[];
  blockers: string[];
  summary: string;
}

export interface ReviewResult {
  approved: boolean;
  completionPercentage: number;
  requirementsCoverage: ReviewOutput['requirementsCoverage'];
  codeQuality: ReviewOutput['codeQuality'];
  missingItems: string[];
  blockers: string[];
  summary: string;
}

export class ReviewerAgent extends BaseAgent {
  constructor() {
    super(AGENT_CONFIGS.reviewer);
  }

  /**
   * Main task processor for the Reviewer
   */
  async processTask(task: string, context?: Record<string, unknown>): Promise<AgentResponse> {
    const contextStr = context ? JSON.stringify(context, null, 2) : undefined;
    return await this.chat(task, contextStr);
  }

  /**
   * Perform final review of the completed project
   */
  async reviewProject(
    plan: ProjectPlan,
    files: Map<string, string>,
    designDoc: string,
    testResults: { passed: boolean; summary: string }
  ): Promise<ReviewResult> {
    logger.section('Review Phase');
    logger.info('Performing final project review...', 'reviewer');

    const filesContent = Array.from(files.entries())
      .map(([path, content]) => `
--- FILE: ${path} ---
${content.substring(0, 3000)}${content.length > 3000 ? '\n... (truncated)' : ''}
--- END FILE ---
`).join('\n');

    const reviewPrompt = `
You are performing the FINAL REVIEW before project delivery.

ORIGINAL REQUEST:
${plan.description}

DESIGN DOCUMENT:
${designDoc}

EXPECTED FILE STRUCTURE:
${JSON.stringify(plan.fileTree, null, 2)}

IMPLEMENTED TASKS:
${plan.tasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.title}`).join('\n')}

TEST RESULTS:
${testResults.summary}
Tests Passed: ${testResults.passed ? 'Yes' : 'No'}

ACTUAL CODEBASE:
${filesContent}

Review the project and determine:
1. Does the implementation match the original requirements?
2. Are all planned files created with correct content?
3. Is the code quality acceptable for production?
4. Are there any blockers preventing delivery?

Be thorough but fair. Approve only if the project is truly ready.
Respond with detailed JSON following your output format.
`;

    const response = await this.chat(reviewPrompt);
    
    if (!response.success) {
      return {
        approved: false,
        completionPercentage: 0,
        requirementsCoverage: [],
        codeQuality: { score: 0, strengths: [], weaknesses: ['Review failed'] },
        missingItems: [],
        blockers: [`Review failed: ${response.error}`],
        summary: 'Could not complete review'
      };
    }

    try {
      const output = this.parseJsonResponse<ReviewOutput>(response.content);
      
      if (!output) {
        return {
          approved: false,
          completionPercentage: 0,
          requirementsCoverage: [],
          codeQuality: { score: 0, strengths: [], weaknesses: [] },
          missingItems: [],
          blockers: ['Could not parse review output'],
          summary: 'Review parsing failed'
        };
      }

      const result: ReviewResult = {
        approved: output.approved,
        completionPercentage: output.completionPercentage,
        requirementsCoverage: output.requirementsCoverage || [],
        codeQuality: output.codeQuality || { score: 0, strengths: [], weaknesses: [] },
        missingItems: output.missingItems || [],
        blockers: output.blockers || [],
        summary: output.summary
      };

      // Log review results
      this.logReviewResults(result);

      return result;
    } catch (error) {
      return {
        approved: false,
        completionPercentage: 0,
        requirementsCoverage: [],
        codeQuality: { score: 0, strengths: [], weaknesses: [] },
        missingItems: [],
        blockers: [`Error during review: ${error}`],
        summary: 'Review error'
      };
    }
  }

  /**
   * Quick sanity check during development
   */
  async quickCheck(
    taskTitle: string,
    files: Map<string, string>
  ): Promise<{ ok: boolean; issues: string[] }> {
    const filesContent = Array.from(files.entries())
      .map(([path, content]) => `${path}:\n${content.substring(0, 1000)}`).join('\n\n');

    const checkPrompt = `
Quick sanity check for task: "${taskTitle}"

Files to check:
${filesContent}

Respond with JSON:
{
  "ok": true/false,
  "issues": ["list of any obvious issues"]
}
`;

    const response = await this.chat(checkPrompt);
    
    if (!response.success) {
      return { ok: false, issues: ['Check failed'] };
    }

    try {
      const result = this.parseJsonResponse<{ ok: boolean; issues: string[] }>(response.content);
      return result || { ok: false, issues: ['Parse error'] };
    } catch {
      return { ok: false, issues: ['Parse error'] };
    }
  }

  /**
   * Generate final delivery report
   */
  async generateDeliveryReport(
    plan: ProjectPlan,
    reviewResult: ReviewResult
  ): Promise<string> {
    logger.info('Generating delivery report...', 'reviewer');

    const reportPrompt = `
Generate a professional delivery report for the completed project.

Project: ${plan.projectName}
Description: ${plan.description}

Review Results:
- Approved: ${reviewResult.approved}
- Completion: ${reviewResult.completionPercentage}%
- Code Quality Score: ${reviewResult.codeQuality.score}/100

Requirements Coverage:
${reviewResult.requirementsCoverage.map(r => `- ${r.requirement}: ${r.status}`).join('\n')}

Strengths:
${reviewResult.codeQuality.strengths.join('\n')}

Areas for Improvement:
${reviewResult.codeQuality.weaknesses.join('\n')}

Create a clear, professional report that can be delivered to the client.
Include setup instructions and next steps.

Respond with the full markdown report.
`;

    const response = await this.chat(reportPrompt);
    
    if (!response.success) {
      return this.generateDefaultReport(plan, reviewResult);
    }

    return response.content;
  }

  /**
   * Log review results
   */
  private logReviewResults(result: ReviewResult): void {
    console.log('\n');
    
    if (result.approved) {
      logger.success('PROJECT APPROVED FOR DELIVERY');
    } else {
      logger.failure('PROJECT NOT APPROVED');
    }

    console.log(`\n📊 Completion: ${result.completionPercentage}%`);
    console.log(`📈 Code Quality: ${result.codeQuality.score}/100`);

    if (result.codeQuality.strengths.length > 0) {
      console.log('\n✅ Strengths:');
      result.codeQuality.strengths.forEach(s => console.log(`   • ${s}`));
    }

    if (result.codeQuality.weaknesses.length > 0) {
      console.log('\n⚠️ Weaknesses:');
      result.codeQuality.weaknesses.forEach(w => console.log(`   • ${w}`));
    }

    if (result.missingItems.length > 0) {
      console.log('\n❌ Missing Items:');
      result.missingItems.forEach(m => console.log(`   • ${m}`));
    }

    if (result.blockers.length > 0) {
      console.log('\n🚫 Blockers:');
      result.blockers.forEach(b => console.log(`   • ${b}`));
    }

    console.log(`\n📝 Summary: ${result.summary}\n`);
  }

  /**
   * Generate default report if AI fails
   */
  private generateDefaultReport(plan: ProjectPlan, result: ReviewResult): string {
    return `# ${plan.projectName} - Delivery Report

## Project Overview
${plan.description}

## Completion Status
- **Approved:** ${result.approved ? 'Yes' : 'No'}
- **Completion:** ${result.completionPercentage}%
- **Code Quality:** ${result.codeQuality.score}/100

## Requirements Coverage
${result.requirementsCoverage.map(r => `- **${r.requirement}:** ${r.status}`).join('\n')}

## Summary
${result.summary}

---
*Generated by Agent Orchestra*
`;
  }

  /**
   * Parse JSON from response
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
      
      const objectMatch = content.match(/\{[\s\S]*\}/);
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
