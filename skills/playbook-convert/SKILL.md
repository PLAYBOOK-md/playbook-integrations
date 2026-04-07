---
name: playbook-convert
description: Convert between PLAYBOOK.md markdown, JSON, and plain English formats.
---

# Playbook Convert

Convert playbooks between PLAYBOOK.md markdown format, JSON representation, and plain English descriptions.

## When to use

- A user wants to convert a playbook to JSON for programmatic use
- A user provides a JSON object and wants it as a .playbook.md file
- A user describes a workflow in plain English and wants it formalized as a playbook
- You need to serialize/deserialize a playbook for storage or transmission

## Conversion directions

| From | To | Complexity |
|------|----|-----------|
| PLAYBOOK.md -> JSON | Parse then serialize | Straightforward |
| JSON -> PLAYBOOK.md | Reconstruct markdown from structure | Moderate |
| Plain English -> PLAYBOOK.md | Interpret intent, design steps | Creative |
| PLAYBOOK.md -> Plain English | Summarize structure and purpose | Straightforward |

## Step-by-step instructions

### PLAYBOOK.md to JSON

1. Parse the playbook following the PLAYBOOK.md spec
2. The parser produces a `PlaybookDefinition` object:

```json
{
  "title": "string",
  "description": "string (optional)",
  "system_prompt": "string (optional)",
  "inputs": [
    {
      "name": "string",
      "type": "string|text|number|boolean|enum",
      "required": true,
      "default": "string (optional)",
      "options": ["string (optional, for enum)"],
      "description": "string (optional)"
    }
  ],
  "steps": [
    {
      "number": 1,
      "label": "1",
      "title": "string",
      "content": "string (prompt text)",
      "output_var": "string (optional)",
      "extract_field": "string (optional)",
      "is_branching": false,
      "elicitation": {
        "type": "input|confirm|select",
        "prompt": "string",
        "options": ["string (optional)"]
      },
      "tool_call": {
        "connection_name": "string",
        "tool_name": "string",
        "arguments": "string (JSON, optional)"
      },
      "prompt_ref": {
        "prompt_id": "string"
      },
      "branches": [
        {
          "condition": {
            "variable": "string",
            "operator": "==|!=",
            "value": "string",
            "source": "input|step_output"
          },
          "steps": []
        }
      ]
    }
  ],
  "artifact_type": "string (optional)"
}
```

3. Serialize to JSON with `JSON.stringify(definition, null, 2)`

### JSON to PLAYBOOK.md

Reconstruct the markdown document from the JSON structure:

1. **Title**: `# {title}`
2. **Description**: Plain text on the next line (if present)
3. **System prompt**: `## SYSTEM\n\n{system_prompt}` (if present)
4. **Inputs**: `## INPUTS\n\n` then for each input:
   - String/text/number/boolean: `` - `{name}` ({type}): {description} `` or `` - `{name}` ({type}: {default}): {description} ``
   - Enum: `` - `{name}` (enum: {options.join(", ")}): {description} ``
5. **Steps**: For each step:
   - Heading: `## STEP {number}: {title}`
   - Content: the prompt text
   - Directives on their own lines:
     - `@output({output_var})` or `@output({output_var}, extract:"{extract_field}")`
     - `@elicit({type}, "{prompt}", "opt1", "opt2")` 
     - `@prompt(library:{prompt_id})`
     - `@tool({connection_name}, {tool_name}, {arguments})`
   - Branches:
     - `` ```if {variable} {operator} "{value}"``` ``
     - Sub-steps as `### STEP {label}: {title}`
     - `` ```endif``` ``
6. **Artifacts**: `## ARTIFACTS\n\ntype: {artifact_type}` (if present)

### Plain English to PLAYBOOK.md

1. **Identify the goal.** What is the user trying to accomplish?
2. **Extract inputs.** What data does the user need to provide? Determine types:
   - Free text -> `string` or `text` (multi-line)
   - Numbers -> `number`
   - Yes/No -> `boolean`
   - Fixed choices -> `enum`
3. **Break into steps.** Each distinct action or AI call becomes a step. Name them clearly.
4. **Determine dependencies.** If a later step needs to branch on an earlier result, add `@output` to capture it.
5. **Add branching.** If the user describes conditional logic ("if X then Y, otherwise Z"), add branch blocks.
6. **Choose artifact type.** Based on the expected output format.
7. **Write the system prompt.** If the workflow needs a consistent persona.
8. **Assemble the playbook** following all syntax rules.

### PLAYBOOK.md to Plain English

1. Start with the title and description
2. List what inputs the user needs to provide
3. Describe each step in natural language:
   - What the AI does
   - What it receives (inputs, prior context)
   - What it produces (output, named variable)
4. Describe any branching logic in if/then terms
5. Describe any human checkpoints (@elicit)
6. State the final output format

## Examples

### Plain English to PLAYBOOK.md

**User says:** "I want a workflow that takes a product idea, researches the market, then either writes a pitch deck if the market looks good or suggests pivots if not."

**Resulting playbook:**

```markdown
# Product Idea Evaluator

Evaluate a product idea and either create a pitch deck or suggest pivots.

## INPUTS

- `product_idea` (text): Description of the product idea
- `target_market` (string): Target market segment

## STEP 1: Market Research

Research the market for this product idea targeting {{target_market}}:

{{product_idea}}

Conclude with a clear assessment: "viable" or "needs_pivot".
Include a JSON object: {"assessment": "viable|needs_pivot"}

@output(market_assessment, extract:"assessment")

## STEP 2: Next Steps

```if market_assessment == "viable"```

### STEP 2a: Pitch Deck

Create a pitch deck outline for:
{{product_idea}}

Include: problem, solution, market size, business model, and ask.

```else```

### STEP 2b: Pivot Suggestions

The market assessment suggests pivots are needed.
Suggest 3 alternative directions for:
{{product_idea}}

For each pivot, explain the market opportunity.

```endif```

## ARTIFACTS

type: markdown
```

### PLAYBOOK.md to Plain English

Given the playbook above, the summary would be:

> **Product Idea Evaluator** takes a product idea and target market as inputs. First, it researches the market and assesses viability. If the market looks viable, it creates a pitch deck outline. If pivots are needed, it suggests 3 alternative directions. The output is a markdown document.

## Validation checklist

When converting:

- [ ] JSON output includes all fields from the parsed definition
- [ ] Reconstructed markdown follows all spec formatting rules
- [ ] Variable names match `[a-zA-Z][a-zA-Z0-9_]*` pattern
- [ ] Step numbers are sequential starting from 1
- [ ] Branch conditions use `==` or `!=` with double-quoted values
- [ ] Sub-step labels match parent step numbers
- [ ] All directive syntax is correct (@output, @elicit, @prompt, @tool)
- [ ] Artifact type is valid if present
- [ ] No duplicate input names
- [ ] Round-trip conversion (md -> JSON -> md) preserves all semantic content
