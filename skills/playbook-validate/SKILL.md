---
name: playbook-validate
description: Check a .playbook.md file for spec compliance, reporting all fatal errors and warnings.
---

# Playbook Validate

Validate PLAYBOOK.md files against the specification, checking for fatal errors and warnings.

## When to use

- A user asks you to check if a playbook is valid
- Before running or deploying a playbook
- After editing a playbook to verify correctness
- When triaging why a playbook fails to parse or execute

## Fatal errors

These conditions make a playbook invalid. Parsing must fail.

| # | Condition | Description |
|---|-----------|-------------|
| F1 | No title | No `# ` heading found in the document |
| F2 | No steps | No `## STEP N: Title` heading found |
| F3 | Duplicate input name | Two inputs share the same variable name |
| F4 | Content too large | Document exceeds 200,000 bytes (200 KB) |
| F5 | Empty content | Document is empty or whitespace-only |

## Warnings

These conditions are problems but do not prevent parsing. The playbook can still execute, but results may be unexpected.

| # | Condition | Description |
|---|-----------|-------------|
| W1 | Non-sequential step numbers | Steps are not numbered 1, 2, 3... |
| W2 | Malformed input line | A list item in INPUTS starts with `-` or `*` but does not match the expected format `- \`name\` (type): Description` |
| W3 | Unknown artifact type | Artifact type is not one of: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript` |
| W4 | Undeclared branch variable | A branch condition references a variable not declared as input or @output |
| W5 | Invalid elicit type | An `@elicit` directive uses a type other than `input`, `confirm`, or `select` |
| W6 | Undeclared interpolation variable | A `{{variable}}` placeholder references a variable not declared as input or prior @output |
| W7 | Output shadows input | An `@output` variable name matches a declared input name |

## Step-by-step validation procedure

### 1. Check document basics

```
IF document is empty or whitespace-only -> FATAL F5
IF document byte length > 200,000     -> FATAL F4
```

### 2. Find the title

Scan for the first `# ` heading (single `#`, not `##`).

```
IF no # heading found -> FATAL F1
```

### 3. Find steps

Scan for `## STEP N: Title` headings.

```
IF no steps found -> FATAL F2
```

Check numbering:
```
FOR each step at index i:
  IF step.number != i + 1 -> WARNING W1
```

### 4. Validate inputs

Parse the `## INPUTS` section.

```
FOR each input line starting with - or *:
  IF line does not match format -> WARNING W2
  IF input name already seen   -> FATAL F3
```

### 5. Validate variable references

Build a set of available variables at each step:

```
available = Set(all input names)

FOR each step in order:
  FOR each {{variable}} in step content:
    IF variable NOT IN available -> WARNING W6
  FOR each branch condition variable:
    IF variable NOT IN available -> WARNING W4
  IF step has @output(name):
    IF name IN input_names -> WARNING W7
    ADD name to available
  FOR each branch sub-step:
    (same checks as above)
```

### 6. Validate directives

```
FOR each @elicit(type, ...):
  IF type NOT IN ["input", "confirm", "select"] -> WARNING W5
```

### 7. Validate artifacts

```
IF ## ARTIFACTS has a type: line:
  IF type NOT IN valid_types -> WARNING W3
```

Valid types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`.

### 8. Validate branches

```
FOR each branch block:
  IF variable NOT IN (inputs UNION prior_outputs) -> WARNING W4
  Verify each if has matching endif
  Verify sub-step labels match parent step number
```

## Examples

### Validating a correct playbook

```markdown
# My Workflow

## INPUTS

- `topic` (string): Subject

## STEP 1: Research

Research {{topic}}.

## STEP 2: Write

Write about the research.
```

Result: **Valid** -- 0 fatal errors, 0 warnings.

### Catching a missing title

```markdown
Some text without a heading.

## STEP 1: Do Something

Do the thing.
```

Result: **Invalid** -- Fatal error F1: "No title found."

### Catching an undeclared variable

```markdown
# My Workflow

## STEP 1: Research

Research {{topic}} for {{audience}}.
```

Result: **Valid** with 2 warnings (W6): `topic` and `audience` are not declared as inputs or prior @output names.

### Catching output shadowing input

```markdown
# My Workflow

## INPUTS

- `topic` (string): Subject

## STEP 1: Research

Research {{topic}}.

@output(topic)
```

Result: Warning W7: @output variable "topic" shadows an input name.

## Validation checklist

When reporting validation results:

- [ ] Check all 5 fatal error conditions (F1-F5)
- [ ] Check all 7 warning conditions (W1-W7)
- [ ] Report the line number for each issue when available
- [ ] Clearly distinguish between fatal errors (invalid) and warnings (valid but problematic)
- [ ] If there are fatal errors, the playbook cannot be executed
- [ ] If there are only warnings, the playbook can execute but results may be unexpected
