package playbook

import "sort"

// collectDirectives returns the set of directive names used across all steps and sub-steps.
func collectDirectives(steps []Step) map[string]bool {
	directives := make(map[string]bool)

	var scanStep func(step *Step)
	scanStep = func(step *Step) {
		if step.OutputVar != "" {
			directives["@output"] = true
		}
		if step.Elicitation != nil {
			directives["@elicit"] = true
		}
		if step.PromptRef != nil {
			directives["@prompt"] = true
		}
		if step.ToolCall != nil {
			directives["@tool"] = true
		}

		if len(step.Branches) > 0 {
			for _, branch := range step.Branches {
				for i := range branch.Steps {
					scanStep(&branch.Steps[i])
				}
			}
		}
	}

	for i := range steps {
		scanStep(&steps[i])
	}

	return directives
}

// hasFeature checks if any step or sub-step matches a predicate.
func hasFeature(steps []Step, predicate func(step *Step) bool) bool {
	for i := range steps {
		if predicate(&steps[i]) {
			return true
		}
		if len(steps[i].Branches) > 0 {
			for _, branch := range steps[i].Branches {
				for j := range branch.Steps {
					if predicate(&branch.Steps[j]) {
						return true
					}
				}
			}
		}
	}
	return false
}

// SummarizePlaybook produces a compact summary of a PlaybookDefinition.
func SummarizePlaybook(def *PlaybookDefinition) *PlaybookSummary {
	directives := collectDirectives(def.Steps)

	var directivesList []string
	for d := range directives {
		directivesList = append(directivesList, d)
	}
	sort.Strings(directivesList)

	stepTitles := make([]string, len(def.Steps))
	for i, s := range def.Steps {
		stepTitles[i] = s.Title
	}

	// Ensure non-nil slices for consistent JSON output
	if directivesList == nil {
		directivesList = []string{}
	}

	summary := &PlaybookSummary{
		Title:      def.Title,
		InputCount: len(def.Inputs),
		StepCount:  len(def.Steps),
		StepTitles: stepTitles,
		HasBranching: hasFeature(def.Steps, func(s *Step) bool {
			return s.IsBranching
		}),
		HasElicitation: hasFeature(def.Steps, func(s *Step) bool {
			return s.Elicitation != nil
		}),
		HasToolCalls: hasFeature(def.Steps, func(s *Step) bool {
			return s.ToolCall != nil
		}),
		DirectivesUsed: directivesList,
	}

	if def.Description != "" {
		summary.Description = def.Description
	}
	if def.ArtifactType != "" {
		summary.ArtifactType = string(def.ArtifactType)
	}

	return summary
}
