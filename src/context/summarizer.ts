/**
 * Summarizer Service
 * Uses a fast/cheap model to summarize conversation history
 */

import OpenAI from 'openai';
import { getOpenRouterApiKey } from '../config/index.js';
import { ConversationMessage, ConversationSummary, WorkingMemory } from './types.js';
import { estimateTokens } from './tokenCounter.js';
import { getSummarizationModel } from './modelConfigs.js';
import { logger } from '../utils/logger.js';

/**
 * System prompt for the summarizer
 */
const SUMMARIZER_PROMPT = `You are a precise conversation summarizer for an AI coding assistant.
Your job is to compress conversation history while preserving ALL critical information.

EXTRACT AND PRESERVE:
1. Project details (name, description, tech stack)
2. Key decisions made (architecture choices, library selections)
3. Files created/modified (with brief purpose)
4. Important constraints or requirements
5. Unresolved issues or bugs
6. Current task status

OUTPUT FORMAT (JSON):
{
  "summary": "Concise narrative summary of the conversation",
  "keyFacts": ["fact1", "fact2", ...],
  "decisions": ["decision1", "decision2", ...],
  "filesCreated": ["path/file1.ts", "path/file2.ts", ...],
  "techStack": ["React", "TypeScript", ...],
  "activeIssues": ["issue1", "issue2", ...]
}

RULES:
- Be concise but complete - no critical info should be lost
- Use bullet points for lists
- Include specific file paths when mentioned
- Preserve error messages and their resolutions
- Keep technical details accurate
- Output ONLY valid JSON, no markdown`;

export class Summarizer {
  private client: OpenAI | null = null;
  private model: string;

  constructor(model?: string) {
    this.model = model || getSummarizationModel();
  }

  /**
   * Initialize the OpenRouter client
   */
  private async initialize(): Promise<void> {
    if (this.client) return;

    this.client = new OpenAI({
      apiKey: getOpenRouterApiKey(),
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://ahurasense.com',
        'X-Title': 'Ahura CLI - Summarizer'
      }
    });
  }

  /**
   * Summarize a set of messages into a compact summary
   */
  async summarize(
    messages: ConversationMessage[],
    existingMemory?: WorkingMemory
  ): Promise<ConversationSummary> {
    await this.initialize();
    if (!this.client) throw new Error('Summarizer not initialized');

    const startTime = Date.now();
    
    // Build the conversation text
    const conversationText = messages.map(m => 
      `[${m.role.toUpperCase()}${m.agentName ? ` - ${m.agentName}` : ''}]:\n${m.content}`
    ).join('\n\n---\n\n');

    // Include existing memory context if available
    let contextPrefix = '';
    if (existingMemory) {
      contextPrefix = `EXISTING PROJECT CONTEXT:
Project: ${existingMemory.projectName}
Description: ${existingMemory.projectDescription}
Tech Stack: ${existingMemory.techStack.join(', ')}
Current Phase: ${existingMemory.currentPhase}
Previous Decisions: ${existingMemory.keyDecisions.join('; ')}

---

NEW CONVERSATION TO SUMMARIZE:
`;
    }

    const fullPrompt = `${contextPrefix}${conversationText}

---

Summarize this conversation, preserving all critical technical details.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.1, // Low temperature for consistent summaries
        messages: [
          { role: 'system', content: SUMMARIZER_PROMPT },
          { role: 'user', content: fullPrompt }
        ]
      });

      const content = response.choices[0]?.message?.content || '{}';
      
      // Parse the JSON response
      let parsed: {
        summary?: string;
        keyFacts?: string[];
        decisions?: string[];
        filesCreated?: string[];
        techStack?: string[];
        activeIssues?: string[];
      };

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = JSON.parse(content);
        }
      } catch {
        // Fallback if JSON parsing fails
        logger.warn('Failed to parse summarizer response as JSON, using raw content');
        parsed = {
          summary: content,
          keyFacts: [],
          decisions: [],
          filesCreated: [],
          techStack: [],
          activeIssues: []
        };
      }

      const originalTokenCount = messages.reduce((sum, m) => sum + m.tokenCount, 0);
      const summaryContent = this.formatSummaryContent(parsed);
      const summaryTokenCount = estimateTokens(summaryContent);

      const summary: ConversationSummary = {
        id: `summary-${Date.now()}`,
        createdAt: new Date(),
        messagesCount: messages.length,
        tokenCount: summaryTokenCount,
        originalTokenCount,
        content: summaryContent,
        keyFacts: parsed.keyFacts || [],
        decisions: parsed.decisions || [],
        filesCreated: parsed.filesCreated || [],
        techStack: parsed.techStack
      };

      logger.debug(
        `Summarized ${messages.length} messages: ${originalTokenCount} → ${summaryTokenCount} tokens (${Math.round((1 - summaryTokenCount/originalTokenCount) * 100)}% reduction)`
      );

      return summary;

    } catch (error) {
      logger.error(`Summarization failed: ${error}`);
      
      // Return a basic fallback summary
      const fallbackContent = messages.slice(-3).map(m => 
        `${m.role}: ${m.content.substring(0, 200)}...`
      ).join('\n');

      return {
        id: `summary-fallback-${Date.now()}`,
        createdAt: new Date(),
        messagesCount: messages.length,
        tokenCount: estimateTokens(fallbackContent),
        originalTokenCount: messages.reduce((sum, m) => sum + m.tokenCount, 0),
        content: `[Summary failed - keeping recent context]\n${fallbackContent}`,
        keyFacts: [],
        decisions: [],
        filesCreated: []
      };
    }
  }

  /**
   * Format parsed summary data into a readable string
   */
  private formatSummaryContent(parsed: {
    summary?: string;
    keyFacts?: string[];
    decisions?: string[];
    filesCreated?: string[];
    techStack?: string[];
    activeIssues?: string[];
  }): string {
    const sections: string[] = [];

    if (parsed.summary) {
      sections.push(`## Summary\n${parsed.summary}`);
    }

    if (parsed.techStack && parsed.techStack.length > 0) {
      sections.push(`## Tech Stack\n${parsed.techStack.join(', ')}`);
    }

    if (parsed.keyFacts && parsed.keyFacts.length > 0) {
      sections.push(`## Key Facts\n${parsed.keyFacts.map(f => `• ${f}`).join('\n')}`);
    }

    if (parsed.decisions && parsed.decisions.length > 0) {
      sections.push(`## Decisions Made\n${parsed.decisions.map(d => `• ${d}`).join('\n')}`);
    }

    if (parsed.filesCreated && parsed.filesCreated.length > 0) {
      sections.push(`## Files Created/Modified\n${parsed.filesCreated.map(f => `• ${f}`).join('\n')}`);
    }

    if (parsed.activeIssues && parsed.activeIssues.length > 0) {
      sections.push(`## Active Issues\n${parsed.activeIssues.map(i => `• ${i}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Extract working memory from a summary
   */
  extractWorkingMemory(
    summary: ConversationSummary,
    existingMemory?: WorkingMemory
  ): Partial<WorkingMemory> {
    return {
      techStack: [
        ...(existingMemory?.techStack || []),
        ...(summary.techStack || [])
      ].filter((v, i, a) => a.indexOf(v) === i), // Dedupe
      keyDecisions: [
        ...(existingMemory?.keyDecisions || []),
        ...summary.decisions
      ].slice(-20), // Keep last 20 decisions
      recentFiles: [
        ...(existingMemory?.recentFiles || []),
        ...summary.filesCreated
      ].slice(-30), // Keep last 30 files
      activeIssues: summary.keyFacts.filter(f => 
        f.toLowerCase().includes('issue') || 
        f.toLowerCase().includes('bug') ||
        f.toLowerCase().includes('error')
      ),
      lastUpdated: new Date()
    };
  }

  /**
   * Quick summarize for a single long message
   */
  async summarizeText(text: string, maxTokens: number = 500): Promise<string> {
    await this.initialize();
    if (!this.client) throw new Error('Summarizer not initialized');

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [
        { 
          role: 'system', 
          content: 'Summarize the following text concisely, preserving key technical details. Output plain text only.' 
        },
        { role: 'user', content: text }
      ]
    });

    return response.choices[0]?.message?.content || text.substring(0, 1000);
  }
}

// Singleton instance
let summarizerInstance: Summarizer | null = null;

export function getSummarizer(): Summarizer {
  if (!summarizerInstance) {
    summarizerInstance = new Summarizer();
  }
  return summarizerInstance;
}
