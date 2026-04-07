package playbook

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testdataPath(name string) string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "testdata", name)
}

func readTestdata(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(testdataPath(name))
	if err != nil {
		t.Fatalf("failed to read testdata/%s: %v", name, err)
	}
	return string(data)
}

func TestParseValidPlaybook(t *testing.T) {
	md := readTestdata(t, "content-pipeline.playbook.md")
	result := ParsePlaybook(md)

	if result.Definition == nil {
		t.Fatalf("expected definition, got nil; errors: %v", result.Errors)
	}

	def := result.Definition

	if def.Title != "Content Pipeline" {
		t.Errorf("title = %q, want %q", def.Title, "Content Pipeline")
	}

	if def.Description != "Generate a polished article from a topic and target audience." {
		t.Errorf("description = %q, want %q", def.Description, "Generate a polished article from a topic and target audience.")
	}

	if def.SystemPrompt == "" {
		t.Error("expected system prompt to be set")
	}

	if len(def.Inputs) != 3 {
		t.Fatalf("input count = %d, want 3", len(def.Inputs))
	}

	// Check input: topic
	if def.Inputs[0].Name != "topic" {
		t.Errorf("input[0].name = %q, want %q", def.Inputs[0].Name, "topic")
	}
	if def.Inputs[0].Type != VariableTypeString {
		t.Errorf("input[0].type = %q, want %q", def.Inputs[0].Type, VariableTypeString)
	}
	if !def.Inputs[0].Required {
		t.Error("input[0] should be required")
	}

	// Check input: audience (enum)
	if def.Inputs[1].Name != "audience" {
		t.Errorf("input[1].name = %q, want %q", def.Inputs[1].Name, "audience")
	}
	if def.Inputs[1].Type != VariableTypeEnum {
		t.Errorf("input[1].type = %q, want %q", def.Inputs[1].Type, VariableTypeEnum)
	}
	if len(def.Inputs[1].Options) != 3 {
		t.Errorf("input[1].options length = %d, want 3", len(def.Inputs[1].Options))
	}
	if def.Inputs[1].Required {
		t.Error("input[1] (enum) should not be required")
	}

	// Check input: word_count (number with default)
	if def.Inputs[2].Name != "word_count" {
		t.Errorf("input[2].name = %q, want %q", def.Inputs[2].Name, "word_count")
	}
	if def.Inputs[2].Type != VariableTypeNumber {
		t.Errorf("input[2].type = %q, want %q", def.Inputs[2].Type, VariableTypeNumber)
	}
	if def.Inputs[2].Default != "1500" {
		t.Errorf("input[2].default = %q, want %q", def.Inputs[2].Default, "1500")
	}

	// Check steps
	if len(def.Steps) != 4 {
		t.Fatalf("step count = %d, want 4", len(def.Steps))
	}

	if def.Steps[0].Title != "Research" {
		t.Errorf("step[0].title = %q, want %q", def.Steps[0].Title, "Research")
	}
	if def.Steps[0].Number != 1 {
		t.Errorf("step[0].number = %d, want 1", def.Steps[0].Number)
	}
	if def.Steps[0].Label != "1" {
		t.Errorf("step[0].label = %q, want %q", def.Steps[0].Label, "1")
	}

	if def.Steps[3].Title != "Polish" {
		t.Errorf("step[3].title = %q, want %q", def.Steps[3].Title, "Polish")
	}

	// Check artifact type
	if def.ArtifactType != ArtifactMarkdown {
		t.Errorf("artifact_type = %q, want %q", def.ArtifactType, ArtifactMarkdown)
	}

	// No errors expected
	if len(result.Errors) != 0 {
		t.Errorf("unexpected errors: %v", result.Errors)
	}
}

func TestParseEmptyInput(t *testing.T) {
	result := ParsePlaybook("")
	if result.Definition != nil {
		t.Error("expected nil definition for empty input")
	}
	if len(result.Errors) == 0 {
		t.Fatal("expected errors for empty input")
	}
	if result.Errors[0].Message != "Document is empty" {
		t.Errorf("error = %q, want %q", result.Errors[0].Message, "Document is empty")
	}
}

func TestParseWhitespaceOnly(t *testing.T) {
	result := ParsePlaybook("   \n  \n  ")
	if result.Definition != nil {
		t.Error("expected nil definition for whitespace-only input")
	}
	if len(result.Errors) == 0 {
		t.Fatal("expected errors for whitespace-only input")
	}
	if result.Errors[0].Message != "Document is empty" {
		t.Errorf("error = %q, want %q", result.Errors[0].Message, "Document is empty")
	}
}

func TestParseNoTitle(t *testing.T) {
	md := readTestdata(t, "no-title.playbook.md")
	result := ParsePlaybook(md)

	if result.Definition != nil {
		t.Error("expected nil definition for no-title input")
	}
	if len(result.Errors) == 0 {
		t.Fatal("expected errors for no-title input")
	}
	if result.Errors[0].Message != "No title found. A playbook must start with a # heading." {
		t.Errorf("error = %q, want %q", result.Errors[0].Message, "No title found. A playbook must start with a # heading.")
	}
}

func TestParseNoSteps(t *testing.T) {
	md := "# My Playbook\n\nSome description.\n\n## INPUTS\n\n- `name` (string): A name\n"
	result := ParsePlaybook(md)

	if result.Definition != nil {
		t.Error("expected nil definition for no-steps input")
	}
	if len(result.Errors) == 0 {
		t.Fatal("expected errors for no-steps input")
	}
	if result.Errors[0].Message != "No steps found. A playbook must have at least one ## STEP N: Title." {
		t.Errorf("error = %q, want %q", result.Errors[0].Message, "No steps found. A playbook must have at least one ## STEP N: Title.")
	}
}

func TestParseInputTypes(t *testing.T) {
	md := `# Test Playbook

## INPUTS

- ` + "`name`" + ` (string): A name
- ` + "`bio`" + ` (text): A biography
- ` + "`age`" + ` (number): User age
- ` + "`active`" + ` (boolean): Is active
- ` + "`color`" + ` (enum: red, green, blue): Pick a color

## STEP 1: Do something

Do the thing.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition, got nil; errors: %v", result.Errors)
	}

	inputs := result.Definition.Inputs
	if len(inputs) != 5 {
		t.Fatalf("input count = %d, want 5", len(inputs))
	}

	expected := []struct {
		name     string
		typ      VariableType
		required bool
	}{
		{"name", VariableTypeString, true},
		{"bio", VariableTypeText, true},
		{"age", VariableTypeNumber, true},
		{"active", VariableTypeBoolean, true},
		{"color", VariableTypeEnum, false},
	}

	for i, exp := range expected {
		if inputs[i].Name != exp.name {
			t.Errorf("input[%d].name = %q, want %q", i, inputs[i].Name, exp.name)
		}
		if inputs[i].Type != exp.typ {
			t.Errorf("input[%d].type = %q, want %q", i, inputs[i].Type, exp.typ)
		}
		if inputs[i].Required != exp.required {
			t.Errorf("input[%d].required = %v, want %v", i, inputs[i].Required, exp.required)
		}
	}

	// Check enum options
	if len(inputs[4].Options) != 3 {
		t.Fatalf("input[4].options length = %d, want 3", len(inputs[4].Options))
	}
	if inputs[4].Options[0] != "red" || inputs[4].Options[1] != "green" || inputs[4].Options[2] != "blue" {
		t.Errorf("input[4].options = %v, want [red green blue]", inputs[4].Options)
	}
}

func TestParseOutputDirective(t *testing.T) {
	md := `# Test

## STEP 1: Generate

Generate something.

@output(result)
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if step.OutputVar != "result" {
		t.Errorf("output_var = %q, want %q", step.OutputVar, "result")
	}
}

func TestParseOutputWithExtract(t *testing.T) {
	md := `# Test

## STEP 1: Generate

Generate something.

@output(result, extract:"summary")
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if step.OutputVar != "result" {
		t.Errorf("output_var = %q, want %q", step.OutputVar, "result")
	}
	if step.ExtractField != "summary" {
		t.Errorf("extract_field = %q, want %q", step.ExtractField, "summary")
	}
}

func TestParseElicitDirective(t *testing.T) {
	md := `# Test

## STEP 1: Ask

Ask the user.

@elicit(confirm, "Are you sure?")
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if step.Elicitation == nil {
		t.Fatal("expected elicitation to be set")
	}
	if step.Elicitation.Type != "confirm" {
		t.Errorf("elicit type = %q, want %q", step.Elicitation.Type, "confirm")
	}
	if step.Elicitation.Prompt != "Are you sure?" {
		t.Errorf("elicit prompt = %q, want %q", step.Elicitation.Prompt, "Are you sure?")
	}
}

func TestParsePromptDirective(t *testing.T) {
	md := `# Test

## STEP 1: Run

Use a prompt.

@prompt(library:my-prompt-id)
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if step.PromptRef == nil {
		t.Fatal("expected prompt_ref to be set")
	}
	if step.PromptRef.PromptID != "my-prompt-id" {
		t.Errorf("prompt_id = %q, want %q", step.PromptRef.PromptID, "my-prompt-id")
	}
}

func TestParseToolDirective(t *testing.T) {
	md := `# Test

## STEP 1: Call

Call a tool.

@tool("my-conn", "my-tool", {"key": "value"})
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if step.ToolCall == nil {
		t.Fatal("expected tool_call to be set")
	}
	if step.ToolCall.ConnectionName != "my-conn" {
		t.Errorf("connection_name = %q, want %q", step.ToolCall.ConnectionName, "my-conn")
	}
	if step.ToolCall.ToolName != "my-tool" {
		t.Errorf("tool_name = %q, want %q", step.ToolCall.ToolName, "my-tool")
	}
	if step.ToolCall.Arguments != `{"key": "value"}` {
		t.Errorf("arguments = %q, want %q", step.ToolCall.Arguments, `{"key": "value"}`)
	}
}

func TestParseBranches(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`mode`" + ` (enum: fast, slow): Speed mode

## STEP 1: Branch

Choose path.

` + "```if mode==\"fast\"```" + `

Do fast things.

` + "```else```" + `

Do slow things.

` + "```endif```" + `
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if !step.IsBranching {
		t.Error("expected step to be branching")
	}
	if len(step.Branches) != 2 {
		t.Fatalf("branch count = %d, want 2", len(step.Branches))
	}

	// First branch: if
	if step.Branches[0].Condition == nil {
		t.Fatal("expected first branch to have condition")
	}
	if step.Branches[0].Condition.Variable != "mode" {
		t.Errorf("branch[0].condition.variable = %q, want %q", step.Branches[0].Condition.Variable, "mode")
	}
	if step.Branches[0].Condition.Operator != "==" {
		t.Errorf("branch[0].condition.operator = %q, want %q", step.Branches[0].Condition.Operator, "==")
	}
	if step.Branches[0].Condition.Value != "fast" {
		t.Errorf("branch[0].condition.value = %q, want %q", step.Branches[0].Condition.Value, "fast")
	}
	if step.Branches[0].Condition.Source != "input" {
		t.Errorf("branch[0].condition.source = %q, want %q", step.Branches[0].Condition.Source, "input")
	}

	// Second branch: else (nil condition)
	if step.Branches[1].Condition != nil {
		t.Error("expected second branch (else) to have nil condition")
	}

	// Both branches should have steps
	if len(step.Branches[0].Steps) == 0 {
		t.Error("expected first branch to have steps")
	}
	if len(step.Branches[1].Steps) == 0 {
		t.Error("expected second branch to have steps")
	}
}

func TestParseBranchWithElif(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`level`" + ` (enum: low, medium, high): Level

## STEP 1: Branch

Choose path.

` + "```if level==\"low\"```" + `

Low path.

` + "```elif level==\"medium\"```" + `

Medium path.

` + "```else```" + `

High path.

` + "```endif```" + `
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	step := result.Definition.Steps[0]
	if len(step.Branches) != 3 {
		t.Fatalf("branch count = %d, want 3", len(step.Branches))
	}
}

func TestParseSizeLimit(t *testing.T) {
	// Create a string > 200KB
	big := "# Title\n" + strings.Repeat("x", 200001)
	result := ParsePlaybook(big)

	if result.Definition != nil {
		t.Error("expected nil definition for oversized input")
	}
	if len(result.Errors) == 0 {
		t.Fatal("expected errors for oversized input")
	}
	if result.Errors[0].Message != "Document exceeds 200KB size limit" {
		t.Errorf("error = %q, want %q", result.Errors[0].Message, "Document exceeds 200KB size limit")
	}
}

func TestParseNonSequentialSteps(t *testing.T) {
	md := `# Test

## STEP 1: First

Content.

## STEP 3: Third

Content.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	found := false
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "Non-sequential step number") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected non-sequential step warning")
	}
}

func TestParseTypeAliases(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`a`" + ` (num): number alias
- ` + "`b`" + ` (int): number alias
- ` + "`c`" + ` (float): number alias
- ` + "`d`" + ` (bool): boolean alias
- ` + "`e`" + ` (select: x, y): enum alias
- ` + "`f`" + ` (choice: p, q): enum alias

## STEP 1: Do

Content.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	inputs := result.Definition.Inputs
	if len(inputs) != 6 {
		t.Fatalf("input count = %d, want 6", len(inputs))
	}

	if inputs[0].Type != VariableTypeNumber {
		t.Errorf("num alias: got %q, want %q", inputs[0].Type, VariableTypeNumber)
	}
	if inputs[1].Type != VariableTypeNumber {
		t.Errorf("int alias: got %q, want %q", inputs[1].Type, VariableTypeNumber)
	}
	if inputs[2].Type != VariableTypeNumber {
		t.Errorf("float alias: got %q, want %q", inputs[2].Type, VariableTypeNumber)
	}
	if inputs[3].Type != VariableTypeBoolean {
		t.Errorf("bool alias: got %q, want %q", inputs[3].Type, VariableTypeBoolean)
	}
	if inputs[4].Type != VariableTypeEnum {
		t.Errorf("select alias: got %q, want %q", inputs[4].Type, VariableTypeEnum)
	}
	if inputs[5].Type != VariableTypeEnum {
		t.Errorf("choice alias: got %q, want %q", inputs[5].Type, VariableTypeEnum)
	}
}

func TestParseSystemPromptSection(t *testing.T) {
	md := `# Test

## SYSTEM PROMPT

You are a helpful assistant.

## STEP 1: Go

Do things.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	if result.Definition.SystemPrompt != "You are a helpful assistant." {
		t.Errorf("system_prompt = %q, want %q", result.Definition.SystemPrompt, "You are a helpful assistant.")
	}
}

func TestParseDuplicateInputNames(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`name`" + ` (string): First
- ` + "`name`" + ` (string): Duplicate

## STEP 1: Go

Do things.
`

	result := ParsePlaybook(md)
	if result.Definition != nil {
		t.Error("expected nil definition for duplicate input names")
	}
	found := false
	for _, e := range result.Errors {
		if strings.Contains(e.Message, "Duplicate input name") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected duplicate input name error")
	}
}

func TestParseStepContent(t *testing.T) {
	md := `# Test

## STEP 1: Do

This is step content.
It can span multiple lines.

With paragraphs too.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	content := result.Definition.Steps[0].Content
	if !strings.Contains(content, "This is step content.") {
		t.Errorf("step content should contain 'This is step content.', got %q", content)
	}
	if !strings.Contains(content, "With paragraphs too.") {
		t.Errorf("step content should contain 'With paragraphs too.', got %q", content)
	}
}
