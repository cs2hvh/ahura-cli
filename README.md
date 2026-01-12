# 🔮 Ahura (AhuraSense)

**AI-Powered Code Generator CLI** - A multi-agent orchestration platform for autonomous software development.

```
   █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗ 
  ██╔══██╗██║  ██║██║   ██║██╔══██╗██╔══██╗
  ███████║███████║██║   ██║██████╔╝███████║
  ██╔══██║██╔══██║██║   ██║██╔══██╗██╔══██║
  ██║  ██║██║  ██║╚██████╔╝██║  ██║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
```

## ✨ Features

- **⚡ Lite Mode** - Quick tasks with a single Coder agent
- **🏗️ Full Mode** - Enterprise pipeline with Planner → Coder → Tester → Reviewer
- **🤖 Agent Tagging** - Chat directly with specific agents using `@coder`, `@tester`, `@planner`, `@reviewer`
- **📦 Framework Scaffolding** - Auto-runs `npx create-next-app`, `create-react-app`, etc.
- **💬 Conversation Memory** - Follow-up on previous requests naturally
- **🔄 Streaming Output** - See files being created in real-time

## 📦 Installation

```bash
npm install -g ahurasense
```

## ⚙️ Setup

Create a `.env` file in your home directory or project folder:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key
# Optional: For GPT models
OPENAI_API_KEY=your-openai-api-key
```

Get your API key from [Anthropic Console](https://console.anthropic.com/).

## 🚀 Usage

```bash
# Start Ahura in any directory
ahura

# Or use the full name
ahurasense
```

### Basic Commands

```bash
# Just describe what you want
> create a REST API with Express and MongoDB
> add authentication with JWT
> now add rate limiting

# Switch modes
/lite    # Quick single-agent mode
/full    # Enterprise multi-agent pipeline

# Agent tags - chat directly with specific agents
@coder how do I fix this import error?
@tester test the /api/users endpoint
@planner how should I structure this project?
@reviewer check my code for issues

# Other commands
/help    # Show all commands
/status  # Session stats
/clear   # Clear conversation
/exit    # Exit
```

### Modes

#### ⚡ Lite Mode (Default)
- Single Coder agent
- Fast execution
- Perfect for quick tasks and small features

#### 🏗️ Full Mode
- Multi-agent pipeline: Planner → Coder → Tester → Reviewer
- Uses CLI scaffolding (npx create-next-app, etc.)
- Minimal task generation
- Code quality review

## 🤖 Agent Tags

Chat directly with any agent:

| Tag | Agent | Use Case |
|-----|-------|----------|
| `@coder` | Coder | Code questions, implementations (default) |
| `@tester` | Tester | Test APIs, find bugs, security review |
| `@planner` | Planner | Architecture advice, project structure |
| `@reviewer` | Reviewer | Code review, best practices |

**Examples:**
```bash
@tester test the /api/users route for security issues
@planner how should I structure a microservices app?
@reviewer check my authentication implementation
```

## 📁 Supported Frameworks

Full Mode automatically scaffolds these frameworks:

- **Next.js** - `npx create-next-app`
- **React** - `npx create-react-app`
- **Vite** - `npm create vite`
- **NestJS** - `npx @nestjs/cli new`
- **Angular** - `npx @angular/cli new`
- And more...

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | No | OpenAI API key (for GPT models) |

### Model Configuration

Edit `src/config/index.ts` to change models:
- `claude-sonnet-4-20250514` (default)
- `gpt-4o`
- `gpt-4-turbo`

## 📝 Examples

### Create a Next.js App with Database

```bash
> /full
> create next js app with mysql2 connection

# Ahura will:
# 1. Run: npx create-next-app@latest
# 2. Install: npm install mysql2
# 3. Create: Database utility file
# 4. Create: Example API route
# 5. Test & Review the code
```

### Quick API Endpoint

```bash
> create an Express endpoint for user registration with validation
```

### Get Testing Feedback

```bash
@tester analyze my authentication code for security vulnerabilities
```

## 🤝 Contributing

Contributions are welcome! Please open an issue or PR.

## 📄 License

MIT © [AhuraSense](https://github.com/yourusername/ahurasense)
