---
name: playbook-write
description: Create a valid .playbook.md file from requirements, following the PLAYBOOK.md specification.
---

# Playbook Write

Create valid PLAYBOOK.md files -- the open specification for multi-step AI workflows written in plain markdown.

## When to use

- A user asks you to create a new playbook
- You need to convert a workflow description into PLAYBOOK.md format
- You need to modify an existing playbook while keeping it spec-compliant
- You are generating a playbook from structured data (JSON, conversation, etc.)

## Syntax rules

### Title (required)

Use a single `#` heading as the first heading in the document:

```markdown
# My Workflow Title
```

### Description (optional)

Plain text between the title and the first `##` heading:

```markdown
# My Workflow

This playbook automates code review with security focus.

## INPUTS
```

### System prompt (optional)

Use `## SYSTEM` or `## SYSTEM PROMPT`:

```markdown
## SYSTEM

You are an expert code reviewer. Be specific and cite line numbers.
```

The system prompt applies to every step. Use it for persona and behavioral instructions.

### Inputs (optional)

Use `## INPUTS` with markdown list items:

```markdown
## INPUTS

- `name` (type): Description
- `name` (type: default_value): Description
- `name` (enum: option1, option2, option3): Description
```

Rules:
- Variable names: `[a-zA-Z][a-zA-Z0-9_]*` (start with letter, letters/digits/underscores)
- Names must be unique (duplicates are a fatal error)
- Types: `string`, `text`, `number` (`num`, `int`, `float`), `boolean` (`bool`), `enum` (`select`, `choice`)
- A default value after `:` makes the input optional
- Enum options are comma-separated after `:`

### Steps (required, at least one)

Use `## STEP N: Title` with sequential integers starting from 1:

```markdown
## STEP 1: Research

Research {{topic}} and identify key themes.

## STEP 2: Write

Write an article based on the research above.
```

Step content is the prompt text sent to the AI. Use `{{variable}}` for input interpolation.

### Directives

Place directives on their own lines within step content:

**@output** -- Capture step output as a named variable:
```markdown
@output(analysis)
@output(severity, extract:"level")
```

**@elicit** -- Pause for human input:
```markdown
@elicit(input, "What feedback do you have?")
@elicit(confirm, "Proceed with this approach?")
@elicit(select, "Which option?", "Option A", "Option B", "Option C")
```

**@prompt** -- Prepend external prompt content:
```markdown
@prompt(library:owasp-review-criteria)
```

**@tool** -- Invoke external tool (skips AI call):
```markdown
@tool(analytics, get_metrics, {"period": "{{timeframe}}"})
```

### Branching (optional)

Use triple-backtick fenced markers for conditional paths:

````markdown
## STEP 2: Route

```if variable == "value"```

### STEP 2a: Path A

Content for path A.

```elif variable != "other"```

### STEP 2b: Path B

Content for path B.

```else```

### STEP 2c: Default

Fallback content.

```endif```
````

Rules:
- Only `==` and `!=` operators (exact string comparison)
- Values must be double-quoted
- Variables must be declared inputs or prior @output names
- Sub-steps use `### STEP Na:` format (number + lowercase letter)
- No nesting -- branches cannot contain branches

### Artifacts (optional)

Use `## ARTIFACTS` with a `type:` line:

```markdown
## ARTIFACTS

type: markdown
```

Valid types: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`.

## Step-by-step instructions

1. **Identify the workflow goal.** What does the user want to automate? What is the expected output?

2. **Determine inputs.** What data does the user need to provide? Choose appropriate types. Mark required vs optional.

3. **Design the steps.** Break the workflow into sequential AI calls. Each step should have a clear, single purpose. Use context accumulation -- each step automatically receives all prior outputs.

4. **Add directives where needed:**
   - Use `@output` when a later step or branch needs to reference this step's result by name
   - Use `@elicit` for human review gates or decision points
   - Use `@tool` for data fetching or external actions
   - Use `@prompt` to inject reusable prompt templates

5. **Add branching if needed.** Use conditional paths when the workflow should diverge based on an input value or AI classification.

6. **Declare the artifact type** if the final output has a specific format (markdown report, JSON data, diagram, etc.).

7. **Write a system prompt** if the AI needs consistent persona or behavioral instructions across all steps.

8. **Review for correctness** using the validation checklist below.

## Template

```markdown
# [Workflow Title]

[Brief description of what this playbook does.]

## SYSTEM

[Persona and behavioral instructions for the AI.]

## INPUTS

- `input1` (string): [Description]
- `input2` (text): [Description]
- `input3` (enum: opt1, opt2, opt3): [Description]

## STEP 1: [First Action]

[Prompt text with {{input1}} interpolation.]

@output(step1_result)

## STEP 2: [Second Action]

[Prompt text that builds on Step 1 output.]

## ARTIFACTS

type: markdown
```

## Complete examples

### Example 1: Linear workflow (no branching)

```markdown
# Competitive Analysis

Analyze a technology and recommend adoption or alternatives.

## SYSTEM

You are a technology analyst. Be objective, data-driven, and specific about trade-offs.

## INPUTS

- `technology` (string): Technology to evaluate
- `criteria` (text): Evaluation criteria
- `max_alternatives` (number: 3): Number of alternatives to suggest

## STEP 1: Research

Research {{technology}} across these dimensions:
{{criteria}}

Provide factual findings with sources.

@output(research)

## STEP 2: Evaluate

Score {{technology}} against the criteria on a 1-10 scale.
Provide a recommendation: adopt, trial, assess, or hold.

@output(evaluation)

## STEP 3: Alternatives

Suggest {{max_alternatives}} alternatives to {{technology}}.
For each, explain how it compares on the same criteria.

## ARTIFACTS

type: markdown
```

### Example 2: Branching workflow

```markdown
# Issue Triage

Classify and route an issue to the appropriate handler.

## INPUTS

- `issue` (text): Issue description
- `priority` (enum: low, medium, high, critical): Issue priority

## STEP 1: Classify

Classify this issue as exactly one of: "bug", "feature", or "question".

{{issue}}

Respond with a JSON object: {"classification": "bug|feature|question"}

@output(issue_type, extract:"classification")

## STEP 2: Route

```if issue_type == "bug"```

### STEP 2a: Bug Analysis

Analyze this {{priority}} priority bug:
{{issue}}

Provide reproduction steps, likely cause, and suggested fix.

```elif issue_type == "feature"```

### STEP 2b: Feature Spec

Draft a feature specification for:
{{issue}}

Include user stories, acceptance criteria, and effort estimate.

```else```

### STEP 2c: Answer

Provide a helpful answer to this question:
{{issue}}

```endif```

## ARTIFACTS

type: markdown
```

## Validation checklist

Before finalizing a playbook, verify:

- [ ] Has a `# ` title heading (required)
- [ ] Has at least one `## STEP N: Title` (required)
- [ ] Step numbers are sequential: 1, 2, 3...
- [ ] No duplicate input names
- [ ] All `{{variable}}` references exist as inputs or prior @output names
- [ ] @output variable names do not shadow input names
- [ ] Branch condition variables are declared inputs or prior @output names
- [ ] Branch values are double-quoted
- [ ] Every `if` has a matching `endif`
- [ ] Sub-step labels match parent step number (e.g., STEP 2a inside STEP 2 branches)
- [ ] @elicit types are one of: `input`, `confirm`, `select`
- [ ] Artifact type is one of: `markdown`, `json`, `mermaid`, `chartjs`, `html_css`, `javascript`, `typescript`
- [ ] Document is under 200KB
- [ ] Document is valid UTF-8
