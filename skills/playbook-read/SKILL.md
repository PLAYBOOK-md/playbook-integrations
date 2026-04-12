---
name: playbook-read
description: Parse and understand a .playbook.md file, extracting its structure, inputs, steps, and artifacts.
---

# Playbook Read

Read and understand PLAYBOOK.md files -- the open specification for multi-step AI workflows written in plain markdown.

## When to use

- A user asks you to read, analyze, or explain a `.playbook.md` file
- You need to understand a playbook's structure before modifying or running it
- You need to extract specific information (inputs, steps, outputs) from a playbook
- You are asked to summarize what a playbook does

## Document structure

A PLAYBOOK.md file is a UTF-8 markdown document with this structure:

```
# Title                          REQUIRED   First # heading in document
Description text                 OPTIONAL   Text between title and first ##
## SYSTEM                        OPTIONAL   System prompt for all steps
## INPUTS                        OPTIONAL   Input variable declarations
## STEP 1: Title                 REQUIRED   At least one step
## STEP 2: Title                 ...        Sequential numbering
## STEP N: Title                 ...        No upper limit
## ARTIFACTS                     OPTIONAL   Expected output format
```

Unrecognized `##` headings are silently skipped.

## How to parse step by step

### 1. Find the title

The first `# ` heading (single `#`) in the document is the title. It is required. If there is no `# ` heading, the playbook is invalid.

### 2. Extract the description

Any plain text between the title and the first `##` heading is the description. It is metadata only and not sent to the AI during execution.

### 3. Find the system prompt

Look for `## SYSTEM` or `## SYSTEM PROMPT` (case-insensitive). All content until the next `##` heading is the system prompt. It applies to every step during execution.

### 4. Parse inputs

Look for `## INPUTS` (case-insensitive). Each input is a markdown list item:

```
- `name` (type): Description
- `name` (type: default_value): Description
- `name` (enum: option1, option2, option3): Description
```

Variable names must match `[a-zA-Z][a-zA-Z0-9_]*`.

Valid types and aliases:

| Canonical Type | Aliases |
|----------------|---------|
| `string` | (any unrecognized type) |
| `text` | -- |
| `number` | `num`, `int`, `float` |
| `boolean` | `bool` |
| `enum` | `select`, `choice` |

An input with a default value (after `:` inside parens) is optional. An input without a default is required. Enum inputs list their options after the colon.

### 5. Parse steps

Steps are `## STEP N: Title` headings where N is a sequential integer starting from 1. Everything between the heading and the next `##` is the step body.

Step content may contain:
- Plain text (the prompt sent to the AI)
- `{{variable}}` interpolation placeholders
- Directives on their own lines (see below)
- Branch markers (see below)

### 6. Identify directives

Directives are special lines extracted from step content. They modify execution but are not included in the prompt text.

| Directive | Pattern | Purpose |
|-----------|---------|---------|
| `@output(varname)` | `^@output\((\w+)(?:\s*:\s*(\w+))?((?:,\s*"[^"]*")*)?(?:,\s*extract:"(\w+)")?\)\s*$` | Capture step output as a named variable (optionally typed) |
| `@elicit(type, "prompt")` | `^@elicit\((\w+)(?:,\s*(.+))?\)$` | Pause for human input |
| `@prompt(library:id)` | `^@prompt\(library:([a-zA-Z0-9-]+)\)$` | Prepend external prompt content |
| `@tool(conn, name, {args})` | `^@tool\((.+)\)$` | Invoke external tool (skip AI call) |

**Typed output variants:**
- `@output(varname)` -- untyped, captures the full response as a string
- `@output(varname: type)` -- typed capture (string, text, number, boolean, json, enum)
- `@output(varname: enum, "opt1", "opt2")` -- enum capture with allowed values
- `@output(varname: type, extract:"field")` -- typed with JSON field extraction
- `@output(varname, extract:"field")` -- untyped with JSON field extraction

### 7. Identify branches

Branches use triple-backtick fenced markers:

````
```if variable == "value"```
```elif variable != "other"```
```else```
```endif```
````

Only `==` and `!=` operators are supported (exact string comparison). Values must be double-quoted. Branch sub-steps use `### STEP Na:` headings (e.g., `### STEP 2a: Path A`).

### 8. Parse artifacts

Look for `## ARTIFACTS` (case-insensitive). The type is declared with a `type:` line.

Valid artifact types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`.

## Examples

### Reading a simple playbook

Given this playbook:

```markdown
# Code Review

Review code for quality and security.

## INPUTS

- `code` (text): Code to review
- `language` (string: Go): Programming language

## STEP 1: Analyze

Analyze this {{language}} code for bugs and security issues:
{{code}}

@output(analysis)

## STEP 2: Recommendations

Based on the analysis, provide actionable recommendations.

## ARTIFACTS

type: markdown
```

You should extract:
- **Title:** "Code Review"
- **Description:** "Review code for quality and security."
- **Inputs:** 2 inputs -- `code` (text, required) and `language` (string, default "Go")
- **Steps:** 2 steps -- "Analyze" (with @output capturing `analysis`) and "Recommendations"
- **Artifacts:** markdown

### Reading a playbook with branches

```markdown
# Issue Router

## STEP 1: Classify

Classify this issue: {{issue}}

@output(issue_type)

## STEP 2: Route

```if issue_type == "bug"```

### STEP 2a: Bug Analysis

Analyze the bug and suggest a fix.

```else```

### STEP 2b: Feature Spec

Draft a feature specification.

```endif```
```

You should extract:
- Step 2 is a branching step with 2 branches
- Branch condition checks `issue_type` (an @output from Step 1)
- Sub-steps are "Bug Analysis" (2a) and "Feature Spec" (2b)

## Validation checklist

When reading a playbook, verify:

- [ ] Document has a `# ` title heading
- [ ] At least one `## STEP N: Title` exists
- [ ] Step numbers are sequential starting from 1
- [ ] No duplicate input names
- [ ] Document is under 200KB
- [ ] `{{variable}}` references match declared inputs or prior @output names
- [ ] Branch condition variables are declared inputs or prior @output names
- [ ] Artifact type (if present) is one of the 7 valid types, or a `{{variable}}` reference to a declared variable
- [ ] @elicit types are `input`, `confirm`, or `select`
- [ ] @output type annotations (if present) are valid: `string`, `text`, `number`, `boolean`, `json`, `enum`
