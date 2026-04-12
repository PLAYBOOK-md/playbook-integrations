package playbook

import (
	"fmt"
	"regexp"
	"strings"
)

var reInterpolation = regexp.MustCompile(`\{\{(\w+)(?::\w+(?::[^}]*)?)?}}`)

// collectInterpolations returns all {{variable}} references from a string.
func collectInterpolations(text string) []string {
	matches := reInterpolation.FindAllStringSubmatch(text, -1)
	var names []string
	for _, m := range matches {
		names = append(names, m[1])
	}
	return names
}

// validateDefinition performs semantic validation on a parsed PlaybookDefinition.
func validateDefinition(def *PlaybookDefinition) *ValidationResult {
	var fatalErrors []ParseError
	var warnings []ParseWarning

	inputNames := make(map[string]bool)
	for _, input := range def.Inputs {
		inputNames[input.Name] = true
	}

	// Track which @output variables are available at each point in execution.
	// We walk steps in order; an @output from step N is available in step N+1 onward.
	outputsBefore := make([]map[string]bool, len(def.Steps))
	allOutputs := make(map[string]bool)

	// First pass: collect outputs in execution order
	for i, step := range def.Steps {
		outputsBefore[i] = copySet(allOutputs)

		if step.OutputVar != "" {
			allOutputs[step.OutputVar] = true
		}

		// Also collect outputs from branch sub-steps
		if len(step.Branches) > 0 {
			for _, branch := range step.Branches {
				for _, subStep := range branch.Steps {
					if subStep.OutputVar != "" {
						allOutputs[subStep.OutputVar] = true
					}
				}
			}
		}
	}

	// Check 1: @output variable names must not shadow input names
	for _, step := range def.Steps {
		if step.OutputVar != "" && inputNames[step.OutputVar] {
			fatalErrors = append(fatalErrors, ParseError{
				Line:    step.Line,
				Message: fmt.Sprintf("@output variable %q in step %d shadows an input name", step.OutputVar, step.Number),
			})
		}

		if len(step.Branches) > 0 {
			for _, branch := range step.Branches {
				for _, subStep := range branch.Steps {
					if subStep.OutputVar != "" && inputNames[subStep.OutputVar] {
						fatalErrors = append(fatalErrors, ParseError{
							Line:    subStep.Line,
							Message: fmt.Sprintf("@output variable %q in sub-step %s shadows an input name", subStep.OutputVar, subStep.Label),
						})
					}
				}
			}
		}
	}

	// Check 2: Verify {{variable}} interpolations reference declared inputs or prior @output vars
	for i, step := range def.Steps {
		availableOutputs := outputsBefore[i]

		checkInterpolations(step.Content, &step, inputNames, availableOutputs, &warnings)

		// Check branch sub-step content
		if len(step.Branches) > 0 {
			for _, branch := range step.Branches {
				for j := range branch.Steps {
					subStep := &branch.Steps[j]
					checkInterpolations(subStep.Content, subStep, inputNames, availableOutputs, &warnings)
				}
			}
		}

		// Check @tool arguments for interpolations
		if step.ToolCall != nil && step.ToolCall.Arguments != "" {
			refs := collectInterpolations(step.ToolCall.Arguments)
			for _, name := range refs {
				if !inputNames[name] && !availableOutputs[name] {
					warnings = append(warnings, ParseWarning{
						Line:    step.Line,
						Message: fmt.Sprintf("Step %d @tool argument references undeclared variable \"{{%s}}\"", step.Number, name),
					})
				}
			}
		}
	}

	// Check 3: Verify branch conditions reference variables that exist at that point
	for i, step := range def.Steps {
		availableOutputs := outputsBefore[i]

		if len(step.Branches) > 0 {
			for _, branch := range step.Branches {
				if branch.Condition != nil {
					varName := branch.Condition.Variable
					if !inputNames[varName] && !availableOutputs[varName] {
						warnings = append(warnings, ParseWarning{
							Line:    step.Line,
							Message: fmt.Sprintf("Branch condition in step %d references undeclared variable %q", step.Number, varName),
						})
					}
				}
			}
		}
	}

	// Check 4: Verify artifact type is valid
	if def.ArtifactType != "" && !validArtifactTypes[def.ArtifactType] {
		// Check if it's a dynamic variable reference like {{output_format}}
		if dm := reDynamicVar.FindStringSubmatch(string(def.ArtifactType)); dm != nil {
			varName := dm[1]
			if !inputNames[varName] && !allOutputs[varName] {
				warnings = append(warnings, ParseWarning{
					Message: fmt.Sprintf("Artifact type references undeclared variable \"{{%s}}\"", varName),
				})
			}
		} else {
			warnings = append(warnings, ParseWarning{
				Message: fmt.Sprintf("Unknown artifact type %q. Valid types: %s", def.ArtifactType, strings.Join(validArtifactTypesList(), ", ")),
			})
		}
	}

	return &ValidationResult{
		Valid:       len(fatalErrors) == 0,
		FatalErrors: fatalErrors,
		Warnings:    warnings,
	}
}

func validArtifactTypesList() []string {
	return []string{"markdown", "json", "mermaid", "chartjs", "html_css", "javascript", "typescript"}
}

// checkInterpolations checks {{variable}} interpolations in step content.
func checkInterpolations(content string, step *Step, inputNames map[string]bool, availableOutputs map[string]bool, warnings *[]ParseWarning) {
	refs := collectInterpolations(content)
	for _, name := range refs {
		if !inputNames[name] && !availableOutputs[name] {
			*warnings = append(*warnings, ParseWarning{
				Line:    step.Line,
				Message: fmt.Sprintf("Step %s references undeclared variable \"{{%s}}\"", step.Label, name),
			})
		}
	}
}

func copySet(s map[string]bool) map[string]bool {
	c := make(map[string]bool, len(s))
	for k, v := range s {
		c[k] = v
	}
	return c
}

// ValidatePlaybook parses and validates a PLAYBOOK.md markdown string.
// It runs the parser first, then performs additional semantic validation.
func ValidatePlaybook(markdown string) *ValidationResult {
	parseResult := ParsePlaybook(markdown)

	// If parsing failed, return parser errors as fatal errors
	if parseResult.Definition == nil {
		return &ValidationResult{
			Valid:       false,
			FatalErrors: parseResult.Errors,
			Warnings:    parseResult.Warnings,
		}
	}

	// Run semantic validation on the parsed definition
	validationResult := validateDefinition(parseResult.Definition)

	// Merge parser warnings with validation warnings
	var mergedWarnings []ParseWarning
	mergedWarnings = append(mergedWarnings, parseResult.Warnings...)
	mergedWarnings = append(mergedWarnings, validationResult.Warnings...)

	return &ValidationResult{
		Valid:       len(validationResult.FatalErrors) == 0,
		FatalErrors: validationResult.FatalErrors,
		Warnings:    mergedWarnings,
	}
}
