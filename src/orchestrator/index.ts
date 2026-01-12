/**
 * Agent Orchestrator
 * Coordinates all agents through the development lifecycle
 * Implements the Agile team simulation with retry logic
 */

import { 
  PlannerAgent, 
  CoderAgent, 
  TesterAgent, 
  ReviewerAgent,
  TestingResult,
  ReviewResult
} from '../agents/index.js';
import { 
  OrchestratorConfig, 
  OrchestratorState, 
  ProjectPlan, 
  Task,
  RetryRecord,
  ProjectStatus,
  FileOperation
} from '../types/index.js';
import { loadConfig } from '../config/index.js';
import { logger, FileSystemManager } from '../utils/index.js';
import path from 'path';

export class Orchestrator {
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private fileManager: FileSystemManager;
  
  // Agents
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private tester: TesterAgent;
  private reviewer: ReviewerAgent;
  
  // Project state
  private currentPlan: ProjectPlan | null = null;
  private designDoc: string = '';
  private errorHistory: Map<string, string[]> = new Map();

  constructor(outputDir?: string) {
    this.config = loadConfig();
    
    // Override output dir if provided
    if (outputDir) {
      this.config.outputDir = outputDir;
      this.config.designDocPath = path.join(outputDir, 'design_doc.md');
    }
    
    this.fileManager = new FileSystemManager(this.config.outputDir);
    
    // Initialize agents
    this.planner = new PlannerAgent();
    this.coder = new CoderAgent();
    this.tester = new TesterAgent();
    this.reviewer = new ReviewerAgent();
    
    // Set file manager for coder
    this.coder.setFileManager(this.fileManager);
    
    // Initialize state
    this.state = {
      currentPhase: 'planning',
      activeAgent: null,
      taskQueue: [],
      completedTasks: [],
      failedTasks: [],
      retryHistory: []
    };
  }

  /**
   * Main entry point - run the full development cycle
   */
  async run(userPrompt: string): Promise<{
    success: boolean;
    projectPath: string;
    summary: string;
  }> {
    logger.header('🚀 Agent Orchestra - Self-Agent Dev Swarm');
    logger.info(`User Prompt: "${userPrompt}"`);
    
    try {
      // Phase 1: Initialize
      await this.initialize();
      
      // Phase 2: Planning
      const plan = await this.planningPhase(userPrompt);
      if (!plan) {
        return {
          success: false,
          projectPath: this.config.outputDir,
          summary: 'Planning phase failed'
        };
      }
      
      // Phase 3: Development
      await this.developmentPhase();
      
      // Phase 4: Testing
      const testResults = await this.testingPhase();
      
      // Phase 5: Bug fixing (if needed)
      if (!testResults.passed) {
        await this.bugFixingPhase(testResults);
      }
      
      // Phase 6: Final Review
      const reviewResult = await this.reviewPhase(testResults);
      
      // Phase 7: Delivery
      return await this.deliveryPhase(reviewResult);
      
    } catch (error) {
      logger.error(`Orchestration failed: ${error}`);
      return {
        success: false,
        projectPath: this.config.outputDir,
        summary: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Initialize the orchestrator
   */
  private async initialize(): Promise<void> {
    logger.section('Initialization');
    await this.fileManager.initialize();
    logger.success('Output directory ready');
  }

  /**
   * Phase 1: Planning - Planner Agent creates the project blueprint
   */
  private async planningPhase(userPrompt: string): Promise<ProjectPlan | null> {
    this.updatePhase('planning');
    this.state.activeAgent = 'planner';
    
    // Get project plan from Planner Agent
    const plan = await this.planner.createProjectPlan(userPrompt);
    
    if (!plan) {
      logger.error('Planner failed to create project plan');
      return null;
    }
    
    this.currentPlan = plan;
    
    // Generate and save design document
    this.designDoc = this.planner.generateDesignDocument(plan);
    await this.fileManager.createFile('design_doc.md', this.designDoc);
    
    // Initialize task queue
    this.state.taskQueue = [...plan.tasks];
    
    logger.success(`Plan created with ${plan.tasks.length} tasks`);
    
    return plan;
  }

  /**
   * Phase 2: Development - Coder Agent implements the plan
   */
  private async developmentPhase(): Promise<void> {
    this.updatePhase('development');
    this.state.activeAgent = 'coder';
    
    logger.section('Development Phase');
    
    if (!this.currentPlan) {
      throw new Error('No plan available for development');
    }
    
    // Generate initial scaffolding
    logger.info('Creating project scaffolding...');
    await this.coder.generateScaffolding(this.currentPlan);
    
    // Process tasks in dependency order
    while (this.state.taskQueue.length > 0) {
      const task = this.getNextTask();
      if (!task) {
        logger.warn('No ready tasks available - possible circular dependency');
        break;
      }
      
      await this.executeTask(task);
    }
    
    logger.success(`Development complete: ${this.state.completedTasks.length} tasks finished`);
  }

  /**
   * Execute a single task with retry logic
   */
  private async executeTask(task: Task): Promise<void> {
    logger.taskStatus(task.id, task.title, 'in-progress');
    task.status = 'in-progress';
    
    while (task.retryCount < task.maxRetries) {
      try {
        const result = await this.coder.implementTask(
          task, 
          this.currentPlan!, 
          this.designDoc
        );
        
        if (result.success) {
          // Execute any terminal commands
          if (result.commands.length > 0) {
            await this.coder.executeCommands(result.commands);
          }
          
          // Mark task complete
          task.status = 'completed';
          task.completedAt = new Date();
          this.state.completedTasks.push(task);
          this.removeFromQueue(task.id);
          
          logger.taskStatus(task.id, task.title, 'completed');
          return;
        }
        
        // Task failed - record error and retry
        task.retryCount++;
        this.recordError(task.id, result.error || 'Unknown error');
        
        if (task.retryCount < task.maxRetries) {
          logger.retryWarning(task.id, task.retryCount, task.maxRetries);
        }
        
      } catch (error) {
        task.retryCount++;
        this.recordError(task.id, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Max retries reached - escalate to Planner
    await this.escalateTask(task);
  }

  /**
   * Escalate a failed task to the Planner for simplification
   */
  private async escalateTask(task: Task): Promise<void> {
    logger.escalation(`Task "${task.title}" failed after ${task.maxRetries} attempts`);
    
    const errorHistory = this.errorHistory.get(task.id) || [];
    const simplifiedTask = await this.planner.simplifyTask(task, errorHistory);
    
    if (simplifiedTask.title !== task.title) {
      // Task was simplified - add back to queue
      simplifiedTask.retryCount = 0;
      this.state.taskQueue.push(simplifiedTask);
      logger.info(`Task simplified and re-queued: ${simplifiedTask.title}`);
    } else {
      // Could not simplify - mark as failed
      task.status = 'failed';
      this.state.failedTasks.push(task);
      this.removeFromQueue(task.id);
      logger.taskStatus(task.id, task.title, 'failed');
    }
  }

  /**
   * Phase 3: Testing - Tester Agent analyzes the code
   */
  private async testingPhase(): Promise<TestingResult> {
    this.updatePhase('testing');
    this.state.activeAgent = 'tester';
    
    // Read all project files
    const files = await this.fileManager.readAllFiles();
    
    // Run comprehensive tests
    const results = await this.tester.runTests(files, this.designDoc);
    
    return results;
  }

  /**
   * Phase 4: Bug Fixing - Coder fixes bugs found by Tester
   */
  private async bugFixingPhase(testResults: TestingResult): Promise<void> {
    logger.section('Bug Fixing Phase');
    
    let attempts = 0;
    const maxBugFixAttempts = this.config.maxRetryAttempts;
    let currentResults = testResults;
    
    while (!currentResults.passed && attempts < maxBugFixAttempts) {
      attempts++;
      logger.info(`Bug fix attempt ${attempts}/${maxBugFixAttempts}`, 'coder');
      
      // Convert bugs to fix format
      const bugs = currentResults.bugs.map(bug => ({
        file: bug.file,
        issue: bug.description,
        fix: bug.fix
      }));
      
      // Have coder fix the bugs
      const fixResult = await this.coder.fixBugs(bugs, this.designDoc);
      
      if (!fixResult.success) {
        logger.warn('Bug fix attempt failed', 'coder');
        continue;
      }
      
      // Re-run tests to verify fixes
      const files = await this.fileManager.readAllFiles();
      currentResults = await this.tester.runTests(files, this.designDoc);
      
      if (currentResults.passed) {
        logger.success('All bugs fixed!');
        break;
      }
    }
    
    if (!currentResults.passed) {
      logger.warn(`Some issues remain after ${maxBugFixAttempts} fix attempts`);
    }
  }

  /**
   * Phase 5: Review - Reviewer Agent performs final check
   */
  private async reviewPhase(testResults: TestingResult): Promise<ReviewResult> {
    this.updatePhase('review');
    this.state.activeAgent = 'reviewer';
    
    const files = await this.fileManager.readAllFiles();
    
    const reviewResult = await this.reviewer.reviewProject(
      this.currentPlan!,
      files,
      this.designDoc,
      { passed: testResults.passed, summary: testResults.summary }
    );
    
    return reviewResult;
  }

  /**
   * Phase 6: Delivery - Generate final output
   */
  private async deliveryPhase(reviewResult: ReviewResult): Promise<{
    success: boolean;
    projectPath: string;
    summary: string;
  }> {
    this.updatePhase('completed');
    
    logger.section('Delivery');
    
    // Generate delivery report
    const report = await this.reviewer.generateDeliveryReport(
      this.currentPlan!,
      reviewResult
    );
    
    // Save delivery report
    await this.fileManager.createFile('DELIVERY_REPORT.md', report);
    
    // Generate summary
    const summary = reviewResult.approved
      ? `✅ Project "${this.currentPlan!.projectName}" completed successfully! ${reviewResult.completionPercentage}% complete.`
      : `⚠️ Project "${this.currentPlan!.projectName}" completed with issues. ${reviewResult.completionPercentage}% complete. Blockers: ${reviewResult.blockers.join(', ')}`;
    
    logger.header('🎉 Project Complete!');
    logger.info(`Output: ${this.config.outputDir}`);
    logger.info(summary);
    
    // Print project structure
    const projectTree = await this.fileManager.getProjectSummary();
    console.log('\nProject Structure:');
    console.log(projectTree);
    
    return {
      success: reviewResult.approved,
      projectPath: this.fileManager.getRootDir(),
      summary
    };
  }

  /**
   * Get the next task that's ready to execute
   */
  private getNextTask(): Task | null {
    for (const task of this.state.taskQueue) {
      if (task.status !== 'pending') continue;
      
      // Check if all dependencies are completed
      const depsCompleted = task.dependencies.every(depId =>
        this.state.completedTasks.some(t => t.id === depId)
      );
      
      if (depsCompleted) {
        return task;
      }
    }
    return null;
  }

  /**
   * Remove a task from the queue
   */
  private removeFromQueue(taskId: string): void {
    this.state.taskQueue = this.state.taskQueue.filter(t => t.id !== taskId);
  }

  /**
   * Record an error for a task
   */
  private recordError(taskId: string, error: string): void {
    if (!this.errorHistory.has(taskId)) {
      this.errorHistory.set(taskId, []);
    }
    this.errorHistory.get(taskId)!.push(error);
    
    this.state.retryHistory.push({
      taskId,
      attemptNumber: this.errorHistory.get(taskId)!.length,
      error,
      timestamp: new Date()
    });
  }

  /**
   * Update the current phase
   */
  private updatePhase(phase: ProjectStatus): void {
    this.state.currentPhase = phase;
    if (this.currentPlan) {
      this.currentPlan.status = phase;
    }
  }

  /**
   * Get current state for external monitoring
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Get current plan
   */
  getPlan(): ProjectPlan | null {
    return this.currentPlan;
  }
}
