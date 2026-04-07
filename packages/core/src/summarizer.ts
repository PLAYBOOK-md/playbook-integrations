/**
 * PLAYBOOK.md Summarizer
 *
 * Produces a compact summary of a PlaybookDefinition,
 * useful for indexing, display, and quick inspection.
 */

import type { PlaybookDefinition, Step, Branch } from './types';

export interface PlaybookSummary {
  title: string;
  description?: string;
  input_count: number;
  step_count: number;
  step_titles: string[];
  artifact_type?: string;
  has_branching: boolean;
  has_elicitation: boolean;
  has_tool_calls: boolean;
  directives_used: string[];
}

/**
 * Collect the set of directive names used across all steps and sub-steps.
 */
function collectDirectives(steps: Step[]): Set<string> {
  const directives = new Set<string>();

  function scanStep(step: Step): void {
    if (step.output_var) directives.add('@output');
    if (step.elicitation) directives.add('@elicit');
    if (step.prompt_ref) directives.add('@prompt');
    if (step.tool_call) directives.add('@tool');

    if (step.branches) {
      for (const branch of step.branches) {
        for (const subStep of branch.steps) {
          scanStep(subStep);
        }
      }
    }
  }

  for (const step of steps) {
    scanStep(step);
  }

  return directives;
}

/**
 * Check if any step or sub-step has a particular feature.
 */
function hasFeature(steps: Step[], predicate: (step: Step) => boolean): boolean {
  for (const step of steps) {
    if (predicate(step)) return true;
    if (step.branches) {
      for (const branch of step.branches) {
        for (const subStep of branch.steps) {
          if (predicate(subStep)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Summarize a PlaybookDefinition into a compact summary object.
 */
export function summarizePlaybook(def: PlaybookDefinition): PlaybookSummary {
  const directives = collectDirectives(def.steps);

  return {
    title: def.title,
    ...(def.description ? { description: def.description } : {}),
    input_count: def.inputs.length,
    step_count: def.steps.length,
    step_titles: def.steps.map(s => s.title),
    ...(def.artifact_type ? { artifact_type: def.artifact_type } : {}),
    has_branching: hasFeature(def.steps, s => s.is_branching),
    has_elicitation: hasFeature(def.steps, s => !!s.elicitation),
    has_tool_calls: hasFeature(def.steps, s => !!s.tool_call),
    directives_used: Array.from(directives).sort(),
  };
}
