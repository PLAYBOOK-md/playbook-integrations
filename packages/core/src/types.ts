/**
 * PLAYBOOK.md Parser Types
 *
 * Mirrors @playbook-md/schema types for the playground parser.
 * When the parser is extracted, these will be imported from the schema package.
 */

export type VariableType = "string" | "text" | "number" | "boolean" | "enum" | "json";

export interface InputDef {
  name: string;
  type: VariableType;
  default?: string;
  options?: string[];
  description?: string;
  required: boolean;
  /** Line number in source (1-based) */
  line?: number;
}

export interface PromptReference {
  prompt_id: string;
}

export interface ElicitationDef {
  type: "input" | "confirm" | "select";
  prompt: string;
  options?: string[];
}

export interface StepToolCall {
  connection_name: string;
  tool_name: string;
  arguments?: string;
}

export interface Condition {
  variable: string;
  operator: "==" | "!=";
  value: string;
  source: "input" | "step_output";
}

export interface Branch {
  condition: Condition | null;
  steps: Step[];
}

export interface Step {
  number: number;
  label: string;
  title: string;
  content: string;
  prompt_ref?: PromptReference;
  output_var?: string;
  output_type?: VariableType;
  output_options?: string[];
  extract_field?: string;
  elicitation?: ElicitationDef;
  tool_call?: StepToolCall;
  is_branching: boolean;
  branches?: Branch[];
  /** Line number of the step heading (1-based) */
  line?: number;
}

export type ArtifactType =
  | "markdown"
  | "json"
  | "mermaid"
  | "chartjs"
  | "html_css"
  | "javascript"
  | "typescript";

export interface PlaybookDefinition {
  title: string;
  description?: string;
  system_prompt?: string;
  inputs: InputDef[];
  steps: Step[];
  artifact_type?: ArtifactType;
}

export interface ParseWarning {
  line?: number;
  message: string;
}

export interface ParseError {
  line?: number;
  message: string;
}

export interface ParseResult {
  definition: PlaybookDefinition | null;
  warnings: ParseWarning[];
  errors: ParseError[];
}
