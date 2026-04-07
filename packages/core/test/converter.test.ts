import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlaybook } from '../src/parser';
import { playbookToJson, jsonToPlaybook } from '../src/converter';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readFixture(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf-8');
}

describe('jsonToPlaybook', () => {
  it('round-trips a valid playbook through JSON and back', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');

    // Parse -> JSON -> Markdown -> Parse
    const json = playbookToJson(markdown);
    const reconstructed = jsonToPlaybook(json);
    const reparsed = parsePlaybook(reconstructed);

    expect(reparsed.errors).toHaveLength(0);
    expect(reparsed.definition).not.toBeNull();

    const original = parsePlaybook(markdown).definition!;
    const result = reparsed.definition!;

    // Title and description
    expect(result.title).toBe(original.title);
    expect(result.description).toBe(original.description);

    // System prompt
    expect(result.system_prompt).toBe(original.system_prompt);

    // Inputs
    expect(result.inputs).toHaveLength(original.inputs.length);
    for (let i = 0; i < original.inputs.length; i++) {
      expect(result.inputs[i].name).toBe(original.inputs[i].name);
      expect(result.inputs[i].type).toBe(original.inputs[i].type);
      expect(result.inputs[i].description).toBe(original.inputs[i].description);
      expect(result.inputs[i].default).toBe(original.inputs[i].default);
      expect(result.inputs[i].options).toEqual(original.inputs[i].options);
    }

    // Steps
    expect(result.steps).toHaveLength(original.steps.length);
    for (let i = 0; i < original.steps.length; i++) {
      expect(result.steps[i].number).toBe(original.steps[i].number);
      expect(result.steps[i].title).toBe(original.steps[i].title);
      expect(result.steps[i].content).toBe(original.steps[i].content);
      expect(result.steps[i].is_branching).toBe(original.steps[i].is_branching);
    }

    // Artifact type
    expect(result.artifact_type).toBe(original.artifact_type);
  });

  it('round-trips a minimal playbook', () => {
    const markdown = '# Minimal\n\n## STEP 1: Do Something\n\nDo the thing.\n';

    const json = playbookToJson(markdown);
    const reconstructed = jsonToPlaybook(json);
    const reparsed = parsePlaybook(reconstructed);

    expect(reparsed.errors).toHaveLength(0);
    expect(reparsed.definition).not.toBeNull();
    expect(reparsed.definition!.title).toBe('Minimal');
    expect(reparsed.definition!.steps).toHaveLength(1);
    expect(reparsed.definition!.steps[0].content).toBe('Do the thing.');
  });

  it('round-trips a playbook with branching', () => {
    const markdown = [
      '# Branch Test',
      '',
      '## INPUTS',
      '',
      '- `mode` (enum: security, performance): Review focus',
      '',
      '## STEP 1: Route',
      '',
      'Evaluate the code.',
      '',
      '```if mode == "security"```',
      '',
      '### STEP 1a: Security Audit',
      '',
      'Audit for OWASP Top 10.',
      '',
      '```else```',
      '',
      '### STEP 1b: Performance Review',
      '',
      'Profile for bottlenecks.',
      '',
      '```endif```',
      '',
    ].join('\n');

    const json = playbookToJson(markdown);
    const reconstructed = jsonToPlaybook(json);
    const reparsed = parsePlaybook(reconstructed);

    expect(reparsed.errors).toHaveLength(0);
    expect(reparsed.definition).not.toBeNull();

    const step = reparsed.definition!.steps[0];
    expect(step.is_branching).toBe(true);
    expect(step.branches).toHaveLength(2);
    expect(step.branches![0].condition).not.toBeNull();
    expect(step.branches![0].condition!.variable).toBe('mode');
    expect(step.branches![0].condition!.operator).toBe('==');
    expect(step.branches![0].condition!.value).toBe('security');
    expect(step.branches![0].steps[0].title).toBe('Security Audit');
    expect(step.branches![1].condition).toBeNull();
    expect(step.branches![1].steps[0].title).toBe('Performance Review');
  });

  it('round-trips directives (output, elicit, tool, prompt)', () => {
    const markdown = [
      '# Directive Test',
      '',
      '## STEP 1: Classify',
      '',
      'Classify the issue.',
      '',
      '@output(issue_type, extract:"classification")',
      '',
      '## STEP 2: Ask User',
      '',
      '@elicit(select, "Which approach?", "Conservative", "Aggressive")',
      '',
      '## STEP 3: Fetch Data',
      '',
      '@tool(analytics, get_metrics, {"period": "week"})',
      '@output(metrics)',
      '',
    ].join('\n');

    const json = playbookToJson(markdown);
    const reconstructed = jsonToPlaybook(json);
    const reparsed = parsePlaybook(reconstructed);

    expect(reparsed.errors).toHaveLength(0);
    const def = reparsed.definition!;

    // Step 1: @output with extract
    expect(def.steps[0].output_var).toBe('issue_type');
    expect(def.steps[0].extract_field).toBe('classification');

    // Step 2: @elicit
    expect(def.steps[1].elicitation).toBeDefined();
    expect(def.steps[1].elicitation!.type).toBe('select');
    expect(def.steps[1].elicitation!.prompt).toBe('Which approach?');
    expect(def.steps[1].elicitation!.options).toEqual(['Conservative', 'Aggressive']);

    // Step 3: @tool + @output
    expect(def.steps[2].tool_call).toBeDefined();
    expect(def.steps[2].tool_call!.connection_name).toBe('analytics');
    expect(def.steps[2].tool_call!.tool_name).toBe('get_metrics');
    expect(def.steps[2].output_var).toBe('metrics');
  });

  it('throws on invalid JSON', () => {
    expect(() => jsonToPlaybook('not json')).toThrow('Invalid JSON');
  });

  it('throws on missing title', () => {
    expect(() => jsonToPlaybook(JSON.stringify({ steps: [{ number: 1, label: '1', title: 'X', content: 'Y', is_branching: false }] }))).toThrow('title');
  });

  it('throws on missing steps', () => {
    expect(() => jsonToPlaybook(JSON.stringify({ title: 'T', steps: [] }))).toThrow('step');
  });
});
