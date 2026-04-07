package playbook

import (
	"strings"
	"testing"
)

func TestValidateUndeclaredVariable(t *testing.T) {
	md := `# Test

## STEP 1: Generate

Use {{unknown_var}} in content.
`

	result := ValidatePlaybook(md)
	found := false
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "undeclared variable") && strings.Contains(w.Message, "unknown_var") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected undeclared variable warning for 'unknown_var'; warnings: %v", result.Warnings)
	}
}

func TestValidateDeclaredInputVariable(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`name`" + ` (string): A name

## STEP 1: Greet

Hello {{name}}!
`

	result := ValidatePlaybook(md)
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "undeclared variable") && strings.Contains(w.Message, "name") {
			t.Errorf("should not warn about declared input variable 'name'; warnings: %v", result.Warnings)
		}
	}
	if !result.Valid {
		t.Errorf("expected valid result; fatal_errors: %v", result.FatalErrors)
	}
}

func TestValidateOutputShadowsInput(t *testing.T) {
	md := `# Test

## INPUTS

- ` + "`result`" + ` (string): A result

## STEP 1: Generate

Generate something.

@output(result)
`

	result := ValidatePlaybook(md)
	if result.Valid {
		t.Error("expected invalid result when output shadows input")
	}
	found := false
	for _, e := range result.FatalErrors {
		if strings.Contains(e.Message, "shadows an input name") && strings.Contains(e.Message, "result") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected shadow error for 'result'; fatal_errors: %v", result.FatalErrors)
	}
}

func TestValidateOutputVariableAvailableInLaterStep(t *testing.T) {
	md := `# Test

## STEP 1: Generate

Generate something.

@output(gen_result)

## STEP 2: Use

Use {{gen_result}} here.
`

	result := ValidatePlaybook(md)
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "undeclared variable") && strings.Contains(w.Message, "gen_result") {
			t.Errorf("should not warn about output variable available from prior step; warnings: %v", result.Warnings)
		}
	}
	if !result.Valid {
		t.Errorf("expected valid result; fatal_errors: %v", result.FatalErrors)
	}
}

func TestValidateValidPlaybookPasses(t *testing.T) {
	md := readTestdata(t, "content-pipeline.playbook.md")
	result := ValidatePlaybook(md)

	if !result.Valid {
		t.Errorf("expected valid playbook; fatal_errors: %v", result.FatalErrors)
	}
	if len(result.FatalErrors) != 0 {
		t.Errorf("expected no fatal errors; got: %v", result.FatalErrors)
	}
}

func TestValidateEmptyDocument(t *testing.T) {
	result := ValidatePlaybook("")
	if result.Valid {
		t.Error("expected invalid result for empty document")
	}
	if len(result.FatalErrors) == 0 {
		t.Error("expected fatal errors for empty document")
	}
}

func TestValidateNoTitle(t *testing.T) {
	md := readTestdata(t, "no-title.playbook.md")
	result := ValidatePlaybook(md)
	if result.Valid {
		t.Error("expected invalid result for no-title document")
	}
}

func TestValidateBranchConditionVariable(t *testing.T) {
	md := `# Test

## STEP 1: Branch

Choose path.

` + "```if undeclared_var==\"yes\"```" + `

Yes path.

` + "```endif```" + `
`

	result := ValidatePlaybook(md)
	found := false
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "undeclared_var") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected warning about undeclared branch variable; warnings: %v", result.Warnings)
	}
}

func TestValidateInvalidArtifactType(t *testing.T) {
	md := `# Test

## STEP 1: Do

Content.

## ARTIFACTS

type: invalid_type
`

	result := ValidatePlaybook(md)
	found := false
	for _, w := range result.Warnings {
		if strings.Contains(w.Message, "Unknown artifact type") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected warning about unknown artifact type; warnings: %v", result.Warnings)
	}
}
