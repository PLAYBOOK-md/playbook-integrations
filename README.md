# PLAYBOOK.md Integrations

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/PLAYBOOK-MD/playbook-integrations)](https://github.com/PLAYBOOK-MD/playbook-integrations/stargazers)
[![npm @playbook-md/core](https://img.shields.io/npm/v/@playbook-md/core)](https://www.npmjs.com/package/@playbook-md/core)
[![npm @playbook-md/mcp](https://img.shields.io/npm/v/@playbook-md/mcp)](https://www.npmjs.com/package/@playbook-md/mcp)

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

**Run the server:**

```bash
npx @playbook-md/mcp
```

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

### 4. Editor & Tool Integrations

The `editors/` directory contains configuration files and instructions for integrating PLAYBOOK.md into popular AI coding tools:

- **Claude Code** (`editors/claude-code/`)
- **Codex** (`editors/codex/`)
- **opencode** (`editors/opencode/`)
- **Continue** (`editors/continue/`)
- **Cline** (`editors/cline/`)
- **Aider** (`editors/aider/`)

Install all editor integrations at once with the CLI:

```bash
playbook setup
```

### 5. Pre-commit Hook

A pre-commit hook is available at `hooks/pre-commit` to validate `.playbook.md` files before committing. Copy it into your project's `.git/hooks/` directory or reference it from your pre-commit configuration.

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
editors/
  claude-code/         Claude Code integration config
  codex/               Codex integration config
  opencode/            opencode integration config
  continue/            Continue integration config
  cline/               Cline integration config
  aider/               Aider integration config
hooks/
  pre-commit           Git pre-commit hook for playbook validation
```

## Related repos

- [playbook-spec](https://github.com/PLAYBOOK-MD/playbook-spec) -- The PLAYBOOK.md specification
- [playbook-schema](https://github.com/PLAYBOOK-MD/playbook-schema) -- TypeScript types and JSON Schema
- [playbook-gallery](https://github.com/PLAYBOOK-MD/playbook-gallery) -- Curated example playbooks
- [playbook-playground](https://github.com/PLAYBOOK-MD/playbook-playground) -- Web-based editor and validator
- [playbook-vscode](https://github.com/PLAYBOOK-MD/playbook-vscode) -- VS Code extension with syntax highlighting and validation
- [playbook-cli](https://github.com/PLAYBOOK-MD/playbook-cli) -- CLI tool for validating, parsing, and scaffolding playbooks
- [playbook-action](https://github.com/PLAYBOOK-MD/playbook-action) -- GitHub Action for PR validation

## License

MIT
