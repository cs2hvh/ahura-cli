# Ahura Project Guidelines

## Project Overview
This is the Ahura CLI - an AI-powered multi-agent code generation tool.

## Code Style
- Use TypeScript with strict typing
- Prefer async/await over callbacks
- Use meaningful variable names
- Keep functions small and focused

## Architecture
- Agents: CoderAgent, PlannerAgent, TesterAgent, ReviewerAgent
- Tools: File operations, terminal commands, web search
- Providers: OpenRouter, Anthropic, OpenAI

## Testing
- Run `npm run build` before committing
- Test CLI commands manually with `ahura` in a test folder

## Important Notes
- Always preserve user's existing code style
- Don't add unnecessary dependencies
- Keep backward compatibility
