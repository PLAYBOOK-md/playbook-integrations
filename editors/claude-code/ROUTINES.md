# Running PLAYBOOK.md files as Claude Code Routines

[Claude Code Routines](https://code.claude.com/docs/en/routines) run Claude Code sessions autonomously in Anthropic-managed cloud infrastructure, triggered on a schedule, by an HTTP POST, or by GitHub events. This document shows how to run a `.playbook.md` file as a routine with **no custom code** — just a playbook committed to a repo, this skill pack, and a ~6-line routine prompt.

## Three-step setup

**1. Commit your playbook**

Place the file in the repo the routine will clone, e.g. `./playbooks/my-workflow.playbook.md`.

**2. Commit the `playbook-run` skill**

Copy `skills/playbook-run/SKILL.md` from this repository into the target repo at `.claude/skills/playbook-run/SKILL.md`. Claude Code sessions automatically load skills committed to the cloned repository, so the routine's run session learns the full step-execution algorithm (context accumulation, directive processing, branching, autonomous-mode defaults) without any inline instructions in the routine prompt.

```bash
# From the target repo root:
mkdir -p .claude/skills/playbook-run
curl -o .claude/skills/playbook-run/SKILL.md \
  https://raw.githubusercontent.com/PLAYBOOK-MD/playbook-integrations/main/skills/playbook-run/SKILL.md
git add .claude/skills/playbook-run/SKILL.md
git commit -m "chore: add playbook-run skill for Claude Code sessions"
```

**3. Create the routine**

At [claude.ai/code/routines](https://claude.ai/code/routines), click **New routine**:

- **Repository:** the repo containing the playbook and the skill.
- **Connectors:** attach any MCPs referenced by `@tool` or `@prompt(mcp:…)` directives in the playbook.
- **Prompt:** use the template below. Bake input values into the prompt for scheduled runs; parse them from the `text` payload for API-triggered runs.
- **Trigger:** schedule, API, and/or GitHub event.

### Prompt template (scheduled trigger)

```
Execute the workflow defined in ./playbooks/my-workflow.playbook.md per the
PLAYBOOK.md specification. Use the `playbook-run` skill from this repository.

Inputs:
  topic: "Q2 product launch"
  audience: "executive"
  word_count: 1500

If an @elicit directive is encountered, use autonomous-mode defaults:
confirm -> "yes"; select -> first option; input -> "".

Write the final artifact to ./out/{{yyyy-mm-dd}}.md and commit the result to a
claude/ branch with a descriptive commit message.
```

### Prompt template (API trigger)

```
Execute the workflow defined in ./playbooks/my-workflow.playbook.md per the
PLAYBOOK.md specification. Use the `playbook-run` skill from this repository.

The POST body (available as {{text}}) is a YAML document with:
  inputs:
    topic: string
    audience: string
    word_count: number
  elicit:
    <step_number>: <response>

Parse {{text}}, validate required inputs are present, apply the elicit
overrides (defaults otherwise), and execute the playbook. Write the final
artifact to ./out/<run-id>.md.
```

### Prompt template (GitHub trigger)

```
Execute the workflow defined in ./playbooks/review-pr.playbook.md per the
PLAYBOOK.md specification. Use the `playbook-run` skill from this repository.

The triggering event is a pull_request.opened. Inputs:
  pr_number: {{pr.number}}
  pr_title: {{pr.title}}
  base_branch: {{pr.base.ref}}

Post the final artifact as a PR review comment via the GitHub connector.
```

## Compatibility matrix

| Spec feature | Routine support |
|---|---|
| Title / Description / `## SYSTEM` | Full |
| Typed `## INPUTS` | Full — values supplied via prompt (schedule) or `text` body (API) |
| `{{var}}` interpolation | Full |
| Sequential steps + context accumulation | Full |
| `## ARTIFACTS` (all types) | Full — specify destination path in the prompt |
| Branching `if/elif/else` | Full — skill guarantees deterministic selection |
| `@output` (basic / typed / enum) | Full |
| `@output(extract:"field")` | Best-effort — see the skill's "fidelity caveat" section |
| `@prompt(file:…)` | Full — repo is cloned |
| `@prompt(library:…)` | Requires a prompt-library MCP connector on the routine |
| `@prompt(mcp:server/name)` | Full — attach the connector |
| `@prompt({{var}})` | Full |
| `@tool(…)` | Full — attach the connector |
| `@elicit(input\|confirm\|select)` | Autonomous defaults (see below); overrides via `text` payload |
| Breakpoints | Not supported (warning, not error) |

## `@elicit` in autonomous runs

Routines cannot pause for human input. The `playbook-run` skill applies these defaults when no override is supplied:

- `@elicit(confirm, "…")` → `"yes"`
- `@elicit(select, "…", "A", "B", "C")` → `"A"` (first option)
- `@elicit(input, "…")` → `""`

To override, include an `elicit` map in the `/fire` `text` payload keyed by step number. For scheduled runs where you want different defaults, override them explicitly in the routine prompt (e.g., *"For `@elicit(confirm)` in step 3, use `\"no\"`"*).

## Example

A runnable example playbook designed for routines lives in the gallery:
[playbook-gallery / playbooks/routines/weekly-docs-drift.md](https://github.com/PLAYBOOK-MD/playbook-gallery/blob/master/playbooks/routines/weekly-docs-drift.md).

## Related

- User-facing guide: [docs.playbook.style → Guides → Claude Code Routines](https://docs.playbook.style/guides/claude-code-routines/)
- Claude Code Routines docs: [code.claude.com/docs/en/routines](https://code.claude.com/docs/en/routines)
- `playbook-run` skill source: [`skills/playbook-run/SKILL.md`](../../skills/playbook-run/SKILL.md)
