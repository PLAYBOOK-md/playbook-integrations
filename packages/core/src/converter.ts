/**
 * PLAYBOOK.md Converter
 *
 * Converts between PLAYBOOK.md markdown format and JSON.
 */

import { parsePlaybook } from './parser';
import type {
  PlaybookDefinition,
  InputDef,
  Step,
  Branch,
  Condition,
} from './types';

/**
 * Parse a playbook markdown string and return its JSON representation.
 *
 * Returns the JSON-serialized PlaybookDefinition from the parse result.
 * Throws if the playbook has fatal parse errors.
 */
export function playbookToJson(markdown: string): string {
  const result = parsePlaybook(markdown);

  if (!result.definition) {
    const messages = result.errors.map(e => e.message).join('; ');
    throw new Error(`Failed to parse playbook: ${messages}`);
  }

  return JSON.stringify(result.definition, null, 2);
}

/**
 * Convert a JSON PlaybookDefinition back into PLAYBOOK.md markdown format.
 *
 * Parses the JSON string into a PlaybookDefinition and reconstructs
 * valid PLAYBOOK.md markdown from it.
 */
export function jsonToPlaybook(json: string): string {
  let def: PlaybookDefinition;
  try {
    def = JSON.parse(json) as PlaybookDefinition;
  } catch {
    throw new Error('Invalid JSON input');
  }

  if (!def.title || typeof def.title !== 'string') {
    throw new Error('PlaybookDefinition must have a title');
  }
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error('PlaybookDefinition must have at least one step');
  }

  const lines: string[] = [];

  // Title
  lines.push(`# ${def.title}`);

  // Description
  if (def.description) {
    lines.push('');
    lines.push(def.description);
  }

  // System prompt
  if (def.system_prompt) {
    lines.push('');
    lines.push('## SYSTEM');
    lines.push('');
    lines.push(def.system_prompt);
  }

  // Inputs
  if (def.inputs && def.inputs.length > 0) {
    lines.push('');
    lines.push('## INPUTS');
    lines.push('');
    for (const input of def.inputs) {
      lines.push(renderInput(input));
    }
  }

  // Steps
  for (const step of def.steps) {
    lines.push('');
    lines.push(`## STEP ${step.number}: ${step.title}`);
    lines.push('');
    renderStepBody(step, lines);
  }

  // Artifacts
  if (def.artifact_type) {
    lines.push('');
    lines.push('## ARTIFACTS');
    lines.push('');
    lines.push(`type: ${def.artifact_type}`);
  }

  // Ensure trailing newline
  lines.push('');

  return lines.join('\n');
}

/**
 * Render a single input definition as a markdown list item.
 */
function renderInput(input: InputDef): string {
  let typeSpec: string;
  if (input.type === 'enum' && input.options && input.options.length > 0) {
    typeSpec = `enum: ${input.options.join(', ')}`;
  } else if (input.default !== undefined) {
    typeSpec = `${input.type}: ${input.default}`;
  } else {
    typeSpec = input.type;
  }

  const desc = input.description ? `: ${input.description}` : '';
  return `- \`${input.name}\` (${typeSpec})${desc}`;
}

/**
 * Render the body of a step (content, directives, branches) into the lines array.
 */
function renderStepBody(step: Step, lines: string[]): void {
  // Content
  if (step.content) {
    lines.push(step.content);
  }

  // Directives
  renderDirectives(step, lines);

  // Branches
  if (step.is_branching && step.branches && step.branches.length > 0) {
    renderBranches(step.branches, lines);
  }
}

/**
 * Render directive lines for a step or sub-step.
 */
function renderDirectives(step: Step, lines: string[]): void {
  if (step.prompt_ref) {
    lines.push('');
    lines.push(`@prompt(library:${step.prompt_ref.prompt_id})`);
  }

  if (step.elicitation) {
    const e = step.elicitation;
    let directive = `@elicit(${e.type}`;
    if (e.prompt) {
      directive += `, "${e.prompt}"`;
    }
    if (e.options && e.options.length > 0) {
      for (const opt of e.options) {
        directive += `, "${opt}"`;
      }
    }
    directive += ')';
    lines.push('');
    lines.push(directive);
  }

  if (step.tool_call) {
    const tc = step.tool_call;
    let directive = `@tool(${tc.connection_name}, ${tc.tool_name}`;
    if (tc.arguments) {
      directive += `, ${tc.arguments}`;
    }
    directive += ')';
    lines.push('');
    lines.push(directive);
  }

  if (step.output_var) {
    let directive = `@output(${step.output_var}`;
    if (step.extract_field) {
      directive += `, extract:"${step.extract_field}"`;
    }
    directive += ')';
    lines.push('');
    lines.push(directive);
  }
}

/**
 * Render branch blocks (if/elif/else/endif) with sub-steps.
 */
function renderBranches(branches: Branch[], lines: string[]): void {
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    lines.push('');

    if (i === 0) {
      // First branch is always an 'if'
      lines.push(renderConditionMarker('if', branch.condition));
    } else if (branch.condition === null) {
      // No condition = else
      lines.push('```else```');
    } else {
      // Subsequent conditions are 'elif'
      lines.push(renderConditionMarker('elif', branch.condition));
    }

    // Render sub-steps within the branch
    for (const subStep of branch.steps) {
      lines.push('');
      lines.push(`### STEP ${subStep.label}: ${subStep.title}`);
      lines.push('');
      if (subStep.content) {
        lines.push(subStep.content);
      }
      renderDirectives(subStep, lines);
    }
  }

  lines.push('');
  lines.push('```endif```');
}

/**
 * Render a condition marker line.
 */
function renderConditionMarker(keyword: 'if' | 'elif', condition: Condition | null): string {
  if (!condition) {
    return '```else```';
  }
  return `\`\`\`${keyword} ${condition.variable} ${condition.operator} "${condition.value}"\`\`\``;
}
