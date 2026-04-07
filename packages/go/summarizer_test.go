package playbook

import (
	"testing"
)

func TestSummarizePlaybook(t *testing.T) {
	md := readTestdata(t, "content-pipeline.playbook.md")
	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	summary := SummarizePlaybook(result.Definition)

	if summary.Title != "Content Pipeline" {
		t.Errorf("title = %q, want %q", summary.Title, "Content Pipeline")
	}

	if summary.Description != "Generate a polished article from a topic and target audience." {
		t.Errorf("description = %q, want %q", summary.Description, "Generate a polished article from a topic and target audience.")
	}

	if summary.InputCount != 3 {
		t.Errorf("input_count = %d, want 3", summary.InputCount)
	}

	if summary.StepCount != 4 {
		t.Errorf("step_count = %d, want 4", summary.StepCount)
	}

	if len(summary.StepTitles) != 4 {
		t.Fatalf("step_titles length = %d, want 4", len(summary.StepTitles))
	}

	expectedTitles := []string{"Research", "Outline", "Draft", "Polish"}
	for i, title := range expectedTitles {
		if summary.StepTitles[i] != title {
			t.Errorf("step_titles[%d] = %q, want %q", i, summary.StepTitles[i], title)
		}
	}

	if summary.ArtifactType != "markdown" {
		t.Errorf("artifact_type = %q, want %q", summary.ArtifactType, "markdown")
	}

	if summary.HasBranching {
		t.Error("expected has_branching = false")
	}

	if summary.HasElicitation {
		t.Error("expected has_elicitation = false")
	}

	if summary.HasToolCalls {
		t.Error("expected has_tool_calls = false")
	}
}

func TestSummarizeWithBranching(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`mode`" + ` (enum: a, b): Mode

## STEP 1: Branch

Content.

` + "```if mode==\"a\"```" + `

A path.

` + "```else```" + `

B path.

` + "```endif```" + `
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	summary := SummarizePlaybook(result.Definition)
	if !summary.HasBranching {
		t.Error("expected has_branching = true")
	}
}

func TestSummarizeWithDirectives(t *testing.T) {
	md := `# Test

## STEP 1: Generate

Generate something.

@output(result)

## STEP 2: Ask

Ask user.

@elicit(confirm, "OK?")
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	summary := SummarizePlaybook(result.Definition)

	if !summary.HasElicitation {
		t.Error("expected has_elicitation = true")
	}

	// Check directives used
	foundOutput := false
	foundElicit := false
	for _, d := range summary.DirectivesUsed {
		if d == "@output" {
			foundOutput = true
		}
		if d == "@elicit" {
			foundElicit = true
		}
	}
	if !foundOutput {
		t.Error("expected @output in directives_used")
	}
	if !foundElicit {
		t.Error("expected @elicit in directives_used")
	}
}

func TestSummarizeEmptyDirectives(t *testing.T) {
	md := `# Test

## STEP 1: Do

Just content, no directives.
`

	result := ParsePlaybook(md)
	if result.Definition == nil {
		t.Fatalf("expected definition; errors: %v", result.Errors)
	}

	summary := SummarizePlaybook(result.Definition)

	if summary.DirectivesUsed == nil {
		t.Error("expected directives_used to be non-nil (empty slice)")
	}
	if len(summary.DirectivesUsed) != 0 {
		t.Errorf("expected 0 directives_used, got %d", len(summary.DirectivesUsed))
	}
}
