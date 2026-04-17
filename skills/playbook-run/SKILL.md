---
name: playbook-run
description: Execute a PLAYBOOK.md workflow step by step, managing context accumulation, branching, and elicitation.
---

# Playbook Run

Execute a PLAYBOOK.md workflow step by step. This skill teaches you how to run a playbook as an AI agent, managing context accumulation, variable interpolation, branching, and human-in-the-loop interactions.

## When to use

- A user asks you to run or execute a playbook
- You need to follow a multi-step workflow defined in a .playbook.md file
- You are processing a playbook and need to decide what happens at each step

## Core execution model

A playbook is NOT a conversation. Each step is an independent AI call with accumulated context:

1. Each step receives the system prompt (if any) plus all prior step outputs
2. Variable interpolation resolves `{{name}}` placeholders before the AI call
3. Steps execute sequentially unless branching redirects execution
4. The final step's output is the playbook result

## Step-by-step execution procedure

### 1. Collect inputs

Before executing any steps, gather all required input values:

```
FOR each input in the INPUTS section:
  IF input has no default AND no value provided:
    -> ERROR: missing required input "name"
  IF input has a default AND no value provided:
    -> USE the default value
  IF value provided:
    -> USE the provided value
```

### 2. Initialize execution context

```
context = {
  system_prompt: (from ## SYSTEM section, if any),
  inputs: { name: value, ... },
  step_outputs: [],            // ordered list of all step outputs
  named_outputs: {},           // map of @output variable names to values
  current_step: 1
}
```

### 3. Execute each step

For each step in order:

#### 3a. Resolve variable interpolation

Replace all `{{variable}}` placeholders in the step content:

```
FOR each {{name}} in step content:
  IF name IN context.inputs:
    REPLACE with input value
  ELIF name IN context.named_outputs:
    REPLACE with named output value
  ELSE:
    LEAVE as literal "{{name}}" text
```

Also resolve variables in @tool JSON arguments.

#### 3b. Check for branching

If the step has branch markers (`if`/`elif`/`else`/`endif`):

```
FOR each branch condition (top to bottom):
  RESOLVE the condition variable from inputs or named_outputs
  IF condition matches (== or != with exact string comparison):
    EXECUTE only the sub-steps in this branch
    STOP checking further conditions
IF no condition matched AND else branch exists:
  EXECUTE the else branch sub-steps
IF no condition matched AND no else branch:
  SKIP the entire step (status: "skipped", no output)
```

#### 3c. Handle directives

Process directives in this order:

1. **@tool**: If present, invoke the external tool. Skip the AI call entirely. The tool result becomes the step output.

2. **@elicit**: If present and no response yet, pause execution:
   - `input`: Show a free-text input field with the prompt
   - `confirm`: Show Yes/No with the prompt
   - `select`: Show options with the prompt
   - Store the user's response as `__elicit_step_N`
   - If the step has ONLY @elicit (and optionally @output), the user's response IS the step output -- no AI call needed
   - If the step has prompt content too, make the AI call after getting the user's response

3. **@prompt**: If present, resolve the referenced prompt content and prepend it to the step's prompt text (separated by a blank line).

4. **@output**: After the step produces output, store it as a named variable:
   - Basic: `@output(varname)` -- store the full response
   - Typed: `@output(varname: type)` -- store with type annotation (string, text, number, boolean, json, enum). The type is metadata for UI rendering and runtime coercion; the response is always captured as a string.
   - Enum: `@output(varname: enum, "opt1", "opt2")` -- store with enumerated allowed values
   - Extract: `@output(varname, extract:"field")` -- scan the response (bottom-up) for a JSON object containing "field", extract that field's value. Fall back to full response if extraction fails.
   - Combined: `@output(varname: type, extract:"field")` -- typed with extraction

#### 3d. Make the AI call

Unless the step has @tool (which skips AI) or is elicit-only:

```
prompt = resolved step content (after variable interpolation)
IF @prompt resolved content:
  prompt = resolved_prompt + "\n\n" + prompt

CALL AI with:
  system: context.system_prompt
  context: all prior step outputs (accumulated)
  prompt: the resolved step content

step_output = AI response
```

#### 3e. Store results

```
context.step_outputs.append(step_output)
IF step has @output(varname):
  context.named_outputs[varname] = step_output (or extracted field)
```

### 4. Return the result

The output of the last executed step is the playbook result. If the playbook declares an artifact type, the result should be treated as that format.

## Context accumulation

This is the key design principle. Each step gets ALL prior outputs, not just the immediately previous one:

- Step 1 sees: system prompt + step 1 prompt
- Step 2 sees: system prompt + step 1 output + step 2 prompt
- Step 3 sees: system prompt + step 1 output + step 2 output + step 3 prompt

Authors do not need to manually reference prior results -- they are automatically available. Named outputs (`@output`) provide explicit variable access; all other step outputs flow through accumulated context.

## Branching logic

Branches evaluate conditions top-to-bottom. Only one branch executes per step.

The condition variable is resolved from:
1. Input values (declared in `## INPUTS`)
2. Named outputs (captured by `@output` in prior steps)

If the variable is not found, it evaluates as an empty string.

Operators:
- `==` : exact string match
- `!=` : not equal (exact string comparison)

There are no numeric operators, no pattern matching, and no logical combinators (AND/OR).

## Examples

### Running a linear playbook

Given:
```markdown
# Research Report

## INPUTS
- `topic` (string): Subject

## STEP 1: Research
Research {{topic}}.

## STEP 2: Write
Write a report based on the research.
```

With input `topic = "quantum computing"`:

1. Step 1: AI receives "Research quantum computing." -- produces research output
2. Step 2: AI receives Step 1 output + "Write a report based on the research." -- produces final report

### Running a branching playbook

Given a playbook where Step 1 classifies an issue and captures `@output(issue_type)`, and Step 2 branches on `issue_type`:

1. Step 1 executes, AI responds "bug", stored as `issue_type = "bug"`
2. Step 2 evaluates: `issue_type == "bug"` -- true, execute sub-step 2a
3. Sub-step 2a executes with full context from Step 1

### Handling elicitation

Given a step with `@elicit(confirm, "Proceed?")`:

1. Execution pauses at this step
2. Present "Proceed?" with Yes/No options to the user
3. User responds "yes"
4. If step has other content, make the AI call with the user's response in context
5. If step is elicit-only, the user's response ("yes") is the step output

## Validation checklist

When running a playbook:

- [ ] All required inputs have values before execution starts
- [ ] Variable interpolation resolves before each AI call
- [ ] System prompt is included in every step's context
- [ ] Prior step outputs accumulate in order
- [ ] Branch conditions evaluate with exact string comparison
- [ ] Only one branch executes per step
- [ ] @tool steps skip the AI call entirely
- [ ] @elicit steps pause until user responds
- [ ] @output captures happen after the step produces output
- [ ] Skipped steps (no matching branch) produce no output

## Autonomous / unattended execution

Some execution targets (Claude Code Routines, batch runners, cron-driven schedulers) run a playbook without a human available to answer `@elicit` directives or confirm breakpoints. When executing in unattended mode, follow these rules:

### Default elicit responses

If the caller has not supplied an override value for an `@elicit` directive, use:

| Type | Default response |
|------|------------------|
| `confirm` | `"yes"` |
| `select` | the first option |
| `input` | the empty string (`""`) |

Record the default in `__elicit_step_N` exactly as if the human had supplied it. Downstream steps see the same value they would see in an interactive run.

### Overrides via caller payload

When a caller wants explicit answers (e.g. the Claude Code Routines `/fire` endpoint includes them in the `text` body), look for a structured `elicit` block alongside the input values:

```yaml
inputs:
  topic: "AI safety"
elicit:
  3: "yes"          # step number -> response
  4: "Performance"
```

Use these overrides in preference to the defaults above. If the payload is freeform prose (not structured), still default per the table; do not guess at intent.

### `@output(extract:"field")` fidelity caveat

In unattended pure-LLM execution (no runtime JSON parser in the loop), `@output(var, extract:"field")` depends on the model emitting well-formed JSON. Occasionally it will not. Mitigations:

- In the step's prompt content, explicitly instruct the model to include a JSON object containing the target field.
- If extraction fails, fall back to the full response (same behavior as the spec).
- For high-stakes branching on extracted values, prefer an `enum`-typed `@output` with explicit options so the response is self-constrained.

### Breakpoints

Autonomous runs ignore caller-supplied breakpoints. Log a warning (do not fail) if a breakpoint is specified.
