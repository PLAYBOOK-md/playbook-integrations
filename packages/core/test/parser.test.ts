import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlaybook } from '../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readFixture(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf-8');
}

describe('parsePlaybook', () => {
  it('parses a valid playbook and extracts title and steps', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.errors).toHaveLength(0);
    expect(result.definition).not.toBeNull();
    expect(result.definition!.title).toBe('Content Pipeline');
    expect(result.definition!.steps).toHaveLength(4);
    expect(result.definition!.steps[0].title).toBe('Research');
    expect(result.definition!.steps[1].title).toBe('Outline');
    expect(result.definition!.steps[2].title).toBe('Draft');
    expect(result.definition!.steps[3].title).toBe('Polish');
  });

  it('extracts inputs correctly', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.definition!.inputs).toHaveLength(3);
    expect(result.definition!.inputs[0].name).toBe('topic');
    expect(result.definition!.inputs[0].type).toBe('string');
    expect(result.definition!.inputs[0].required).toBe(true);

    expect(result.definition!.inputs[1].name).toBe('audience');
    expect(result.definition!.inputs[1].type).toBe('enum');
    expect(result.definition!.inputs[1].options).toEqual(['technical', 'general', 'executive']);

    expect(result.definition!.inputs[2].name).toBe('word_count');
    expect(result.definition!.inputs[2].type).toBe('number');
    expect(result.definition!.inputs[2].default).toBe('1500');
  });

  it('extracts system prompt', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.definition!.system_prompt).toContain('professional content writer');
  });

  it('extracts artifact type', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.definition!.artifact_type).toBe('markdown');
  });

  it('returns an error for empty input', () => {
    const result = parsePlaybook('');

    expect(result.definition).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('empty');
  });

  it('returns an error for whitespace-only input', () => {
    const result = parsePlaybook('   \n\n  \n  ');

    expect(result.definition).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('empty');
  });

  it('returns an error for a playbook with no title', () => {
    const markdown = readFixture('fixtures/invalid/no-title.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.definition).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('title');
  });

  it('returns an error for a playbook with no steps', () => {
    const markdown = '# My Playbook\n\nSome description.\n\n## INPUTS\n\n- `topic` (string): A topic\n';
    const result = parsePlaybook(markdown);

    expect(result.definition).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('steps');
  });

  it('parses a minimal valid playbook', () => {
    const markdown = '# Minimal\n\n## STEP 1: Do Something\n\nDo the thing.\n';
    const result = parsePlaybook(markdown);

    expect(result.errors).toHaveLength(0);
    expect(result.definition).not.toBeNull();
    expect(result.definition!.title).toBe('Minimal');
    expect(result.definition!.steps).toHaveLength(1);
    expect(result.definition!.steps[0].content).toBe('Do the thing.');
  });

  it('extracts description text', () => {
    const markdown = readFixture('fixtures/valid/content-pipeline.playbook.md');
    const result = parsePlaybook(markdown);

    expect(result.definition!.description).toBe(
      'Generate a polished article from a topic and target audience.'
    );
  });
});
