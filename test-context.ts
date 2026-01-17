/**
 * Test script for Context Management System
 */

import { 
  ContextManager, 
  getModelConfig, 
  formatTokenCount,
  getSummarizer,
  estimateTokens 
} from './src/context/index.js';

async function testContextManagement() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        CONTEXT MANAGEMENT SYSTEM TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Test Model Config
  console.log('1️⃣  MODEL CONFIGURATION TEST');
  console.log('─'.repeat(50));
  
  const models = [
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'google/gemini-pro-1.5'
  ];
  
  for (const modelId of models) {
    const config = getModelConfig(modelId);
    console.log(`   ${config.name}: ${formatTokenCount(config.contextWindow)} context`);
  }
  console.log('');

  // 2. Test Token Counter
  console.log('2️⃣  TOKEN COUNTER TEST');
  console.log('─'.repeat(50));
  
  const testTexts = [
    'Hello world',
    'Create a React todo app with TypeScript and Express backend',
    '```typescript\nfunction hello() {\n  console.log("world");\n}\n```'
  ];
  
  for (const text of testTexts) {
    const tokens = estimateTokens(text);
    console.log(`   "${text.substring(0, 40)}..." → ${tokens} tokens`);
  }
  console.log('');

  // 3. Test Context Manager
  console.log('3️⃣  CONTEXT MANAGER TEST');
  console.log('─'.repeat(50));
  
  const cm = new ContextManager('anthropic/claude-sonnet-4.5');
  
  // Set project info
  cm.setProjectInfo('TestProject', 'A test project for context management', ['TypeScript', 'Node.js']);
  cm.addDecision('Using ESM modules');
  cm.addDecision('Using Claude for summarization');
  cm.addFile('src/index.ts');
  cm.addFile('src/utils/helper.ts');
  
  // Add some messages
  cm.addMessage('user', 'Create a todo app with React');
  cm.addMessage('assistant', 'I will create a todo app with the following structure:\n- src/App.tsx\n- src/components/TodoList.tsx\n- src/components/TodoItem.tsx');
  cm.addMessage('user', 'Add a database connection');
  cm.addMessage('assistant', 'I will add MongoDB connection with mongoose:\n- src/db/connection.ts\n- src/models/Todo.ts');
  
  console.log(`   Status: ${cm.getStatusSummary()}`);
  console.log(`   Usage: ${cm.getUsagePercentage()}%`);
  console.log('');

  // 4. Test Summarizer
  console.log('4️⃣  SUMMARIZER TEST');
  console.log('─'.repeat(50));
  console.log('   Calling Claude 3.5 Haiku to summarize conversation...\n');
  
  const summarizer = getSummarizer();
  
  // Create test messages
  const testMessages = [
    {
      id: 'msg-1',
      role: 'user' as const,
      content: 'I want to create a full-stack todo application with React frontend and Express backend. It should have user authentication and a PostgreSQL database.',
      timestamp: new Date(),
      tokenCount: estimateTokens('I want to create a full-stack todo application with React frontend and Express backend. It should have user authentication and a PostgreSQL database.')
    },
    {
      id: 'msg-2',
      role: 'assistant' as const,
      content: `Great! I'll create a full-stack todo app with these components:

**Frontend (React + TypeScript)**:
- src/App.tsx - Main application
- src/components/Auth/Login.tsx - Login form
- src/components/Auth/Register.tsx - Registration
- src/components/Todos/TodoList.tsx - Todo list display
- src/components/Todos/TodoItem.tsx - Individual todo

**Backend (Express + TypeScript)**:
- src/server.ts - Express server setup
- src/routes/auth.ts - Auth routes
- src/routes/todos.ts - Todo CRUD routes
- src/middleware/auth.ts - JWT middleware
- src/models/User.ts - User model
- src/models/Todo.ts - Todo model
- src/db/connection.ts - PostgreSQL connection

**Tech Stack**:
- React 18 with TypeScript
- Express.js with TypeScript
- PostgreSQL with Prisma ORM
- JWT for authentication
- Tailwind CSS for styling`,
      timestamp: new Date(),
      tokenCount: 500,
      agentName: 'Coder_Agent'
    },
    {
      id: 'msg-3',
      role: 'user' as const,
      content: 'Can you add real-time updates using WebSockets?',
      timestamp: new Date(),
      tokenCount: estimateTokens('Can you add real-time updates using WebSockets?')
    },
    {
      id: 'msg-4',
      role: 'assistant' as const,
      content: `Yes! I'll add Socket.io for real-time updates:

**New Files**:
- src/socket/index.ts - Socket.io server setup
- src/hooks/useSocket.ts - React hook for socket connection

**Changes**:
- TodoList will subscribe to 'todo:created', 'todo:updated', 'todo:deleted' events
- Server emits events when todos change
- Multiple users see updates in real-time`,
      timestamp: new Date(),
      tokenCount: 200,
      agentName: 'Coder_Agent'
    }
  ];

  try {
    const startTime = Date.now();
    const summary = await summarizer.summarize(testMessages);
    const duration = Date.now() - startTime;
    
    console.log('   ✅ Summarization successful!\n');
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log(`   📊 Original tokens: ${summary.originalTokenCount}`);
    console.log(`   📉 Summary tokens: ${summary.tokenCount}`);
    console.log(`   💾 Reduction: ${Math.round((1 - summary.tokenCount/summary.originalTokenCount) * 100)}%`);
    console.log('');
    console.log('   📝 SUMMARY CONTENT:');
    console.log('   ' + '─'.repeat(46));
    console.log(summary.content.split('\n').map(l => '   ' + l).join('\n'));
    console.log('');
    console.log('   🔑 KEY FACTS:', summary.keyFacts.length > 0 ? summary.keyFacts.join(', ') : 'None extracted');
    console.log('   📁 FILES:', summary.filesCreated.length > 0 ? summary.filesCreated.slice(0, 5).join(', ') : 'None extracted');
    console.log('   🛠️  TECH:', summary.techStack?.join(', ') || 'None extracted');
    
  } catch (error) {
    console.log('   ❌ Summarization failed:', error);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('        TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run the test
testContextManagement().catch(console.error);
