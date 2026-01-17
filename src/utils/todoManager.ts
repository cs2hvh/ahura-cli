/**
 * Todo List Tool - Claude Code style task management
 * 
 * Based on Claude Code's TodoWrite tool for tracking progress
 * and planning tasks throughout coding sessions.
 */

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

export interface TodoList {
  items: TodoItem[];
  lastUpdated: Date;
}

/**
 * Todo Manager - tracks tasks during a session
 */
export class TodoManager {
  private items: TodoItem[] = [];
  private lastUpdated: Date = new Date();
  private onUpdate?: (items: TodoItem[]) => void;
  
  constructor(onUpdate?: (items: TodoItem[]) => void) {
    this.onUpdate = onUpdate;
  }
  
  /**
   * Get all todos
   */
  getAll(): TodoItem[] {
    return [...this.items];
  }
  
  /**
   * Get todos by status
   */
  getByStatus(status: TodoItem['status']): TodoItem[] {
    return this.items.filter(item => item.status === status);
  }
  
  /**
   * Get pending todos
   */
  getPending(): TodoItem[] {
    return this.getByStatus('pending');
  }
  
  /**
   * Get in-progress todos (should only be 1)
   */
  getInProgress(): TodoItem | undefined {
    return this.items.find(item => item.status === 'in_progress');
  }
  
  /**
   * Get completed todos
   */
  getCompleted(): TodoItem[] {
    return this.getByStatus('completed');
  }
  
  /**
   * Add a new todo
   */
  add(content: string): TodoItem {
    const item: TodoItem = {
      id: this.generateId(),
      content,
      status: 'pending',
      createdAt: new Date()
    };
    
    this.items.push(item);
    this.lastUpdated = new Date();
    this.notifyUpdate();
    
    return item;
  }
  
  /**
   * Add multiple todos at once
   */
  addMany(contents: string[]): TodoItem[] {
    return contents.map(content => this.add(content));
  }
  
  /**
   * Set todos (replace all)
   */
  setAll(todos: Array<{ id?: string; content: string; status: TodoItem['status'] }>): void {
    this.items = todos.map(todo => ({
      id: todo.id || this.generateId(),
      content: todo.content,
      status: todo.status,
      createdAt: new Date(),
      completedAt: todo.status === 'completed' ? new Date() : undefined
    }));
    
    this.lastUpdated = new Date();
    this.notifyUpdate();
  }
  
  /**
   * Update todo status
   */
  updateStatus(id: string, status: TodoItem['status']): TodoItem | undefined {
    const item = this.items.find(i => i.id === id);
    if (!item) return undefined;
    
    // If marking as in_progress, ensure no other item is in_progress
    if (status === 'in_progress') {
      const currentInProgress = this.getInProgress();
      if (currentInProgress && currentInProgress.id !== id) {
        // Move current in_progress back to pending
        currentInProgress.status = 'pending';
      }
    }
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    this.lastUpdated = new Date();
    this.notifyUpdate();
    
    return item;
  }
  
  /**
   * Mark todo as in progress
   */
  startTask(id: string): TodoItem | undefined {
    return this.updateStatus(id, 'in_progress');
  }
  
  /**
   * Mark todo as completed
   */
  completeTask(id: string): TodoItem | undefined {
    return this.updateStatus(id, 'completed');
  }
  
  /**
   * Remove a todo
   */
  remove(id: string): boolean {
    const index = this.items.findIndex(i => i.id === id);
    if (index === -1) return false;
    
    this.items.splice(index, 1);
    this.lastUpdated = new Date();
    this.notifyUpdate();
    
    return true;
  }
  
  /**
   * Clear all todos
   */
  clear(): void {
    this.items = [];
    this.lastUpdated = new Date();
    this.notifyUpdate();
  }
  
  /**
   * Get progress summary
   */
  getProgress(): { total: number; completed: number; pending: number; inProgress: number; percentage: number } {
    const total = this.items.length;
    const completed = this.getCompleted().length;
    const pending = this.getPending().length;
    const inProgress = this.getInProgress() ? 1 : 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, pending, inProgress, percentage };
  }
  
  /**
   * Format todos for display
   */
  format(): string {
    if (this.items.length === 0) {
      return 'No tasks tracked.';
    }
    
    const lines: string[] = [];
    const progress = this.getProgress();
    
    lines.push(`Tasks: ${progress.completed}/${progress.total} completed (${progress.percentage}%)`);
    lines.push('');
    
    for (const item of this.items) {
      const icon = item.status === 'completed' ? '✓' 
        : item.status === 'in_progress' ? '→' 
        : '○';
      const statusColor = item.status === 'completed' ? '(done)'
        : item.status === 'in_progress' ? '(working)'
        : '';
      
      lines.push(`${icon} ${item.content} ${statusColor}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Export todos for AI context
   */
  toContext(): string {
    if (this.items.length === 0) {
      return '';
    }
    
    const lines = ['Current tasks:'];
    
    for (const item of this.items) {
      const status = item.status === 'completed' ? '[DONE]'
        : item.status === 'in_progress' ? '[WORKING]'
        : '[TODO]';
      
      lines.push(`${status} ${item.content}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Notify update callback
   */
  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.items);
    }
  }
}

/**
 * Tool definition for AI to use todo list
 */
export const todoWriteTool = {
  name: 'todo_write',
  description: `Use this tool to create and manage a structured task list for your current coding session. 
This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.

When to Use This Tool:
1. Complex multi-step tasks - When a task requires 3 or more distinct steps
2. User explicitly requests todo list - When the user directly asks you to use the todo list
3. User provides multiple tasks - When users provide a list of things to be done
4. When you start working on a task - Mark it as in_progress BEFORE beginning work
5. After completing a task - Mark it as completed immediately

When NOT to Use This Tool:
1. Single, straightforward task
2. Trivial task that can be completed in less than 3 steps
3. Purely conversational or informational requests

Task States:
- pending: Task not yet started
- in_progress: Currently working on (limit to ONE task at a time)
- completed: Task finished successfully

IMPORTANT: Mark todos as completed as soon as you are done with each task. Do not batch completions.`,
  
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID for the todo' },
            content: { type: 'string', description: 'The task description' },
            status: { 
              type: 'string', 
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Task status'
            }
          },
          required: ['content', 'status']
        },
        description: 'The complete todo list'
      }
    },
    required: ['todos']
  }
};

/**
 * Create a new todo manager instance
 */
export function createTodoManager(onUpdate?: (items: TodoItem[]) => void): TodoManager {
  return new TodoManager(onUpdate);
}
