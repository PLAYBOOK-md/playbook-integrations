# AGENTS.md

## What this repo is

playbook-integrations provides PLAYBOOK.md integration for AI agent
environments: Agent Skills (skills.sh), an MCP server, and AGENTS.md
support. It does NOT contain the spec itself -- that lives in
playbook-spec.

## Setup

- Install deps: `npm install`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

## Code style

- TypeScript strict mode
- No default exports
- Explicit return types on public functions
- Error handling at boundaries, trust internal code
- Minimal dependencies -- prefer standard library

## Architecture

- `packages/core/` -- parser, validator, converter (shared library)
- `packages/mcp/` -- MCP server (consumes core)
- `skills/` -- Agent Skill definitions (SKILL.md files, no code)
- Schema types imported from `@playbook-md/schema`

## Testing

- Unit tests with Vitest
- Test fixtures are `.playbook.md` files in `packages/core/test/fixtures/`
- Run `npm test` before committing
- Parser tests must cover all fatal errors and warnings from the spec

## Key rules

- Skills are pure markdown. No code in SKILL.md files.
- The MCP server must not call any external LLM. It provides tools
  for the host agent to use with its own LLM.
- The parser must match the spec exactly. When in doubt, the spec
  in playbook-spec/spec/ is the source of truth.
- Commits use conventional commit format.
