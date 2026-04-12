# Editor & Tool Integrations

Ready-to-copy configuration snippets that add PLAYBOOK.md support to your coding tool.

All integrations connect to the `@playbook-md/mcp` server, which provides tools for parsing, validating, running, converting, and summarizing .playbook.md files.

## Quick Setup

The fastest way to set up any integration is with the CLI:

```bash
playbook setup
```

This auto-detects your coding tool and generates the right config files. Or specify directly:

```bash
playbook setup --tool claude-code
playbook setup --tool codex
playbook setup --tool opencode
playbook setup --tool continue
playbook setup --tool aider
```

## Manual Setup

### Claude Code

Copy two files to your project root:

| Source | Destination | Purpose |
|--------|-------------|---------|
| `claude-code/mcp.json` | `.mcp.json` | MCP server config |
| `claude-code/CLAUDE.md` | `CLAUDE.md` (or append to existing) | Teaches Claude about .playbook.md files |

### Codex (OpenAI)

| Source | Destination | Purpose |
|--------|-------------|---------|
| `codex/config.toml` | `.codex/config.toml` | MCP server config |
| `codex/AGENTS.md` | `AGENTS.md` (or append to existing) | Teaches Codex about .playbook.md files |

### opencode

| Source | Destination | Purpose |
|--------|-------------|---------|
| `opencode/opencode.json` | `.opencode.json` | MCP server config |

### Continue

Add the `mcpServers` entry from `continue/config.json` to your existing `.continue/config.json`:

| Source | Destination | Purpose |
|--------|-------------|---------|
| `continue/config.json` | `.continue/config.json` (merge) | MCP server config |

### Cline

Add the server entry from `cline/mcp-settings.json` to your Cline MCP settings:

| Source | Destination | Purpose |
|--------|-------------|---------|
| `cline/mcp-settings.json` | Cline MCP settings (merge) | MCP server config |

### Aider

| Source | Destination | Purpose |
|--------|-------------|---------|
| `aider/CONVENTIONS.md` | `CONVENTIONS.md` (or append to existing) | Teaches Aider about .playbook.md files |

## What each integration provides

**MCP config** -- Connects the tool to the `@playbook-md/mcp` server so AI agents can use:
- `playbook_parse` -- Parse .playbook.md into structured data
- `playbook_validate` -- Check spec compliance (fatal errors + warnings)
- `playbook_run` -- Execute a playbook step by step
- `playbook_convert` -- Convert to JSON format
- `playbook_summarize` -- Summarize a playbook's structure

**Agent instructions** (CLAUDE.md / AGENTS.md / CONVENTIONS.md) -- Teaches the AI:
- What .playbook.md files are
- Key spec rules for reading and writing playbooks
- How to use the MCP tools

## Pre-commit hook

See `../hooks/pre-commit` for a Git hook that validates all staged .playbook.md files on commit.
