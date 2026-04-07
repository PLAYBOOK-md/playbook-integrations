package playbook

// VariableType represents the type of an input variable.
type VariableType string

const (
	VariableTypeString  VariableType = "string"
	VariableTypeText    VariableType = "text"
	VariableTypeNumber  VariableType = "number"
	VariableTypeBoolean VariableType = "boolean"
	VariableTypeEnum    VariableType = "enum"
)

// InputDef defines a single input parameter for a playbook.
type InputDef struct {
	Name        string       `json:"name"`
	Type        VariableType `json:"type"`
	Default     string       `json:"default,omitempty"`
	Options     []string     `json:"options,omitempty"`
	Description string       `json:"description,omitempty"`
	Required    bool         `json:"required"`
	Line        int          `json:"line,omitempty"`
}

// PromptReference represents a reference to an external prompt library entry.
type PromptReference struct {
	PromptID string `json:"prompt_id"`
}

// ElicitationDef defines an elicitation directive for user interaction.
type ElicitationDef struct {
	Type    string   `json:"type"` // "input", "confirm", or "select"
	Prompt  string   `json:"prompt"`
	Options []string `json:"options,omitempty"`
}

// StepToolCall defines a tool invocation within a step.
type StepToolCall struct {
	ConnectionName string `json:"connection_name"`
	ToolName       string `json:"tool_name"`
	Arguments      string `json:"arguments,omitempty"`
}

// Condition defines a branch condition.
type Condition struct {
	Variable string `json:"variable"`
	Operator string `json:"operator"` // "==" or "!="
	Value    string `json:"value"`
	Source   string `json:"source"` // "input" or "step_output"
}

// Branch represents a conditional branch containing steps.
type Branch struct {
	Condition *Condition `json:"condition"` // nil for else branches
	Steps     []Step     `json:"steps"`
}

// Step represents a single step in a playbook.
type Step struct {
	Number       int              `json:"number"`
	Label        string           `json:"label"`
	Title        string           `json:"title"`
	Content      string           `json:"content"`
	PromptRef    *PromptReference `json:"prompt_ref,omitempty"`
	OutputVar    string           `json:"output_var,omitempty"`
	ExtractField string           `json:"extract_field,omitempty"`
	Elicitation  *ElicitationDef  `json:"elicitation,omitempty"`
	ToolCall     *StepToolCall    `json:"tool_call,omitempty"`
	IsBranching  bool             `json:"is_branching"`
	Branches     []Branch         `json:"branches,omitempty"`
	Line         int              `json:"line,omitempty"`
}

// ArtifactType represents the type of artifact a playbook produces.
type ArtifactType string

const (
	ArtifactMarkdown   ArtifactType = "markdown"
	ArtifactJSON       ArtifactType = "json"
	ArtifactMermaid    ArtifactType = "mermaid"
	ArtifactChartJS    ArtifactType = "chartjs"
	ArtifactHTMLCSS    ArtifactType = "html_css"
	ArtifactJavaScript ArtifactType = "javascript"
	ArtifactTypeScript ArtifactType = "typescript"
)

// PlaybookDefinition is the fully parsed representation of a PLAYBOOK.md file.
type PlaybookDefinition struct {
	Title        string       `json:"title"`
	Description  string       `json:"description,omitempty"`
	SystemPrompt string       `json:"system_prompt,omitempty"`
	Inputs       []InputDef   `json:"inputs"`
	Steps        []Step       `json:"steps"`
	ArtifactType ArtifactType `json:"artifact_type,omitempty"`
}

// ParseWarning represents a non-fatal issue found during parsing.
type ParseWarning struct {
	Line    int    `json:"line,omitempty"`
	Message string `json:"message"`
}

// ParseError represents a fatal error found during parsing.
type ParseError struct {
	Line    int    `json:"line,omitempty"`
	Message string `json:"message"`
}

// ParseResult contains the output of parsing a PLAYBOOK.md file.
type ParseResult struct {
	Definition *PlaybookDefinition `json:"definition"`
	Warnings   []ParseWarning      `json:"warnings"`
	Errors     []ParseError        `json:"errors"`
}

// PlaybookSummary is a compact summary of a PlaybookDefinition.
type PlaybookSummary struct {
	Title          string   `json:"title"`
	Description    string   `json:"description,omitempty"`
	InputCount     int      `json:"input_count"`
	StepCount      int      `json:"step_count"`
	StepTitles     []string `json:"step_titles"`
	ArtifactType   string   `json:"artifact_type,omitempty"`
	HasBranching   bool     `json:"has_branching"`
	HasElicitation bool     `json:"has_elicitation"`
	HasToolCalls   bool     `json:"has_tool_calls"`
	DirectivesUsed []string `json:"directives_used"`
}

// ValidationResult contains the output of validating a playbook.
type ValidationResult struct {
	Valid       bool           `json:"valid"`
	FatalErrors []ParseError  `json:"fatal_errors"`
	Warnings    []ParseWarning `json:"warnings"`
}
