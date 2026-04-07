/**
 * PLAYBOOK.md MCP Server
 *
 * Provides PLAYBOOK.md operations as MCP tools, resources, and prompts
 * for AI agents via the Model Context Protocol.
 *
 * The server does NOT call any external LLM -- it provides tools
 * for the host agent to use with its own LLM.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  parsePlaybook,
  validatePlaybook,
  summarizePlaybook,
  playbookToJson,
  jsonToPlaybook,
} from '@playbook-md/core';

// ---------------------------------------------------------------------------
// Spec reference content (condensed, actionable versions)
// ---------------------------------------------------------------------------

const SPEC_FORMAT = `# PLAYBOOK.md Document Format

A playbook is a UTF-8 markdown document defining a multi-step AI workflow.

## Required Structure
\`\`\`
# Title                          REQUIRED - First # heading
Description text                 OPTIONAL - Between title and first ##
## SYSTEM                        OPTIONAL - System prompt for all steps
## INPUTS                        OPTIONAL - Input variable declarations
## STEP 1: Title                 REQUIRED - At least one step
## STEP 2: Title                          - Sequential numbering from 1
## ARTIFACTS                     OPTIONAL - Expected output format
\`\`\`

## Rules
- Title: single \`#\` heading, must appear before any \`##\` section. Fatal error if missing.
- Description: plain text between title and first \`##\`. Metadata only (not sent to AI).
- System prompt: \`## SYSTEM\` or \`## SYSTEM PROMPT\` (case-insensitive). Applied to every step.
- Steps: at least one required. Sequential integers from 1. Non-sequential = warning.
- Unrecognized \`##\` headings are silently skipped.
- Max document size: 200 KB (UTF-8).
- Encoding: UTF-8.`;

const SPEC_INPUTS = `# PLAYBOOK.md Input Variables

Inputs declare variables a playbook accepts. Appear in the \`## INPUTS\` section.

## Syntax
\`\`\`
- \\\`name\\\` (type): Description
- \\\`name\\\` (type: default_value): Description
- \\\`name\\\` (enum: option1, option2): Description
\`\`\`

## Variable Names
Pattern: \`[a-zA-Z][a-zA-Z0-9_]*\` - must start with a letter, may contain letters/digits/underscores.

## Types
| Type     | Aliases              | Description           |
|----------|----------------------|-----------------------|
| string   | (any unrecognized)   | Single-line text      |
| text     | -                    | Multi-line textarea   |
| number   | num, int, float      | Numeric input         |
| boolean  | bool                 | Toggle / checkbox     |
| enum     | select, choice       | Dropdown with options |

## Defaults
- \`(type: default_value)\` makes input optional.
- Inputs without defaults are required.
- Enum options: \`(enum: opt1, opt2, opt3)\` - comma-separated, no separate default.

## Validation
- Duplicate input name = fatal error.
- Malformed list item = warning.
- Non-list lines = silently skipped.`;

const SPEC_STEPS = `# PLAYBOOK.md Steps

Steps are the core building blocks. Each is one AI call with accumulated context.

## Heading Format
\`\`\`
## STEP N: Title
\`\`\`
Regex: \`^##\\s+STEP\\s+(\\d+):\\s+(.+)$\`

## Rules
- Sequential integers starting from 1. Non-sequential = warning.
- At least one step required (fatal error otherwise).
- Content: everything between heading and next \`##\`, trimmed.
- Directive lines (@output, @elicit, @prompt, @tool) are extracted from content.

## Variable Interpolation
\`\`\`
{{name}}               Simple reference
{{name:type}}          With type hint
{{name:type:default}}  With inline default
\`\`\`
Resolved against inputs and prior @output captures.

## Context Accumulation
Each step receives all prior step outputs automatically. Steps are fresh AI calls, not conversation turns.

## Labels
- Top-level: step number as string ("1", "2")
- Branch sub-steps: number + letter ("2a", "2b")`;

const SPEC_DIRECTIVES = `# PLAYBOOK.md Directives

Directives are annotation lines within steps that control execution. Each on its own line.

## @output - Capture Step Output
\`\`\`
@output(varname)
@output(varname, extract:"field")
\`\`\`
Stores AI response as a named variable. One per step (last wins).
extract: extracts a JSON field from the response.

## @elicit - Human-in-the-Loop Input
\`\`\`
@elicit(input, "prompt text")
@elicit(confirm, "question?")
@elicit(select, "prompt", "option1", "option2")
\`\`\`
Types: input (free-text), confirm (yes/no), select (dropdown).
All arguments must be double-quoted strings.
Pauses execution until user responds.

## @prompt - External Prompt Reference
\`\`\`
@prompt(library:identifier)
@prompt(file:path)
@prompt(mcp:server/prompt)
@prompt({{variable}})
\`\`\`
Prepends referenced content to the step's prompt. One per step (last wins).

## @tool - External Tool Invocation
\`\`\`
@tool(connection, tool_name)
@tool(connection, tool_name, {"key": "value"})
\`\`\`
Invokes an external tool. AI call is SKIPPED. Tool result = step output.

## Processing Order
1. @tool (if present, skip AI)
2. @elicit (pause if present)
3. @prompt (prepend content)
4. @output (capture result)`;

const SPEC_BRANCHING = `# PLAYBOOK.md Branching

Conditional execution paths within a step using fenced markers.

## Syntax
\`\`\`
\\\`\\\`\\\`if variable == "value"\\\`\\\`\\\`
\\\`\\\`\\\`elif variable != "other"\\\`\\\`\\\`
\\\`\\\`\\\`else\\\`\\\`\\\`
\\\`\\\`\\\`endif\\\`\\\`\\\`
\`\`\`

## Operators
Only \`==\` (equals) and \`!=\` (not equals). Exact string comparison.
Values must be double-quoted.

## Condition Variables
Can reference: declared inputs or @output captures from prior steps.

## Sub-steps
Inside branches, use \`###\` headings: \`### STEP 2a: Title\`
Label = parent number + lowercase letter.
Sub-steps support all directives.

## Evaluation Rules
1. Top-to-bottom (if, then each elif)
2. First match executes
3. else = fallback if no match
4. No match + no else = step skipped
5. Only one branch per step

## Nesting
Branches do NOT nest. Use sequential steps for multi-level decisions.`;

const SPEC_ARTIFACTS = `# PLAYBOOK.md Artifacts

Declares the expected output format. Appears in \`## ARTIFACTS\` section.

## Syntax
\`\`\`
## ARTIFACTS

type: markdown
\`\`\`

## Valid Types
| Type       | Description                    |
|------------|--------------------------------|
| markdown   | Formatted text                 |
| json       | Structured JSON data           |
| mermaid    | Mermaid diagram syntax         |
| chartjs    | Chart.js configuration object  |
| html_css   | HTML with CSS                  |
| javascript | JavaScript code                |
| typescript | TypeScript code                |

Unrecognized types produce a warning.

## Behavior
Metadata only - does not change execution. Informs rendering, download format, and validation.
If absent, treat output as untyped text/markdown.`;

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Create and configure the MCP server with tools, resources, and prompts.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: '@playbook-md/mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // =========================================================================
  // TOOLS
  // =========================================================================

  // 1. playbook_read
  server.tool(
    'playbook_read',
    'Parse a PLAYBOOK.md document and return its structure as JSON. Use mode "structured" for the full PlaybookDefinition or "summary" for a compact overview.',
    {
      content: z.string().describe('The PLAYBOOK.md markdown content to parse'),
      mode: z.enum(['structured', 'summary']).optional().default('structured').describe('Output mode: "structured" for full definition, "summary" for compact overview'),
    },
    async ({ content, mode }) => {
      try {
        const result = parsePlaybook(content);

        if (!result.definition) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Parse failed',
                errors: result.errors,
                warnings: result.warnings,
              }, null, 2),
            }],
            isError: true,
          };
        }

        if (mode === 'summary') {
          const summary = summarizePlaybook(result.definition);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              definition: result.definition,
              warnings: result.warnings,
            }, null, 2),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error parsing playbook: ${e instanceof Error ? e.message : String(e)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // 2. playbook_validate
  server.tool(
    'playbook_validate',
    'Validate a PLAYBOOK.md document for spec compliance. Returns fatal errors and warnings.',
    {
      content: z.string().describe('The PLAYBOOK.md markdown content to validate'),
    },
    async ({ content }) => {
      try {
        const result = validatePlaybook(content);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error validating playbook: ${e instanceof Error ? e.message : String(e)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // 3. playbook_write
  server.tool(
    'playbook_write',
    'Generate a detailed prompt and spec context for creating a valid PLAYBOOK.md document. Does NOT call an LLM -- returns a prompt the host agent can use.',
    {
      description: z.string().describe('Description of the playbook to create'),
      constraints: z.object({
        steps: z.number().optional().describe('Target number of steps'),
        branching: z.boolean().optional().describe('Whether to include branching'),
        inputs: z.array(z.string()).optional().describe('Input variable names to include'),
        artifact_type: z.string().optional().describe('Artifact type (markdown, json, mermaid, etc.)'),
      }).optional().describe('Optional constraints for the playbook'),
    },
    async ({ description, constraints }) => {
      const constraintNotes: string[] = [];
      if (constraints?.steps) {
        constraintNotes.push(`- Target exactly ${constraints.steps} steps`);
      }
      if (constraints?.branching) {
        constraintNotes.push('- Include at least one branching step with conditional paths');
      }
      if (constraints?.inputs && constraints.inputs.length > 0) {
        constraintNotes.push(`- Include these input variables: ${constraints.inputs.map(n => `\`${n}\``).join(', ')}`);
      }
      if (constraints?.artifact_type) {
        constraintNotes.push(`- Set artifact type to: ${constraints.artifact_type}`);
      }

      const constraintSection = constraintNotes.length > 0
        ? `\n## Constraints\n${constraintNotes.join('\n')}\n`
        : '';

      const prompt = `# Task: Create a PLAYBOOK.md Document

## Goal
Create a valid PLAYBOOK.md document for the following purpose:

${description}
${constraintSection}
## PLAYBOOK.md Format Rules

### Document Structure
\`\`\`markdown
# Title                          REQUIRED
Description text                 OPTIONAL
## SYSTEM                        OPTIONAL
## INPUTS                        OPTIONAL
## STEP 1: Title                 REQUIRED (at least one)
## STEP N: Title                 Sequential numbering
## ARTIFACTS                     OPTIONAL
\`\`\`

### Input Syntax
\`\`\`markdown
- \`name\` (type): Description
- \`name\` (type: default): Description
- \`name\` (enum: opt1, opt2): Description
\`\`\`
Types: string, text, number, boolean, enum

### Step Format
\`\`\`markdown
## STEP N: Title

Step content with {{variable}} interpolation.
\`\`\`

### Directive Syntax (each on its own line within a step)
\`\`\`
@output(varname)                           Capture step output
@output(varname, extract:"field")          Extract JSON field
@elicit(input, "prompt")                   Free-text input
@elicit(confirm, "question?")              Yes/no confirmation
@elicit(select, "prompt", "opt1", "opt2")  Selection
@prompt(library:identifier)                External prompt
@tool(connection, tool_name, {"args": 1})  Tool invocation (skips AI)
\`\`\`

### Branching Syntax
\`\`\`markdown
\`\`\`if variable == "value"\`\`\`

### STEP Na: Branch Title

Branch content.

\`\`\`else\`\`\`

### STEP Nb: Other Title

Other content.

\`\`\`endif\`\`\`
\`\`\`
Only == and != operators. Values must be double-quoted.

### Artifact Types
markdown, json, mermaid, chartjs, html_css, javascript, typescript

## Output
Return ONLY the complete PLAYBOOK.md document. No explanation or commentary.`;

      return {
        content: [{
          type: 'text' as const,
          text: prompt,
        }],
      };
    },
  );

  // 4. playbook_convert
  server.tool(
    'playbook_convert',
    'Convert between PLAYBOOK.md markdown format and JSON (PlaybookDefinition).',
    {
      content: z.string().describe('The content to convert'),
      from: z.enum(['playbook', 'json']).describe('Source format'),
      to: z.enum(['playbook', 'json']).describe('Target format'),
    },
    async ({ content, from, to }) => {
      try {
        if (from === to) {
          return {
            content: [{
              type: 'text' as const,
              text: content,
            }],
          };
        }

        let result: string;
        if (from === 'playbook' && to === 'json') {
          result = playbookToJson(content);
        } else {
          result = jsonToPlaybook(content);
        }

        return {
          content: [{
            type: 'text' as const,
            text: result,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text' as const,
            text: `Conversion error: ${e instanceof Error ? e.message : String(e)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // 5. playbook_run (NOT IMPLEMENTED)
  server.tool(
    'playbook_run',
    'Execute a playbook step-by-step. NOTE: Not yet implemented.',
    {
      content: z.string().describe('The PLAYBOOK.md content to execute'),
      inputs: z.record(z.string(), z.string()).optional().describe('Input values for the playbook'),
    },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: [
            'Playbook execution is not yet available in this MCP server.',
            '',
            'To execute a playbook manually:',
            '1. Use the `playbook_read` tool to parse the playbook into a structured definition.',
            '2. Read the `inputs` array to determine what values are needed.',
            '3. Execute each step sequentially, using the step `content` as a prompt.',
            '4. Pass the system_prompt as the system message for each step.',
            '5. For steps with @output, capture the result for use in later steps.',
            '6. For branching steps, evaluate the condition and execute the matching branch.',
            '7. For @tool steps, invoke the tool directly instead of making an AI call.',
            '8. For @elicit steps, ask the user for input before proceeding.',
          ].join('\n'),
        }],
        isError: true,
      };
    },
  );

  // =========================================================================
  // RESOURCES
  // =========================================================================

  server.resource(
    'PLAYBOOK.md Format Spec',
    'playbook://spec/format',
    { description: 'Document structure rules for PLAYBOOK.md', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/format', text: SPEC_FORMAT, mimeType: 'text/markdown' }],
    }),
  );

  server.resource(
    'PLAYBOOK.md Inputs Spec',
    'playbook://spec/inputs',
    { description: 'Input variable syntax for PLAYBOOK.md', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/inputs', text: SPEC_INPUTS, mimeType: 'text/markdown' }],
    }),
  );

  server.resource(
    'PLAYBOOK.md Steps Spec',
    'playbook://spec/steps',
    { description: 'Step format for PLAYBOOK.md', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/steps', text: SPEC_STEPS, mimeType: 'text/markdown' }],
    }),
  );

  server.resource(
    'PLAYBOOK.md Directives Spec',
    'playbook://spec/directives',
    { description: '@output, @elicit, @prompt, @tool directives', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/directives', text: SPEC_DIRECTIVES, mimeType: 'text/markdown' }],
    }),
  );

  server.resource(
    'PLAYBOOK.md Branching Spec',
    'playbook://spec/branching',
    { description: 'Branching syntax for PLAYBOOK.md', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/branching', text: SPEC_BRANCHING, mimeType: 'text/markdown' }],
    }),
  );

  server.resource(
    'PLAYBOOK.md Artifacts Spec',
    'playbook://spec/artifacts',
    { description: 'Artifact types for PLAYBOOK.md', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'playbook://spec/artifacts', text: SPEC_ARTIFACTS, mimeType: 'text/markdown' }],
    }),
  );

  // =========================================================================
  // PROMPTS
  // =========================================================================

  // 1. create_playbook
  server.prompt(
    'create_playbook',
    'Generate system and user messages that guide an LLM to write a valid PLAYBOOK.md document.',
    {
      description: z.string().describe('Description of the playbook to create'),
    },
    ({ description }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are an expert at writing PLAYBOOK.md documents -- structured multi-step AI workflows in markdown format.

Write a complete, valid PLAYBOOK.md document for the following purpose:

${description}

Follow this format exactly:

1. Start with a \`# Title\` heading
2. Add a brief description paragraph
3. Add \`## SYSTEM\` with a persona/behavior prompt
4. Add \`## INPUTS\` with variable declarations using: \`- \\\`name\\\` (type): Description\`
   Types: string, text, number, boolean, enum (with \`enum: opt1, opt2\`)
5. Add sequential \`## STEP N: Title\` sections with prompt content
   - Use \`{{variable}}\` for interpolation
   - Add \`@output(name)\` to capture step results
   - Use branching if needed: \`\\\`\\\`\\\`if var == "value"\\\`\\\`\\\`\` / \`\\\`\\\`\\\`endif\\\`\\\`\\\`\`
6. Add \`## ARTIFACTS\` with \`type: markdown|json|mermaid|chartjs|html_css|javascript|typescript\`

Return ONLY the playbook markdown. No explanation.`,
          },
        },
      ],
    }),
  );

  // 2. review_playbook
  server.prompt(
    'review_playbook',
    'Generate a prompt that reviews a PLAYBOOK.md document for best practices and spec compliance.',
    {
      content: z.string().describe('The PLAYBOOK.md content to review'),
    },
    ({ content }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Review the following PLAYBOOK.md document for best practices and spec compliance.

Check for:
1. **Structure**: Title present, description helpful, system prompt effective
2. **Inputs**: Correct syntax, appropriate types, good descriptions, defaults where useful
3. **Steps**: Sequential numbering, clear prompts, good use of {{variables}}, logical flow
4. **Directives**: Correct @output/@elicit/@prompt/@tool syntax, variables captured where needed
5. **Branching**: Valid if/elif/else/endif structure, conditions reference declared variables
6. **Artifacts**: Type matches the expected output
7. **Best practices**: Steps are focused (one task each), context accumulates naturally, system prompt provides consistent behavior

For each issue found, indicate:
- Severity: ERROR (will fail parsing) or WARNING (works but suboptimal)
- Location: Which section/step
- Problem: What's wrong
- Fix: How to correct it

End with an overall assessment and a list of suggested improvements.

---

\`\`\`markdown
${content}
\`\`\``,
          },
        },
      ],
    }),
  );

  // 3. explain_playbook
  server.prompt(
    'explain_playbook',
    'Generate a prompt that produces a human-readable explanation of a PLAYBOOK.md document.',
    {
      content: z.string().describe('The PLAYBOOK.md content to explain'),
    },
    ({ content }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Explain the following PLAYBOOK.md document in plain language for someone who has never seen the format before.

Cover:
1. **Purpose**: What this playbook does (title + description)
2. **Configuration**: What the system prompt establishes
3. **Required inputs**: What the user needs to provide, with types and defaults
4. **Step-by-step flow**: What happens at each step, in order
5. **Decision points**: Any branching logic and what triggers each path
6. **Human interaction**: Any @elicit points where the user is asked for input
7. **External tools**: Any @tool calls and what they do
8. **Output**: What the final result looks like (artifact type)

Use clear, non-technical language. Describe the workflow as a sequence of actions.

---

\`\`\`markdown
${content}
\`\`\``,
          },
        },
      ],
    }),
  );

  return server;
}
