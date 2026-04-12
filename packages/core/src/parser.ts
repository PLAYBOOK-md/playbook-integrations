/**
 * PLAYBOOK.md Parser
 *
 * Line-by-line, regex-based parser. No remark/unified dependency.
 * Follows the PLAYBOOK.md spec v0.1.0.
 */

import type {
  ParseResult,
  ParseWarning,
  ParseError,
  PlaybookDefinition,
  InputDef,
  Step,
  Branch,
  Condition,
  ElicitationDef,
  StepToolCall,
  PromptReference,
  ArtifactType,
  VariableType,
} from './types';

// ---------------------------------------------------------------------------
// Regex patterns from the spec
// ---------------------------------------------------------------------------

const RE_TITLE = /^#\s+(.+)$/;
const RE_SECTION = /^##\s+(.+)$/;
const RE_STEP = /^##\s+STEP\s+(\d+):\s+(.+)$/;
const RE_SUBSTEP = /^###\s+STEP\s+(\d+[a-z]):\s+(.+)$/;
const RE_SYSTEM = /^SYSTEM(?:\s+PROMPT)?$/i;
const RE_INPUTS = /^INPUTS$/i;
const RE_ARTIFACTS = /^ARTIFACTS$/i;

// Input line: - `name` (type_spec): Description
const RE_INPUT_LINE = /^-\s+`([a-zA-Z][a-zA-Z0-9_]*)`\s+\(([^)]+)\)(?::\s*(.+))?$/;

// Directives
const RE_OUTPUT = /^@output\((\w+)(?:\s*:\s*(\w+))?((?:,\s*"[^"]*")*)?(?:,\s*extract:"(\w+)")?\)\s*$/;
const RE_ELICIT = /^@elicit\((\w+)(?:,\s*(.+))?\)$/;
const RE_PROMPT = /^@prompt\((.+)\)$/;
const RE_TOOL = /^@tool\((.+)\)$/;

// Branch markers
const RE_IF = /^```if\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*```$/;
const RE_ELIF = /^```elif\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*```$/;
const RE_ELSE = /^```else```$/;
const RE_ENDIF = /^```endif```$/;

// Artifact type line
const RE_ARTIFACT_TYPE = /^type:\s*(\S+)$/i;

const VALID_ARTIFACT_TYPES: ArtifactType[] = [
  "markdown", "json", "mermaid", "chartjs", "html_css", "javascript", "typescript",
];

const TYPE_ALIASES: Record<string, VariableType> = {
  string: "string",
  text: "text",
  number: "number",
  num: "number",
  int: "number",
  float: "number",
  boolean: "boolean",
  bool: "boolean",
  enum: "enum",
  select: "enum",
  choice: "enum",
  json: "json",
};

// ---------------------------------------------------------------------------
// Section identification
// ---------------------------------------------------------------------------

interface Section {
  type: 'title' | 'description' | 'system' | 'inputs' | 'step' | 'artifacts' | 'unknown';
  heading: string;
  startLine: number; // 1-based line number of the heading
  contentStartLine: number; // 1-based line number of first content line
  lines: string[];
  // For steps:
  stepNumber?: number;
  stepTitle?: string;
}

function identifySections(lines: string[]): { sections: Section[]; titleLine: number; title: string; descriptionLines: string[]; descStartLine: number } {
  let title = '';
  let titleLine = -1;
  const descriptionLines: string[] = [];
  let descStartLine = -1;
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for title (first # heading)
    if (!title) {
      const titleMatch = line.match(RE_TITLE);
      if (titleMatch) {
        // Make sure it's not a ## heading
        if (!line.startsWith('## ')) {
          title = titleMatch[1].trim();
          titleLine = lineNum;
          continue;
        }
      }
    }

    // Check for ## section headings
    const sectionMatch = line.match(RE_SECTION);
    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }

      const heading = sectionMatch[1].trim();

      // Determine section type
      const stepMatch = line.match(RE_STEP);
      if (stepMatch) {
        currentSection = {
          type: 'step',
          heading,
          startLine: lineNum,
          contentStartLine: lineNum + 1,
          lines: [],
          stepNumber: parseInt(stepMatch[1], 10),
          stepTitle: stepMatch[2].trim(),
        };
      } else if (RE_SYSTEM.test(heading)) {
        currentSection = {
          type: 'system',
          heading,
          startLine: lineNum,
          contentStartLine: lineNum + 1,
          lines: [],
        };
      } else if (RE_INPUTS.test(heading)) {
        currentSection = {
          type: 'inputs',
          heading,
          startLine: lineNum,
          contentStartLine: lineNum + 1,
          lines: [],
        };
      } else if (RE_ARTIFACTS.test(heading)) {
        currentSection = {
          type: 'artifacts',
          heading,
          startLine: lineNum,
          contentStartLine: lineNum + 1,
          lines: [],
        };
      } else {
        currentSection = {
          type: 'unknown',
          heading,
          startLine: lineNum,
          contentStartLine: lineNum + 1,
          lines: [],
        };
      }
      continue;
    }

    // If we have a title but no section yet, these are description lines
    if (title && !currentSection) {
      if (descStartLine === -1 && line.trim()) {
        descStartLine = lineNum;
      }
      descriptionLines.push(line);
      continue;
    }

    // Accumulate content into current section
    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  // Push last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return { sections, titleLine, title, descriptionLines, descStartLine };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

function parseInputs(
  lines: string[],
  startLine: number,
  warnings: ParseWarning[],
  errors: ParseError[],
): InputDef[] {
  const inputs: InputDef[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = startLine + i;

    if (!line) continue;

    // Must start with - or * to be an input line
    if (!line.startsWith('-') && !line.startsWith('*')) continue;

    const match = line.match(RE_INPUT_LINE);
    if (!match) {
      // Line starts with - but doesn't match format
      if (line.startsWith('-') || line.startsWith('*')) {
        warnings.push({ line: lineNum, message: `Malformed input line: "${line}"` });
      }
      continue;
    }

    const name = match[1];
    const typeSpec = match[2].trim();
    const description = match[3]?.trim();

    // Check for duplicate names
    if (seenNames.has(name)) {
      errors.push({ line: lineNum, message: `Duplicate input name: "${name}"` });
      continue;
    }
    seenNames.add(name);

    // Parse type spec: "type" or "type: value" or "enum: opt1, opt2, ..."
    const colonIdx = typeSpec.indexOf(':');
    let rawType: string;
    let rawValue: string | undefined;

    if (colonIdx !== -1) {
      rawType = typeSpec.slice(0, colonIdx).trim();
      rawValue = typeSpec.slice(colonIdx + 1).trim();
    } else {
      rawType = typeSpec.trim();
    }

    // Resolve type
    const resolvedType = TYPE_ALIASES[rawType.toLowerCase()] || "string";

    const input: InputDef = {
      name,
      type: resolvedType,
      required: true,
      description,
      line: lineNum,
    };

    if (resolvedType === "enum" && rawValue) {
      input.options = rawValue.split(',').map(o => o.trim()).filter(o => o.length > 0);
      input.required = false; // enums have predefined options
    } else if (rawValue !== undefined) {
      input.default = rawValue;
      input.required = false;
    }

    inputs.push(input);
  }

  return inputs;
}

// ---------------------------------------------------------------------------
// Directive extraction
// ---------------------------------------------------------------------------

interface DirectiveResult {
  output_var?: string;
  output_type?: VariableType;
  output_options?: string[];
  extract_field?: string;
  elicitation?: ElicitationDef;
  tool_call?: StepToolCall;
  prompt_ref?: PromptReference;
  contentLines: string[];
}

function parseQuotedStrings(str: string): string[] {
  const results: string[] = [];
  const re = /"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function extractDirectives(
  lines: string[],
  startLine: number,
  warnings: ParseWarning[],
): DirectiveResult {
  const result: DirectiveResult = {
    contentLines: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = startLine + i;

    // @output
    const outputMatch = trimmed.match(RE_OUTPUT);
    if (outputMatch) {
      result.output_var = outputMatch[1];
      if (outputMatch[2]) {
        const rawType = outputMatch[2].toLowerCase();
        result.output_type = TYPE_ALIASES[rawType] || "string";
      }
      if (outputMatch[3]) {
        // Parse enum values from repeated `, "value"` patterns
        const enumValues: string[] = [];
        const enumRe = /,\s*"([^"]*)"/g;
        let em: RegExpExecArray | null;
        while ((em = enumRe.exec(outputMatch[3])) !== null) {
          enumValues.push(em[1]);
        }
        if (enumValues.length > 0) {
          result.output_options = enumValues;
        }
      }
      if (outputMatch[4]) {
        result.extract_field = outputMatch[4];
      }
      continue;
    }

    // @elicit
    const elicitMatch = trimmed.match(RE_ELICIT);
    if (elicitMatch) {
      const elicitType = elicitMatch[1].toLowerCase();
      const validTypes = ['input', 'confirm', 'select'];
      if (!validTypes.includes(elicitType)) {
        warnings.push({ line: lineNum, message: `Invalid elicit type: "${elicitType}"` });
        result.contentLines.push(line);
        continue;
      }
      const args = elicitMatch[2] || '';
      const quoted = parseQuotedStrings(args);
      const prompt = quoted[0] || '';
      const options = quoted.slice(1);
      result.elicitation = {
        type: elicitType as ElicitationDef['type'],
        prompt,
        ...(options.length > 0 ? { options } : {}),
      };
      continue;
    }

    // @prompt
    const promptMatch = trimmed.match(RE_PROMPT);
    if (promptMatch) {
      result.prompt_ref = { prompt_id: promptMatch[1] };
      continue;
    }

    // @tool
    const toolMatch = trimmed.match(RE_TOOL);
    if (toolMatch) {
      const toolArgs = toolMatch[1];
      // Split on first two commas
      const parts = splitToolArgs(toolArgs);
      if (parts.length >= 2) {
        const connName = parts[0].trim().replace(/^"|"$/g, '');
        const toolName = parts[1].trim().replace(/^"|"$/g, '');
        const jsonArgs = parts[2]?.trim();
        result.tool_call = {
          connection_name: connName,
          tool_name: toolName,
          ...(jsonArgs ? { arguments: jsonArgs } : {}),
        };
      }
      continue;
    }

    // Regular content line
    result.contentLines.push(line);
  }

  return result;
}

function splitToolArgs(str: string): string[] {
  // Split on commas, but respect JSON braces and quoted strings
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (ch === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inQuote = !inQuote;
    }

    if (!inQuote) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;

      if (ch === ',' && depth === 0 && parts.length < 2) {
        parts.push(current);
        current = '';
        continue;
      }
    }

    current += ch;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Branch parsing
// ---------------------------------------------------------------------------

function parseBranches(
  lines: string[],
  startLine: number,
  parentStepNumber: number,
  inputNames: Set<string>,
  outputNames: Set<string>,
  warnings: ParseWarning[],
): { branches: Branch[]; contentBefore: string[]; hasBranches: boolean } {
  const contentBefore: string[] = [];
  const branches: Branch[] = [];
  let currentBranch: { condition: Condition | null; lines: string[]; startLine: number } | null = null;
  let hasBranches = false;
  let inBranch = false;
  let letterIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = startLine + i;

    // Check for branch markers
    const ifMatch = trimmed.match(RE_IF);
    if (ifMatch) {
      hasBranches = true;
      inBranch = true;
      const variable = ifMatch[1];
      const operator = ifMatch[2] as "==" | "!=";
      const value = ifMatch[3];

      // Check if variable is declared
      const source = inputNames.has(variable) ? "input" as const
        : outputNames.has(variable) ? "step_output" as const
        : "input" as const;

      if (!inputNames.has(variable) && !outputNames.has(variable)) {
        warnings.push({ line: lineNum, message: `Undeclared branch variable: "${variable}"` });
      }

      if (currentBranch) {
        branches.push(finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings));
        letterIndex++;
      }

      currentBranch = {
        condition: { variable, operator, value, source },
        lines: [],
        startLine: lineNum + 1,
      };
      continue;
    }

    const elifMatch = trimmed.match(RE_ELIF);
    if (elifMatch) {
      const variable = elifMatch[1];
      const operator = elifMatch[2] as "==" | "!=";
      const value = elifMatch[3];

      const source = inputNames.has(variable) ? "input" as const
        : outputNames.has(variable) ? "step_output" as const
        : "input" as const;

      if (!inputNames.has(variable) && !outputNames.has(variable)) {
        warnings.push({ line: lineNum, message: `Undeclared branch variable: "${variable}"` });
      }

      if (currentBranch) {
        branches.push(finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings));
        letterIndex++;
      }

      currentBranch = {
        condition: { variable, operator, value, source },
        lines: [],
        startLine: lineNum + 1,
      };
      continue;
    }

    if (RE_ELSE.test(trimmed)) {
      if (currentBranch) {
        branches.push(finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings));
        letterIndex++;
      }

      currentBranch = {
        condition: null,
        lines: [],
        startLine: lineNum + 1,
      };
      continue;
    }

    if (RE_ENDIF.test(trimmed)) {
      if (currentBranch) {
        branches.push(finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings));
        letterIndex++;
      }
      currentBranch = null;
      inBranch = false;
      continue;
    }

    // Regular content
    if (inBranch && currentBranch) {
      currentBranch.lines.push(line);
    } else if (!inBranch) {
      contentBefore.push(line);
    }
  }

  return { branches, contentBefore, hasBranches };
}

function finalizeBranch(
  raw: { condition: Condition | null; lines: string[]; startLine: number },
  parentStepNumber: number,
  letterIndex: number,
  warnings: ParseWarning[],
): Branch {
  const letter = String.fromCharCode(97 + letterIndex); // a, b, c, ...
  const steps: Step[] = [];

  // Look for ### STEP sub-headings within the branch
  let currentSubStep: { number: number; label: string; title: string; lines: string[]; startLine: number } | null = null;

  for (let i = 0; i < raw.lines.length; i++) {
    const line = raw.lines[i];
    const trimmed = line.trim();
    const lineNum = raw.startLine + i;

    const subMatch = trimmed.match(RE_SUBSTEP);
    if (subMatch) {
      if (currentSubStep) {
        steps.push(buildSubStep(currentSubStep, warnings));
      }
      currentSubStep = {
        number: parentStepNumber,
        label: subMatch[1],
        title: subMatch[2].trim(),
        lines: [],
        startLine: lineNum,
      };
      continue;
    }

    if (currentSubStep) {
      currentSubStep.lines.push(line);
    }
  }

  if (currentSubStep) {
    steps.push(buildSubStep(currentSubStep, warnings));
  }

  // If no sub-steps found, create a synthetic sub-step from the branch content
  if (steps.length === 0) {
    const content = raw.lines.join('\n').trim();
    if (content) {
      steps.push({
        number: parentStepNumber,
        label: `${parentStepNumber}${letter}`,
        title: `Branch ${letter}`,
        content,
        is_branching: false,
        line: raw.startLine,
      });
    }
  }

  return {
    condition: raw.condition,
    steps,
  };
}

function buildSubStep(
  raw: { number: number; label: string; title: string; lines: string[]; startLine: number },
  warnings: ParseWarning[],
): Step {
  const directives = extractDirectives(raw.lines, raw.startLine + 1, warnings);
  const content = directives.contentLines.join('\n').trim();

  return {
    number: raw.number,
    label: raw.label,
    title: raw.title,
    content,
    is_branching: false,
    line: raw.startLine,
    ...(directives.output_var ? { output_var: directives.output_var } : {}),
    ...(directives.output_type ? { output_type: directives.output_type } : {}),
    ...(directives.output_options ? { output_options: directives.output_options } : {}),
    ...(directives.extract_field ? { extract_field: directives.extract_field } : {}),
    ...(directives.elicitation ? { elicitation: directives.elicitation } : {}),
    ...(directives.tool_call ? { tool_call: directives.tool_call } : {}),
    ...(directives.prompt_ref ? { prompt_ref: directives.prompt_ref } : {}),
  };
}

// ---------------------------------------------------------------------------
// Artifact parsing
// ---------------------------------------------------------------------------

function parseArtifacts(
  lines: string[],
  startLine: number,
  warnings: ParseWarning[],
): ArtifactType | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = startLine + i;

    const match = line.match(RE_ARTIFACT_TYPE);
    if (match) {
      const raw = match[1].trim();
      const lower = raw.toLowerCase();
      if (VALID_ARTIFACT_TYPES.includes(lower as ArtifactType)) {
        return lower as ArtifactType;
      } else if (/^\{\{(\w+)\}\}$/.test(raw)) {
        // Dynamic variable reference — store raw, skip unknown-type warning
        return raw as ArtifactType;
      } else {
        warnings.push({ line: lineNum, message: `Unknown artifact type: "${lower}"` });
        return lower as ArtifactType;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parsePlaybook(markdown: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const errors: ParseError[] = [];

  // Size check
  const byteLength = new TextEncoder().encode(markdown).length;
  if (byteLength > 200000) {
    errors.push({ message: 'Document exceeds 200KB size limit' });
    return { definition: null, warnings, errors };
  }

  // Empty check
  if (!markdown.trim()) {
    errors.push({ message: 'Document is empty' });
    return { definition: null, warnings, errors };
  }

  const lines = markdown.split('\n');
  const { sections, title, titleLine, descriptionLines } = identifySections(lines);

  // Title required
  if (!title) {
    errors.push({ message: 'No title found. A playbook must start with a # heading.' });
    return { definition: null, warnings, errors };
  }

  // Process sections
  let systemPrompt: string | undefined;
  let inputs: InputDef[] = [];
  let artifactType: ArtifactType | undefined;
  const steps: Step[] = [];

  // Collect input and output names for branch variable checking
  const inputNames = new Set<string>();
  const outputNames = new Set<string>();

  // First pass: parse inputs (needed for branch variable checking)
  for (const section of sections) {
    if (section.type === 'inputs') {
      inputs = parseInputs(section.lines, section.contentStartLine, warnings, errors);
      for (const input of inputs) {
        inputNames.add(input.name);
      }
    }
  }

  // Check for fatal duplicate input error
  if (errors.some(e => e.message.startsWith('Duplicate input name'))) {
    return { definition: null, warnings, errors };
  }

  // Second pass: parse all other sections
  for (const section of sections) {
    if (section.type === 'system') {
      systemPrompt = section.lines.join('\n').trim();
    }

    if (section.type === 'step') {
      const stepNumber = section.stepNumber!;
      const stepTitle = section.stepTitle!;

      // Parse branches first
      const branchResult = parseBranches(
        section.lines,
        section.contentStartLine,
        stepNumber,
        inputNames,
        outputNames,
        warnings,
      );

      // Extract directives from non-branch content
      const directives = extractDirectives(
        branchResult.contentBefore,
        section.contentStartLine,
        warnings,
      );

      const content = directives.contentLines.join('\n').trim();

      // Track output names for later branch variable checking
      if (directives.output_var) {
        outputNames.add(directives.output_var);
      }

      // Also track output names from branch sub-steps
      if (branchResult.hasBranches) {
        for (const branch of branchResult.branches) {
          for (const subStep of branch.steps) {
            if (subStep.output_var) {
              outputNames.add(subStep.output_var);
            }
          }
        }
      }

      const step: Step = {
        number: stepNumber,
        label: String(stepNumber),
        title: stepTitle,
        content,
        is_branching: branchResult.hasBranches,
        line: section.startLine,
        ...(directives.output_var ? { output_var: directives.output_var } : {}),
        ...(directives.output_type ? { output_type: directives.output_type } : {}),
        ...(directives.output_options ? { output_options: directives.output_options } : {}),
        ...(directives.extract_field ? { extract_field: directives.extract_field } : {}),
        ...(directives.elicitation ? { elicitation: directives.elicitation } : {}),
        ...(directives.tool_call ? { tool_call: directives.tool_call } : {}),
        ...(directives.prompt_ref ? { prompt_ref: directives.prompt_ref } : {}),
        ...(branchResult.hasBranches ? { branches: branchResult.branches } : {}),
      };

      steps.push(step);
    }

    if (section.type === 'artifacts') {
      artifactType = parseArtifacts(section.lines, section.contentStartLine, warnings);
    }
  }

  // No steps = fatal
  if (steps.length === 0) {
    errors.push({ message: 'No steps found. A playbook must have at least one ## STEP N: Title.' });
    return { definition: null, warnings, errors };
  }

  // Check sequential numbering
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].number !== i + 1) {
      warnings.push({
        line: steps[i].line,
        message: `Non-sequential step number: expected ${i + 1}, found ${steps[i].number}`,
      });
      break;
    }
  }

  // Build description
  const description = descriptionLines.join('\n').trim() || undefined;

  const definition: PlaybookDefinition = {
    title,
    ...(description ? { description } : {}),
    ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
    inputs,
    steps,
    ...(artifactType ? { artifact_type: artifactType } : {}),
  };

  return { definition, warnings, errors };
}
