# PLAYBOOK.md Support

This project uses PLAYBOOK.md files (.playbook.md) -- multi-step AI workflows in plain markdown.

## Spec rules

A valid .playbook.md file must have:
- A single `#` title heading (fatal error if missing)
- At least one `## STEP N: Title` heading (fatal error if missing)
- Steps numbered sequentially from 1

Optional sections: `## SYSTEM`, `## INPUTS`, `## ARTIFACTS`.

Input format: `- \`name\` (type): Description`

Directives (on their own line inside steps):
- `@output(varname)` -- capture step output as a variable
- `@output(varname: type)` -- typed capture (string, text, number, boolean, json, enum)
- `@output(varname: enum, "opt1", "opt2")` -- enum capture with allowed values
- `@output(varname, extract:"field")` -- extract a JSON field
- `@output(varname: type, extract:"field")` -- typed with extraction
- `@elicit(type, ...)` -- request user input during execution

Regex for @output: `^@output\((\w+)(?:\s*:\s*(\w+))?((?:,\s*"[^"]*")*)?(?:,\s*extract:"(\w+)")?\)\s*$`

Variable interpolation uses `{{variable_name}}`.

Branch conditions use fenced code: `` ```if condition``` `` / `` ```else``` `` / `` ```endif``` ``

Artifact types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`. Supports dynamic type via `{{variable}}` interpolation (e.g., `type: {{output_format}}`).

## MCP server

The `playbook-md` MCP server provides tools for parsing, validating, running, converting, and summarizing .playbook.md files. Use it instead of manual parsing when available.

## Validation

Fatal errors: no title (F1), no steps (F2), duplicate input names (F3), >200 KB (F4), empty document (F5).

Warnings: non-sequential step numbers (W1), malformed input lines (W2), unknown artifact type (W3), undeclared branch variable (W4), invalid elicit type (W5), undeclared interpolation variable (W6), output shadows input (W7).
