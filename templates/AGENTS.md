# PLAYBOOK.md

This project uses PLAYBOOK.md files -- multi-step AI workflows written in plain markdown. Files use the `.playbook.md` extension.

## Reading playbooks

A .playbook.md file has this structure:

```
# Title                        REQUIRED  The workflow name
Description text               OPTIONAL  Between title and first ##
## SYSTEM                      OPTIONAL  System prompt for all steps
## INPUTS                      OPTIONAL  Variable declarations
## STEP 1: Title               REQUIRED  At least one step needed
## STEP 2: Title               ...       Sequential numbering from 1
## STEP N: Title               ...       No upper limit (under 200 KB)
## ARTIFACTS                   OPTIONAL  Expected output format
```

Input lines follow this format:
```
- `name` (type): Description
- `name` (type: default_value): Description
- `name` (enum: option1, option2, option3): Description
```

Variable interpolation uses `{{variable_name}}` syntax. Variables come from INPUTS or prior `@output` directives.

## Writing playbooks

When creating or editing .playbook.md files, follow these rules:

1. Start with a single `#` title heading (required)
2. Number steps sequentially: `## STEP 1: Title`, `## STEP 2: Title`, etc.
3. At least one step is required
4. Use exact input format: `- \`name\` (type): Description`
5. Place directives on their own line inside step content
6. Reference variables with `{{name}}` only after they are declared as inputs or captured by `@output`
7. Keep the document under 200 KB

### Directives

Directives appear on their own line inside steps. They are not sent to the AI as prompt text.

- `@output(varname)` -- Capture the step's AI response as a named variable
- `@output(varname, extract:"field")` -- Extract a JSON field from the response
- `@elicit(type, ...)` -- Pause execution and request user input
  - Types: `input`, `confirm`, `select`

### Branching

Conditional branches use fenced code blocks inside steps:

```markdown
## STEP 2: Route

Route based on classification.

\`\`\`if issue_type == "bug"\`\`\`

### STEP 2a: Bug Path

Fix the bug.

\`\`\`else\`\`\`

### STEP 2b: Feature Path

Design the feature.

\`\`\`endif\`\`\`
```

Sub-step labels must match the parent step number (e.g., 2a, 2b for STEP 2).

### Artifacts

The `## ARTIFACTS` section declares the expected output format:

```markdown
## ARTIFACTS

type: markdown
```

Valid types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`.

## Validating playbooks

### Fatal errors (playbook is invalid)

| Code | Condition |
|------|-----------|
| F1 | No `#` title heading found |
| F2 | No `## STEP N: Title` headings found |
| F3 | Duplicate input variable names |
| F4 | Document exceeds 200 KB |
| F5 | Document is empty or whitespace-only |

### Warnings (valid but problematic)

| Code | Condition |
|------|-----------|
| W1 | Non-sequential step numbers |
| W2 | Malformed input line |
| W3 | Unknown artifact type |
| W4 | Undeclared branch variable |
| W5 | Invalid elicit type |
| W6 | Undeclared interpolation variable |
| W7 | @output variable shadows an input name |

### CLI validation

```bash
playbook validate <file.playbook.md>
# or without the CLI installed:
npx @playbook-md/cli validate <file.playbook.md>
```

## Running playbooks

Playbooks execute sequentially. Each step receives all prior step outputs as context. The execution model:

1. Collect input values for all declared INPUTS
2. For each step in order:
   - Interpolate `{{variables}}` into the prompt
   - Send prompt to AI (with system prompt if declared)
   - If step has `@output`, capture the response as a named variable
   - If step has `@elicit`, pause for user input
   - Evaluate branch conditions if present
3. Emit final output in the ARTIFACTS format (if declared)

## MCP server

If the `@playbook-md/mcp` server is configured, use these tools instead of manual parsing:

- **playbook_parse** -- Parse a file into structured data
- **playbook_validate** -- Check spec compliance
- **playbook_run** -- Execute step by step
- **playbook_convert** -- Convert to JSON
- **playbook_summarize** -- Summarize structure and purpose

## Spec reference

Full specification: https://github.com/PLAYBOOK-MD/playbook-spec
