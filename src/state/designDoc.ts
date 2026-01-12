/**
 * Design Document Manager
 * Handles the shared design document that serves as "Source of Truth"
 * for cross-agent state management
 */

import { FileSystemManager } from '../utils/fileSystem.js';
import { 
  DesignDocument, 
  DesignSection, 
  DesignDecision, 
  AgentRole 
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export class DesignDocManager {
  private fileManager: FileSystemManager;
  private docPath: string;
  private document: DesignDocument | null = null;

  constructor(fileManager: FileSystemManager, docPath: string = 'design_doc.md') {
    this.fileManager = fileManager;
    this.docPath = docPath;
  }

  /**
   * Initialize or load existing design document
   */
  async initialize(projectName: string): Promise<DesignDocument> {
    if (await this.fileManager.exists(this.docPath)) {
      return await this.load();
    }

    this.document = {
      projectName,
      version: '1.0.0',
      lastUpdated: new Date(),
      sections: [],
      variables: {},
      decisions: []
    };

    await this.save();
    return this.document;
  }

  /**
   * Load existing design document
   */
  async load(): Promise<DesignDocument> {
    try {
      const content = await this.fileManager.readFile(this.docPath);
      this.document = this.parseMarkdownToDocument(content);
      return this.document;
    } catch (error) {
      logger.warn(`Could not load design doc: ${error}`);
      return this.document || this.createEmptyDocument();
    }
  }

  /**
   * Save the design document
   */
  async save(): Promise<void> {
    if (!this.document) {
      throw new Error('No document to save');
    }

    this.document.lastUpdated = new Date();
    const markdown = this.documentToMarkdown(this.document);
    await this.fileManager.createFile(this.docPath, markdown);
  }

  /**
   * Update a section of the document
   */
  async updateSection(title: string, content: string, updatedBy: AgentRole): Promise<void> {
    if (!this.document) {
      await this.load();
    }

    const existingIndex = this.document!.sections.findIndex(s => s.title === title);
    const section: DesignSection = {
      title,
      content,
      updatedBy,
      updatedAt: new Date()
    };

    if (existingIndex >= 0) {
      this.document!.sections[existingIndex] = section;
    } else {
      this.document!.sections.push(section);
    }

    await this.save();
    logger.info(`Design doc section "${title}" updated by ${updatedBy}`, updatedBy);
  }

  /**
   * Add a design decision
   */
  async addDecision(
    decision: string, 
    rationale: string, 
    madeBy: AgentRole,
    relatedTo?: string[]
  ): Promise<void> {
    if (!this.document) {
      await this.load();
    }

    const newDecision: DesignDecision = {
      id: `decision-${Date.now()}`,
      decision,
      rationale,
      madeBy,
      timestamp: new Date(),
      relatedTo
    };

    this.document!.decisions.push(newDecision);
    await this.save();

    logger.info(`Design decision added: ${decision.substring(0, 50)}...`, madeBy);
  }

  /**
   * Set a shared variable
   */
  async setVariable(key: string, value: string): Promise<void> {
    if (!this.document) {
      await this.load();
    }

    this.document!.variables[key] = value;
    await this.save();
  }

  /**
   * Get a shared variable
   */
  getVariable(key: string): string | undefined {
    return this.document?.variables[key];
  }

  /**
   * Get all variables
   */
  getVariables(): Record<string, string> {
    return this.document?.variables ? { ...this.document.variables } : {};
  }

  /**
   * Get the current document as markdown string
   */
  getMarkdown(): string {
    if (!this.document) {
      return '';
    }
    return this.documentToMarkdown(this.document);
  }

  /**
   * Get a specific section's content
   */
  getSection(title: string): string | undefined {
    return this.document?.sections.find(s => s.title === title)?.content;
  }

  /**
   * Convert DesignDocument to Markdown
   */
  private documentToMarkdown(doc: DesignDocument): string {
    let md = `# ${doc.projectName} - Design Document\n\n`;
    md += `**Version:** ${doc.version}\n`;
    md += `**Last Updated:** ${doc.lastUpdated.toISOString()}\n\n`;
    md += '---\n\n';

    // Sections
    for (const section of doc.sections) {
      md += `## ${section.title}\n\n`;
      md += `${section.content}\n\n`;
      md += `*Updated by ${section.updatedBy} at ${section.updatedAt.toISOString()}*\n\n`;
      md += '---\n\n';
    }

    // Variables
    if (Object.keys(doc.variables).length > 0) {
      md += '## Shared Variables\n\n';
      md += '| Variable | Value |\n';
      md += '|----------|-------|\n';
      for (const [key, value] of Object.entries(doc.variables)) {
        md += `| ${key} | ${value} |\n`;
      }
      md += '\n---\n\n';
    }

    // Decisions
    if (doc.decisions.length > 0) {
      md += '## Design Decisions\n\n';
      for (const decision of doc.decisions) {
        md += `### ${decision.id}\n\n`;
        md += `**Decision:** ${decision.decision}\n\n`;
        md += `**Rationale:** ${decision.rationale}\n\n`;
        md += `**Made by:** ${decision.madeBy} at ${decision.timestamp.toISOString()}\n`;
        if (decision.relatedTo?.length) {
          md += `**Related to:** ${decision.relatedTo.join(', ')}\n`;
        }
        md += '\n---\n\n';
      }
    }

    md += '\n*Generated by Agent Orchestra*\n';

    return md;
  }

  /**
   * Parse Markdown to DesignDocument (basic implementation)
   */
  private parseMarkdownToDocument(markdown: string): DesignDocument {
    const doc = this.createEmptyDocument();
    
    // Extract project name from title
    const titleMatch = markdown.match(/^# (.+?) - Design Document/m);
    if (titleMatch) {
      doc.projectName = titleMatch[1];
    }

    // Extract version
    const versionMatch = markdown.match(/\*\*Version:\*\* (.+)/);
    if (versionMatch) {
      doc.version = versionMatch[1];
    }

    // Extract sections (simplified)
    const sectionRegex = /## ([^\n]+)\n\n([\s\S]*?)(?=\n## |\n---|\*Generated by)/g;
    let match;
    while ((match = sectionRegex.exec(markdown)) !== null) {
      if (!['Shared Variables', 'Design Decisions'].includes(match[1])) {
        doc.sections.push({
          title: match[1],
          content: match[2].trim(),
          updatedBy: 'planner',
          updatedAt: new Date()
        });
      }
    }

    // Extract variables
    const variableRegex = /\| (\w+) \| (.+) \|/g;
    while ((match = variableRegex.exec(markdown)) !== null) {
      if (match[1] !== 'Variable') {
        doc.variables[match[1]] = match[2];
      }
    }

    return doc;
  }

  /**
   * Create empty document structure
   */
  private createEmptyDocument(): DesignDocument {
    return {
      projectName: 'Untitled Project',
      version: '1.0.0',
      lastUpdated: new Date(),
      sections: [],
      variables: {},
      decisions: []
    };
  }
}
