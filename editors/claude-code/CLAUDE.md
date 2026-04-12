# PLAYBOOK.md Support

This project uses PLAYBOOK.md files -- multi-step AI workflows written in plain markdown.

## File format

Files ending in `.playbook.md` follow the PLAYBOOK.md specification. Structure:

```
# Title                        REQUIRED  First H1 heading
Description text               OPTIONAL  Between title and first ##
## SYSTEM                      OPTIONAL  System prompt for all steps
## INPUTS                      OPTIONAL  Input variable declarations
## STEP 1: Title               REQUIRED  At least one step
## STEP 2: Title               ...       Sequential numbering
## ARTIFACTS                   OPTIONAL  Expected output format
```

## Key spec rules

- Title must be a single `#` heading (fatal error if missing)
- At least one `## STEP N: Title` is required (fatal error if missing)
- Steps are numbered sequentially starting from 1
- Input format: `- \`name\` (type): Description`
- Variables are referenced with `{{variable_name}}` interpolation
- Directives (`@output`, `@elicit`) appear on their own line inside steps
- `@output(varname)` captures a step's result for use in later steps
- Branch conditions use fenced code blocks: `` ```if condition``` ``
- Artifacts declare output type: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`
- Max document size: 200 KB

## MCP tools available

The `playbook-md` MCP server is configured for this project. Use these tools:

- **playbook_parse** -- Parse a .playbook.md file into structured data (title, steps, inputs, etc.)
- **playbook_validate** -- Check a .playbook.md file for spec compliance, returns fatal errors and warnings
- **playbook_run** -- Execute a playbook step by step (requires input values)
- **playbook_convert** -- Convert a .playbook.md file to JSON format
- **playbook_summarize** -- Generate a concise summary of a playbook's structure and purpose

When working with .playbook.md files, prefer using these MCP tools over manual parsing.
