# PLAYBOOK.md Conventions

This project uses PLAYBOOK.md files -- multi-step AI workflows written in plain markdown.

## File extension

All playbook files use the `.playbook.md` extension.

## Document structure

```
# Title                        REQUIRED
Description text               OPTIONAL
## SYSTEM                      OPTIONAL  System prompt
## INPUTS                      OPTIONAL  Variable declarations
## STEP 1: Title               REQUIRED  At least one step
## STEP N: Title               ...       Sequential from 1
## ARTIFACTS                   OPTIONAL  Output format
```

## Rules to follow when editing .playbook.md files

1. Always include a single `#` title heading
2. Number steps sequentially starting from 1 (`## STEP 1: ...`, `## STEP 2: ...`)
3. Use the input format exactly: `- \`name\` (type): Description`
4. Reference variables with double braces: `{{variable_name}}`
5. Place directives (`@output`, `@elicit`) on their own line inside steps
6. Use `@output(varname)` to capture step results for later steps. Optionally add a type: `@output(name: type)` where type is string, text, number, boolean, json, or enum. Enum outputs list options: `@output(name: enum, "a", "b")`
7. Branch conditions use fenced code blocks: `` ```if condition``` `` / `` ```else``` `` / `` ```endif``` ``
8. Valid artifact types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript` (or `{{variable}}` for dynamic type)
9. Keep documents under 200 KB

## Validation

To validate: `playbook validate <file>` or `npx @playbook-md/cli validate <file>`

Fatal errors (makes playbook invalid): missing title, missing steps, duplicate input names, >200 KB, empty file.

Warnings (valid but problematic): non-sequential step numbers, malformed input lines, unknown artifact types, undeclared variables, output shadowing input.
