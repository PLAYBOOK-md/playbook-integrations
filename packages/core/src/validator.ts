/**
 * PLAYBOOK.md Semantic Validator
 *
 * Performs additional semantic checks beyond what the parser does.
 * The parser handles syntax; the validator checks cross-references,
 * variable scoping, and other semantic constraints.
 */

import { parsePlaybook } from './parser';
import type {
  ParseResult,
  ParseError,
  ParseWarning,
  PlaybookDefinition,
  Step,
  Branch,
  ArtifactType,
} from './types';

export interface ValidationResult {
  valid: boolean;
  fatal_errors: ParseError[];
  warnings: ParseWarning[];
}

const VALID_ARTIFACT_TYPES: ArtifactType[] = [
  "markdown", "json", "mermaid", "chartjs", "html_css", "javascript", "typescript",
];

const RE_INTERPOLATION = /\{\{(\w+)(?::\w+(?::[^}]*)?)?}}/g;

/**
 * Collect all {{variable}} references from a string.
 */
function collectInterpolations(text: string): { name: string; offset: number }[] {
  const refs: { name: string; offset: number }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(RE_INTERPOLATION.source, 'g');
  while ((match = re.exec(text)) !== null) {
    refs.push({ name: match[1], offset: match.index });
  }
  return refs;
}

/**
 * Validate a parsed PlaybookDefinition for semantic correctness.
 */
function validateDefinition(def: PlaybookDefinition): ValidationResult {
  const fatal_errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];

  const inputNames = new Set(def.inputs.map(i => i.name));

  // Track which @output variables are available at each point in execution.
  // We walk steps in order; an @output from step N is available in step N+1 onward.
  const outputsBefore = new Map<number, Set<string>>(); // stepIndex -> outputs available before this step
  const allOutputs = new Set<string>();

  // First pass: collect outputs in execution order
  for (let i = 0; i < def.steps.length; i++) {
    outputsBefore.set(i, new Set(allOutputs));

    const step = def.steps[i];
    if (step.output_var) {
      allOutputs.add(step.output_var);
    }

    // Also collect outputs from branch sub-steps (they may or may not execute,
    // but the variables they declare become "potentially available" downstream)
    if (step.branches) {
      for (const branch of step.branches) {
        for (const subStep of branch.steps) {
          if (subStep.output_var) {
            allOutputs.add(subStep.output_var);
          }
        }
      }
    }
  }

  // Check 1: @output variable names must not shadow input names
  for (const step of def.steps) {
    if (step.output_var && inputNames.has(step.output_var)) {
      fatal_errors.push({
        line: step.line,
        message: `@output variable "${step.output_var}" in step ${step.number} shadows an input name`,
      });
    }

    if (step.branches) {
      for (const branch of step.branches) {
        for (const subStep of branch.steps) {
          if (subStep.output_var && inputNames.has(subStep.output_var)) {
            fatal_errors.push({
              line: subStep.line,
              message: `@output variable "${subStep.output_var}" in sub-step ${subStep.label} shadows an input name`,
            });
          }
        }
      }
    }
  }

  // Check 2: Verify {{variable}} interpolations reference declared inputs or prior @output vars
  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    const availableOutputs = outputsBefore.get(i)!;

    checkInterpolations(step.content, step, inputNames, availableOutputs, warnings);

    // Check branch sub-step content
    if (step.branches) {
      for (const branch of step.branches) {
        for (const subStep of branch.steps) {
          checkInterpolations(subStep.content, subStep, inputNames, availableOutputs, warnings);
        }
      }
    }

    // Check @tool arguments for interpolations
    if (step.tool_call?.arguments) {
      const refs = collectInterpolations(step.tool_call.arguments);
      for (const ref of refs) {
        if (!inputNames.has(ref.name) && !availableOutputs.has(ref.name)) {
          warnings.push({
            line: step.line,
            message: `Step ${step.number} @tool argument references undeclared variable "{{${ref.name}}}"`,
          });
        }
      }
    }
  }

  // Check 3: Verify branch conditions reference variables that exist at that point
  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i];
    const availableOutputs = outputsBefore.get(i)!;

    if (step.branches) {
      for (const branch of step.branches) {
        if (branch.condition) {
          const varName = branch.condition.variable;
          if (!inputNames.has(varName) && !availableOutputs.has(varName)) {
            warnings.push({
              line: step.line,
              message: `Branch condition in step ${step.number} references undeclared variable "${varName}"`,
            });
          }
        }
      }
    }
  }

  // Check 4: Verify artifact type is valid
  if (def.artifact_type && !VALID_ARTIFACT_TYPES.includes(def.artifact_type)) {
    // Check if it's a dynamic variable reference like {{output_format}}
    const dynamicMatch = def.artifact_type.match(/^\{\{(\w+)\}\}$/);
    if (dynamicMatch) {
      // W6: check that the referenced variable is declared
      const varName = dynamicMatch[1];
      if (!inputNames.has(varName) && !allOutputs.has(varName)) {
        warnings.push({
          message: `Artifact type references undeclared variable "{{${varName}}}"`,
        });
      }
    } else {
      warnings.push({
        message: `Unknown artifact type "${def.artifact_type}". Valid types: ${VALID_ARTIFACT_TYPES.join(', ')}`,
      });
    }
  }

  return {
    valid: fatal_errors.length === 0,
    fatal_errors,
    warnings,
  };
}

/**
 * Check {{variable}} interpolations in step content.
 */
function checkInterpolations(
  content: string,
  step: Step,
  inputNames: Set<string>,
  availableOutputs: Set<string>,
  warnings: ParseWarning[],
): void {
  const refs = collectInterpolations(content);
  for (const ref of refs) {
    if (!inputNames.has(ref.name) && !availableOutputs.has(ref.name)) {
      warnings.push({
        line: step.line,
        message: `Step ${step.label} references undeclared variable "{{${ref.name}}}"`,
      });
    }
  }
}

/**
 * Parse and validate a playbook markdown string.
 *
 * Runs the parser first, then performs additional semantic validation
 * on the resulting definition.
 */
export function validatePlaybook(markdown: string): ValidationResult {
  const parseResult: ParseResult = parsePlaybook(markdown);

  // If parsing failed, return parser errors as fatal errors
  if (!parseResult.definition) {
    return {
      valid: false,
      fatal_errors: parseResult.errors,
      warnings: parseResult.warnings,
    };
  }

  // Run semantic validation on the parsed definition
  const validationResult = validateDefinition(parseResult.definition);

  // Merge parser warnings with validation warnings
  return {
    valid: validationResult.fatal_errors.length === 0,
    fatal_errors: validationResult.fatal_errors,
    warnings: [...parseResult.warnings, ...validationResult.warnings],
  };
}
