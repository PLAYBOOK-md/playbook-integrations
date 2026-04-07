/**
 * PLAYBOOK.md Converter
 *
 * Converts between PLAYBOOK.md markdown format and JSON.
 */

import { parsePlaybook } from './parser';

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
 * TODO: Implement JSON-to-markdown conversion.
 * This requires reconstructing the markdown document from a PlaybookDefinition,
 * including proper heading structure, input formatting, directives, and branch markers.
 */
export function jsonToPlaybook(_json: string): string {
  // TODO: Implement JSON-to-markdown conversion
  throw new Error('jsonToPlaybook is not yet implemented');
}
