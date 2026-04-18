# Running PLAYBOOK.md files as GitHub Action steps

[`PLAYBOOK-MD/playbook-native`](https://github.com/PLAYBOOK-MD/playbook-native) is a standalone GitHub Action that executes `.playbook.md` files in CI. It ships as a single Node 20 bundle that calls the Anthropic SDK directly step-by-step — no dependency on `anthropics/claude-code-action`.

**Scope in v1:** native does not support MCP directives (`@tool(…)`, `@prompt(mcp:…)`, `@prompt(library:…)`). Playbooks using those will fail at pre-flight validation with an actionable error. A composite variant (`playbook-run`) backed by `anthropics/claude-code-action` was explored and deferred pending upstream API clarification.

## Three-step setup

**1. Commit your playbook** to the repo, e.g. `./playbooks/weekly-docs-drift.playbook.md`.

**2. Store your Anthropic key** as a repo secret named `ANTHROPIC_API_KEY`.

**3. Add the workflow** (see templates below).

## Workflow templates

### PR-triggered (e.g. PR review, auto-summary)

```yaml
name: Playbook — PR summary
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v5
      - id: run
        uses: PLAYBOOK-MD/playbook-native@v1
        with:
          playbook: playbooks/pr-summary.playbook.md
          inputs: |
            pr_title: ${{ github.event.pull_request.title }}
            pr_body: ${{ github.event.pull_request.body }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('${{ steps.run.outputs.artifact-path }}', 'utf-8');
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.payload.pull_request.number, body,
            });
```

### Scheduled (cron)

```yaml
on:
  schedule: [{ cron: '0 9 * * 1' }]
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: PLAYBOOK-MD/playbook-native@v1
        with:
          playbook: playbooks/weekly-docs-drift.playbook.md
          output-path: out/drift-${{ github.run_id }}.md
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### On-demand (`workflow_dispatch`)

```yaml
on:
  workflow_dispatch:
    inputs:
      topic: { description: Topic, required: true }

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: PLAYBOOK-MD/playbook-native@v1
        with:
          playbook: playbooks/research.playbook.md
          inputs: "topic: ${{ inputs.topic }}"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Compatibility matrix

| Spec feature | `playbook-native` v1 |
|---|---|
| Title / Description / `## SYSTEM` | Full |
| Typed `## INPUTS` | Full |
| `{{var}}` interpolation | Full |
| Sequential steps + context accumulation | Full |
| `## ARTIFACTS` (all types) | Full |
| Branching `if/elif/else` | Full |
| `@output` (basic / typed / enum) | Full |
| `@output(extract:"field")` | Full (deterministic parser) |
| `@prompt(file:…)` | Full |
| `@prompt(library:…)` | **Not supported** (requires MCP) |
| `@prompt(mcp:server/name)` | **Not supported** |
| `@prompt({{var}})` | Full |
| `@tool(name)` | **Not supported** (requires MCP) |
| `@elicit(input\|confirm\|select)` | Autonomous defaults; overrides via `elicit:` input |
| Breakpoints | Not supported (warning) |

## `@elicit` in autonomous runs

Native applies the same autonomous-mode defaults as Claude Code Routines when no override is provided:

- `@elicit(confirm, "…")` → `"yes"`
- `@elicit(select, "…", "A", "B", "C")` → `"A"` (first option)
- `@elicit(input, "…")` → `""`

Override per step via the `elicit:` action input:

```yaml
with:
  elicit: |
    3: "no"
    4: "Performance"
```

### User-composed pauses

Unlike routines, GitHub Actions *can* pause on human input — but v1 doesn't implement first-class pauses. Compose them around the action:

- **Environment gate** (for confirm-style approvals): a downstream job with `environment: <name-with-required-reviewers>` blocks on approval via the Actions UI.
- **Third-party manual-approval actions** (e.g. [`trstringer/manual-approval`](https://github.com/trstringer/manual-approval)): use a preceding step that opens an issue and polls for a response.

## Related

- User-facing guide: [docs.playbook.style → Guides → GitHub Actions](https://docs.playbook.style/guides/github-actions/)
- Routines doc (sibling target): [`ROUTINES.md`](./ROUTINES.md)
- Gallery section: [Ready for GitHub Actions](https://github.com/PLAYBOOK-MD/playbook-gallery#ready-for-github-actions)
