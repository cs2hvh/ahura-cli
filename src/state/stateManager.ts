/**
 * State Manager
 * Manages persistent state across agent interactions
 */

import { 
  OrchestratorState, 
  Task, 
  ProjectPlan,
  AgentRole,
  ProjectStatus
} from '../types/index.js';
import { FileSystemManager } from '../utils/fileSystem.js';
import { logger } from '../utils/logger.js';

export class StateManager {
  private fileManager: FileSystemManager;
  private statePath: string;
  private state: OrchestratorState;

  constructor(fileManager: FileSystemManager, statePath: string = '.agent-state.json') {
    this.fileManager = fileManager;
    this.statePath = statePath;
    this.state = this.createInitialState();
  }

  /**
   * Initialize or load existing state
   */
  async initialize(): Promise<OrchestratorState> {
    try {
      if (await this.fileManager.exists(this.statePath)) {
        const content = await this.fileManager.readFile(this.statePath);
        this.state = JSON.parse(content);
        logger.debug('State loaded from file');
      }
    } catch (error) {
      logger.warn('Could not load state, using fresh state');
    }
    return this.state;
  }

  /**
   * Save current state to disk
   */
  async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.state, null, 2);
      await this.fileManager.createFile(this.statePath, content);
    } catch (error) {
      logger.error(`Failed to save state: ${error}`);
    }
  }

  /**
   * Get current state
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }

  /**
   * Update current phase
   */
  async setPhase(phase: ProjectStatus): Promise<void> {
    this.state.currentPhase = phase;
    await this.save();
  }

  /**
   * Set active agent
   */
  async setActiveAgent(agent: AgentRole | null): Promise<void> {
    this.state.activeAgent = agent;
    await this.save();
  }

  /**
   * Add task to queue
   */
  async addTask(task: Task): Promise<void> {
    this.state.taskQueue.push(task);
    await this.save();
  }

  /**
   * Add multiple tasks
   */
  async addTasks(tasks: Task[]): Promise<void> {
    this.state.taskQueue.push(...tasks);
    await this.save();
  }

  /**
   * Move task to completed
   */
  async completeTask(taskId: string): Promise<void> {
    const taskIndex = this.state.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      const task = this.state.taskQueue.splice(taskIndex, 1)[0];
      task.status = 'completed';
      task.completedAt = new Date();
      this.state.completedTasks.push(task);
      await this.save();
    }
  }

  /**
   * Move task to failed
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const taskIndex = this.state.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      const task = this.state.taskQueue.splice(taskIndex, 1)[0];
      task.status = 'failed';
      task.error = error;
      this.state.failedTasks.push(task);
      await this.save();
    }
  }

  /**
   * Record retry attempt
   */
  async recordRetry(taskId: string, attemptNumber: number, error: string): Promise<void> {
    this.state.retryHistory.push({
      taskId,
      attemptNumber,
      error,
      timestamp: new Date()
    });
    await this.save();
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.state.taskQueue.find(t => t.id === taskId) ||
           this.state.completedTasks.find(t => t.id === taskId) ||
           this.state.failedTasks.find(t => t.id === taskId);
  }

  /**
   * Get next available task
   */
  getNextTask(): Task | null {
    for (const task of this.state.taskQueue) {
      if (task.status !== 'pending') continue;
      
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
   * Get progress summary
   */
  getProgress(): { total: number; completed: number; failed: number; pending: number } {
    const total = this.state.taskQueue.length + 
                  this.state.completedTasks.length + 
                  this.state.failedTasks.length;
    
    return {
      total,
      completed: this.state.completedTasks.length,
      failed: this.state.failedTasks.length,
      pending: this.state.taskQueue.length
    };
  }

  /**
   * Clear all state (fresh start)
   */
  async clear(): Promise<void> {
    this.state = this.createInitialState();
    await this.save();
  }

  /**
   * Create initial state structure
   */
  private createInitialState(): OrchestratorState {
    return {
      currentPhase: 'planning',
      activeAgent: null,
      taskQueue: [],
      completedTasks: [],
      failedTasks: [],
      retryHistory: []
    };
  }
}
