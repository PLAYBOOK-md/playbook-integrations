# playbook-integrations

Agent Skills, MCP server, and shared parser/validator for [PLAYBOOK.md](https://github.com/PLAYBOOK-MD/playbook-spec) -- the open specification for multi-step AI workflows written in plain markdown.

## Integration surfaces

This repo provides three ways to integrate PLAYBOOK.md into AI agent environments:

### 1. Agent Skills

Self-contained markdown files that teach AI agents how to read, write, validate, run, and convert playbooks. No code required -- just pure markdown instructions.

**Available skills:**

| Skill | Description |
|-------|-------------|
| `playbook-read` | Parse and understand a .playbook.md file |
| `playbook-write` | Create a valid playbook from requirements |
| `playbook-validate` | Check a playbook for spec compliance |
| `playbook-run` | Execute a playbook step by step |
| `playbook-convert` | Convert between PLAYBOOK.md, JSON, and plain English |

**Install skills:**

```bash
npx skills add PLAYBOOK-MD/playbook-integrations
```

### 2. MCP Server

A Model Context Protocol server that exposes playbook operations as tools for AI agents. The MCP server does NOT call any external LLM -- it provides tools for the host agent to use with its own LLM.

**Status:** Coming soon.

### 3. Core Library

A shared TypeScript library (`@playbook-md/core`) with zero dependencies that provides:

- **Parser** -- Parse .playbook.md files into structured data
- **Validator** -- Semantic validation beyond syntax checking
- **Summarizer** -- Compact summaries of playbook structure
- **Converter** -- Convert between markdown and JSON formats

```typescript
import { parsePlaybook, validatePlaybook, summarizePlaybook } from '@playbook-md/core';

const result = parsePlaybook(markdown);
const validation = validatePlaybook(markdown);
const summary = summarizePlaybook(result.definition!);
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

## Project structure

```
packages/
  core/       @playbook-md/core -- parser, validator, converter
  mcp/        @playbook-md/mcp -- MCP server
skills/
  playbook-read/       SKILL.md
  playbook-write/      SKILL.md
  playbook-validate/   SKILL.md
  playbook-run/        SKILL.md
  playbook-convert/    SKILL.md
```

## Related repos

- [playbook-spec](https://github.com/PLAYBOOK-MD/playbook-spec) -- The PLAYBOOK.md specification
- [playbook-schema](https://github.com/PLAYBOOK-MD/playbook-schema) -- TypeScript types and JSON Schema
- [playbook-gallery](https://github.com/PLAYBOOK-MD/playbook-gallery) -- Curated example playbooks
- [playbook-playground](https://github.com/PLAYBOOK-MD/playbook-playground) -- Web-based editor and validator

## License

MIT
