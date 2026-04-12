package playbook

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------------------
// Regex patterns from the spec
// ---------------------------------------------------------------------------

var (
	reTitle   = regexp.MustCompile(`^#\s+(.+)$`)
	reSection = regexp.MustCompile(`^##\s+(.+)$`)
	reStep    = regexp.MustCompile(`^##\s+STEP\s+(\d+):\s+(.+)$`)
	reSubstep = regexp.MustCompile(`^###\s+STEP\s+(\d+[a-z]):\s+(.+)$`)
	reSystem  = regexp.MustCompile(`(?i)^SYSTEM(?:\s+PROMPT)?$`)
	reInputs  = regexp.MustCompile(`(?i)^INPUTS$`)
	reArtifactsSection = regexp.MustCompile(`(?i)^ARTIFACTS$`)

	// Input line: - `name` (type_spec): Description
	reInputLine = regexp.MustCompile(`^-\s+` + "`" + `([a-zA-Z][a-zA-Z0-9_]*)` + "`" + `\s+\(([^)]+)\)(?::\s*(.+))?$`)

	// Directives
	reOutput = regexp.MustCompile(`^@output\((\w+)(?:\s*:\s*(\w+))?((?:,\s*"[^"]*")*)?(?:,\s*extract:"(\w+)")?\)\s*$`)
	reElicit = regexp.MustCompile(`^@elicit\((\w+)(?:,\s*(.+))?\)\s*$`)
	rePrompt = regexp.MustCompile(`^@prompt\(library:([a-zA-Z0-9-]+)\)\s*$`)
	reTool   = regexp.MustCompile(`^@tool\((.+)\)\s*$`)

	// Branch markers
	reIf    = regexp.MustCompile(`^` + "```" + `if\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*` + "```" + `$`)
	reElif  = regexp.MustCompile(`^` + "```" + `elif\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*` + "```" + `$`)
	reElse  = regexp.MustCompile(`^` + "```" + `else` + "```" + `$`)
	reEndif = regexp.MustCompile(`^` + "```" + `endif` + "```" + `$`)

	// Artifact type line
	reArtifactType = regexp.MustCompile(`^type:\s*(.+)$`)
)

var validArtifactTypes = map[ArtifactType]bool{
	ArtifactMarkdown:   true,
	ArtifactJSON:       true,
	ArtifactMermaid:    true,
	ArtifactChartJS:    true,
	ArtifactHTMLCSS:    true,
	ArtifactJavaScript: true,
	ArtifactTypeScript: true,
}

var typeAliases = map[string]VariableType{
	"string":  VariableTypeString,
	"text":    VariableTypeText,
	"number":  VariableTypeNumber,
	"num":     VariableTypeNumber,
	"int":     VariableTypeNumber,
	"float":   VariableTypeNumber,
	"boolean": VariableTypeBoolean,
	"bool":    VariableTypeBoolean,
	"enum":    VariableTypeEnum,
	"select":  VariableTypeEnum,
	"choice":  VariableTypeEnum,
	"json":    VariableTypeJSON,
}

// ---------------------------------------------------------------------------
// Section identification
// ---------------------------------------------------------------------------

type sectionType int

const (
	sectionTitle       sectionType = iota
	sectionDescription sectionType = iota
	sectionSystem      sectionType = iota
	sectionInputs      sectionType = iota
	sectionStep        sectionType = iota
	sectionArtifacts   sectionType = iota
	sectionUnknown     sectionType = iota
)

type section struct {
	typ              sectionType
	heading          string
	startLine        int // 1-based line number of the heading
	contentStartLine int // 1-based line number of first content line
	lines            []string
	stepNumber       int
	stepTitle        string
}

type identifyResult struct {
	sections         []section
	titleLine        int
	title            string
	descriptionLines []string
	descStartLine    int
}

func identifySections(lines []string) identifyResult {
	var title string
	titleLine := -1
	var descriptionLines []string
	descStartLine := -1
	var sections []section
	var currentSection *section

	for i, line := range lines {
		lineNum := i + 1

		// Check for title (first # heading)
		if title == "" {
			if m := reTitle.FindStringSubmatch(line); m != nil {
				// Make sure it's not a ## heading
				if !strings.HasPrefix(line, "## ") {
					title = strings.TrimSpace(m[1])
					titleLine = lineNum
					continue
				}
			}
		}

		// Check for ## section headings
		if m := reSection.FindStringSubmatch(line); m != nil {
			// Save previous section
			if currentSection != nil {
				sections = append(sections, *currentSection)
			}

			heading := strings.TrimSpace(m[1])

			// Determine section type
			if sm := reStep.FindStringSubmatch(line); sm != nil {
				num, _ := strconv.Atoi(sm[1])
				currentSection = &section{
					typ:              sectionStep,
					heading:          heading,
					startLine:        lineNum,
					contentStartLine: lineNum + 1,
					stepNumber:       num,
					stepTitle:        strings.TrimSpace(sm[2]),
				}
			} else if reSystem.MatchString(heading) {
				currentSection = &section{
					typ:              sectionSystem,
					heading:          heading,
					startLine:        lineNum,
					contentStartLine: lineNum + 1,
				}
			} else if reInputs.MatchString(heading) {
				currentSection = &section{
					typ:              sectionInputs,
					heading:          heading,
					startLine:        lineNum,
					contentStartLine: lineNum + 1,
				}
			} else if reArtifactsSection.MatchString(heading) {
				currentSection = &section{
					typ:              sectionArtifacts,
					heading:          heading,
					startLine:        lineNum,
					contentStartLine: lineNum + 1,
				}
			} else {
				currentSection = &section{
					typ:              sectionUnknown,
					heading:          heading,
					startLine:        lineNum,
					contentStartLine: lineNum + 1,
				}
			}
			continue
		}

		// If we have a title but no section yet, these are description lines
		if title != "" && currentSection == nil {
			if descStartLine == -1 && strings.TrimSpace(line) != "" {
				descStartLine = lineNum
			}
			descriptionLines = append(descriptionLines, line)
			continue
		}

		// Accumulate content into current section
		if currentSection != nil {
			currentSection.lines = append(currentSection.lines, line)
		}
	}

	// Push last section
	if currentSection != nil {
		sections = append(sections, *currentSection)
	}

	return identifyResult{
		sections:         sections,
		titleLine:        titleLine,
		title:            title,
		descriptionLines: descriptionLines,
		descStartLine:    descStartLine,
	}
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

func parseInputs(lines []string, startLine int, warnings *[]ParseWarning, errors *[]ParseError) []InputDef {
	var inputs []InputDef
	seenNames := make(map[string]bool)

	for i, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		lineNum := startLine + i

		if line == "" {
			continue
		}

		// Must start with - or * to be an input line
		if !strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "*") {
			continue
		}

		m := reInputLine.FindStringSubmatch(line)
		if m == nil {
			// Line starts with - but doesn't match format
			if strings.HasPrefix(line, "-") || strings.HasPrefix(line, "*") {
				*warnings = append(*warnings, ParseWarning{Line: lineNum, Message: fmt.Sprintf("Malformed input line: %q", line)})
			}
			continue
		}

		name := m[1]
		typeSpec := strings.TrimSpace(m[2])
		description := ""
		if m[3] != "" {
			description = strings.TrimSpace(m[3])
		}

		// Check for duplicate names
		if seenNames[name] {
			*errors = append(*errors, ParseError{Line: lineNum, Message: fmt.Sprintf("Duplicate input name: %q", name)})
			continue
		}
		seenNames[name] = true

		// Parse type spec: "type" or "type: value" or "enum: opt1, opt2, ..."
		colonIdx := strings.Index(typeSpec, ":")
		var rawType string
		var rawValue string
		hasValue := false

		if colonIdx != -1 {
			rawType = strings.TrimSpace(typeSpec[:colonIdx])
			rawValue = strings.TrimSpace(typeSpec[colonIdx+1:])
			hasValue = true
		} else {
			rawType = strings.TrimSpace(typeSpec)
		}

		// Resolve type
		resolvedType, ok := typeAliases[strings.ToLower(rawType)]
		if !ok {
			resolvedType = VariableTypeString
		}

		input := InputDef{
			Name:        name,
			Type:        resolvedType,
			Required:    true,
			Description: description,
			Line:        lineNum,
		}

		if resolvedType == VariableTypeEnum && hasValue && rawValue != "" {
			parts := strings.Split(rawValue, ",")
			var options []string
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" {
					options = append(options, p)
				}
			}
			input.Options = options
			input.Required = false // enums have predefined options
		} else if hasValue {
			input.Default = rawValue
			input.Required = false
		}

		inputs = append(inputs, input)
	}

	return inputs
}

// ---------------------------------------------------------------------------
// Directive extraction
// ---------------------------------------------------------------------------

type directiveResult struct {
	outputVar     string
	outputType    VariableType
	outputOptions []string
	extractField  string
	elicitation   *ElicitationDef
	toolCall      *StepToolCall
	promptRef     *PromptReference
	contentLines  []string
}

var reEnumValue = regexp.MustCompile(`,\s*"([^"]*)"`)


func parseQuotedStrings(s string) []string {
	re := regexp.MustCompile(`"([^"]*)"`)
	matches := re.FindAllStringSubmatch(s, -1)
	var results []string
	for _, m := range matches {
		results = append(results, m[1])
	}
	return results
}

func extractDirectives(lines []string, startLine int, warnings *[]ParseWarning) directiveResult {
	result := directiveResult{}

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		lineNum := startLine + i

		// @output
		if m := reOutput.FindStringSubmatch(trimmed); m != nil {
			result.outputVar = m[1]
			if m[2] != "" {
				rawType := strings.ToLower(m[2])
				if resolved, ok := typeAliases[rawType]; ok {
					result.outputType = resolved
				} else {
					result.outputType = VariableTypeString
				}
			}
			if m[3] != "" {
				// Parse enum values from repeated `, "value"` patterns
				enumMatches := reEnumValue.FindAllStringSubmatch(m[3], -1)
				for _, em := range enumMatches {
					result.outputOptions = append(result.outputOptions, em[1])
				}
			}
			if m[4] != "" {
				result.extractField = m[4]
			}
			continue
		}

		// @elicit
		if m := reElicit.FindStringSubmatch(trimmed); m != nil {
			elicitType := strings.ToLower(m[1])
			validTypes := map[string]bool{"input": true, "confirm": true, "select": true}
			if !validTypes[elicitType] {
				*warnings = append(*warnings, ParseWarning{Line: lineNum, Message: fmt.Sprintf("Invalid elicit type: %q", elicitType)})
				result.contentLines = append(result.contentLines, line)
				continue
			}
			args := m[2]
			quoted := parseQuotedStrings(args)
			prompt := ""
			if len(quoted) > 0 {
				prompt = quoted[0]
			}
			elicit := &ElicitationDef{
				Type:   elicitType,
				Prompt: prompt,
			}
			if len(quoted) > 1 {
				elicit.Options = quoted[1:]
			}
			result.elicitation = elicit
			continue
		}

		// @prompt
		if m := rePrompt.FindStringSubmatch(trimmed); m != nil {
			result.promptRef = &PromptReference{PromptID: m[1]}
			continue
		}

		// @tool
		if m := reTool.FindStringSubmatch(trimmed); m != nil {
			toolArgs := m[1]
			parts := splitToolArgs(toolArgs)
			if len(parts) >= 2 {
				connName := strings.Trim(strings.TrimSpace(parts[0]), `"`)
				toolName := strings.Trim(strings.TrimSpace(parts[1]), `"`)
				tc := &StepToolCall{
					ConnectionName: connName,
					ToolName:       toolName,
				}
				if len(parts) > 2 {
					jsonArgs := strings.TrimSpace(parts[2])
					if jsonArgs != "" {
						tc.Arguments = jsonArgs
					}
				}
				result.toolCall = tc
			}
			continue
		}

		// Regular content line
		result.contentLines = append(result.contentLines, line)
	}

	return result
}

func splitToolArgs(s string) []string {
	// Split on commas, but respect JSON braces and quoted strings
	var parts []string
	depth := 0
	inQuote := false
	var current strings.Builder

	for i := 0; i < len(s); i++ {
		ch := s[i]

		if ch == '"' && (i == 0 || s[i-1] != '\\') {
			inQuote = !inQuote
		}

		if !inQuote {
			if ch == '{' {
				depth++
			}
			if ch == '}' {
				depth--
			}

			if ch == ',' && depth == 0 && len(parts) < 2 {
				parts = append(parts, current.String())
				current.Reset()
				continue
			}
		}

		current.WriteByte(ch)
	}

	if current.Len() > 0 {
		parts = append(parts, current.String())
	}

	return parts
}

// ---------------------------------------------------------------------------
// Branch parsing
// ---------------------------------------------------------------------------

type branchParseResult struct {
	branches      []Branch
	contentBefore []string
	hasBranches   bool
}

type rawBranch struct {
	condition *Condition
	lines     []string
	startLine int
}

func parseBranches(
	lines []string,
	startLine int,
	parentStepNumber int,
	inputNames map[string]bool,
	outputNames map[string]bool,
	warnings *[]ParseWarning,
) branchParseResult {
	var contentBefore []string
	var branches []Branch
	var currentBranch *rawBranch
	hasBranches := false
	inBranch := false
	letterIndex := 0

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		lineNum := startLine + i

		// Check for branch markers
		if m := reIf.FindStringSubmatch(trimmed); m != nil {
			hasBranches = true
			inBranch = true
			variable := m[1]
			operator := m[2]
			value := m[3]

			// Check if variable is declared
			source := "input"
			if inputNames[variable] {
				source = "input"
			} else if outputNames[variable] {
				source = "step_output"
			}

			if !inputNames[variable] && !outputNames[variable] {
				*warnings = append(*warnings, ParseWarning{Line: lineNum, Message: fmt.Sprintf("Undeclared branch variable: %q", variable)})
			}

			if currentBranch != nil {
				branches = append(branches, finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings))
				letterIndex++
			}

			currentBranch = &rawBranch{
				condition: &Condition{Variable: variable, Operator: operator, Value: value, Source: source},
				startLine: lineNum + 1,
			}
			continue
		}

		if m := reElif.FindStringSubmatch(trimmed); m != nil {
			variable := m[1]
			operator := m[2]
			value := m[3]

			source := "input"
			if inputNames[variable] {
				source = "input"
			} else if outputNames[variable] {
				source = "step_output"
			}

			if !inputNames[variable] && !outputNames[variable] {
				*warnings = append(*warnings, ParseWarning{Line: lineNum, Message: fmt.Sprintf("Undeclared branch variable: %q", variable)})
			}

			if currentBranch != nil {
				branches = append(branches, finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings))
				letterIndex++
			}

			currentBranch = &rawBranch{
				condition: &Condition{Variable: variable, Operator: operator, Value: value, Source: source},
				startLine: lineNum + 1,
			}
			continue
		}

		if reElse.MatchString(trimmed) {
			if currentBranch != nil {
				branches = append(branches, finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings))
				letterIndex++
			}

			currentBranch = &rawBranch{
				condition: nil,
				startLine: lineNum + 1,
			}
			continue
		}

		if reEndif.MatchString(trimmed) {
			if currentBranch != nil {
				branches = append(branches, finalizeBranch(currentBranch, parentStepNumber, letterIndex, warnings))
				letterIndex++
			}
			currentBranch = nil
			inBranch = false
			continue
		}

		// Regular content
		if inBranch && currentBranch != nil {
			currentBranch.lines = append(currentBranch.lines, line)
		} else if !inBranch {
			contentBefore = append(contentBefore, line)
		}
	}

	return branchParseResult{
		branches:      branches,
		contentBefore: contentBefore,
		hasBranches:   hasBranches,
	}
}

func finalizeBranch(raw *rawBranch, parentStepNumber int, letterIndex int, warnings *[]ParseWarning) Branch {
	letter := string(rune('a' + letterIndex))
	var steps []Step

	// Look for ### STEP sub-headings within the branch
	type rawSubStep struct {
		number    int
		label     string
		title     string
		lines     []string
		startLine int
	}

	var currentSubStep *rawSubStep

	for i, line := range raw.lines {
		trimmed := strings.TrimSpace(line)
		lineNum := raw.startLine + i

		if m := reSubstep.FindStringSubmatch(trimmed); m != nil {
			if currentSubStep != nil {
				steps = append(steps, buildSubStep(currentSubStep.number, currentSubStep.label, currentSubStep.title, currentSubStep.lines, currentSubStep.startLine, warnings))
			}
			currentSubStep = &rawSubStep{
				number:    parentStepNumber,
				label:     m[1],
				title:     strings.TrimSpace(m[2]),
				startLine: lineNum,
			}
			continue
		}

		if currentSubStep != nil {
			currentSubStep.lines = append(currentSubStep.lines, line)
		}
	}

	if currentSubStep != nil {
		steps = append(steps, buildSubStep(currentSubStep.number, currentSubStep.label, currentSubStep.title, currentSubStep.lines, currentSubStep.startLine, warnings))
	}

	// If no sub-steps found, create a synthetic sub-step from the branch content
	if len(steps) == 0 {
		content := strings.TrimSpace(strings.Join(raw.lines, "\n"))
		if content != "" {
			steps = append(steps, Step{
				Number:      parentStepNumber,
				Label:       fmt.Sprintf("%d%s", parentStepNumber, letter),
				Title:       fmt.Sprintf("Branch %s", letter),
				Content:     content,
				IsBranching: false,
				Line:        raw.startLine,
			})
		}
	}

	return Branch{
		Condition: raw.condition,
		Steps:     steps,
	}
}

func buildSubStep(number int, label string, title string, lines []string, startLine int, warnings *[]ParseWarning) Step {
	directives := extractDirectives(lines, startLine+1, warnings)
	content := strings.TrimSpace(strings.Join(directives.contentLines, "\n"))

	step := Step{
		Number:      number,
		Label:       label,
		Title:       title,
		Content:     content,
		IsBranching: false,
		Line:        startLine,
	}
	if directives.outputVar != "" {
		step.OutputVar = directives.outputVar
	}
	if directives.outputType != "" {
		step.OutputType = directives.outputType
	}
	if len(directives.outputOptions) > 0 {
		step.OutputOptions = directives.outputOptions
	}
	if directives.extractField != "" {
		step.ExtractField = directives.extractField
	}
	if directives.elicitation != nil {
		step.Elicitation = directives.elicitation
	}
	if directives.toolCall != nil {
		step.ToolCall = directives.toolCall
	}
	if directives.promptRef != nil {
		step.PromptRef = directives.promptRef
	}

	return step
}

// ---------------------------------------------------------------------------
// Artifact parsing
// ---------------------------------------------------------------------------

var reDynamicVar = regexp.MustCompile(`^\{\{(\w+)\}\}$`)

func parseArtifacts(lines []string, startLine int, warnings *[]ParseWarning) ArtifactType {
	for i, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		lineNum := startLine + i

		if m := reArtifactType.FindStringSubmatch(line); m != nil {
			raw := strings.TrimSpace(m[1])
			lower := strings.ToLower(raw)
			at := ArtifactType(lower)
			if validArtifactTypes[at] {
				return at
			}
			// Check for dynamic variable reference like {{output_format}}
			if reDynamicVar.MatchString(raw) {
				return ArtifactType(raw)
			}
			*warnings = append(*warnings, ParseWarning{Line: lineNum, Message: fmt.Sprintf("Unknown artifact type: %q", lower)})
			return at
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

// ParsePlaybook parses a PLAYBOOK.md markdown string into a structured ParseResult.
func ParsePlaybook(markdown string) *ParseResult {
	var warnings []ParseWarning
	var errors []ParseError

	// Size check (byte length)
	if len(markdown) > 200000 {
		errors = append(errors, ParseError{Message: "Document exceeds 200KB size limit"})
		return &ParseResult{Definition: nil, Warnings: warnings, Errors: errors}
	}

	// Empty check
	if strings.TrimSpace(markdown) == "" {
		errors = append(errors, ParseError{Message: "Document is empty"})
		return &ParseResult{Definition: nil, Warnings: warnings, Errors: errors}
	}

	lines := strings.Split(markdown, "\n")
	result := identifySections(lines)

	// Title required
	if result.title == "" {
		errors = append(errors, ParseError{Message: "No title found. A playbook must start with a # heading."})
		return &ParseResult{Definition: nil, Warnings: warnings, Errors: errors}
	}

	// Process sections
	var systemPrompt string
	var inputs []InputDef
	var artifactType ArtifactType
	var steps []Step

	// Collect input and output names for branch variable checking
	inputNames := make(map[string]bool)
	outputNames := make(map[string]bool)

	// First pass: parse inputs (needed for branch variable checking)
	for _, sec := range result.sections {
		if sec.typ == sectionInputs {
			inputs = parseInputs(sec.lines, sec.contentStartLine, &warnings, &errors)
			for _, input := range inputs {
				inputNames[input.Name] = true
			}
		}
	}

	// Check for fatal duplicate input error
	hasDuplicateError := false
	for _, e := range errors {
		if strings.HasPrefix(e.Message, "Duplicate input name") {
			hasDuplicateError = true
			break
		}
	}
	if hasDuplicateError {
		return &ParseResult{Definition: nil, Warnings: warnings, Errors: errors}
	}

	// Second pass: parse all other sections
	for _, sec := range result.sections {
		if sec.typ == sectionSystem {
			systemPrompt = strings.TrimSpace(strings.Join(sec.lines, "\n"))
		}

		if sec.typ == sectionStep {
			stepNumber := sec.stepNumber
			stepTitle := sec.stepTitle

			// Parse branches first
			branchResult := parseBranches(
				sec.lines,
				sec.contentStartLine,
				stepNumber,
				inputNames,
				outputNames,
				&warnings,
			)

			// Extract directives from non-branch content
			directives := extractDirectives(
				branchResult.contentBefore,
				sec.contentStartLine,
				&warnings,
			)

			content := strings.TrimSpace(strings.Join(directives.contentLines, "\n"))

			// Track output names for later branch variable checking
			if directives.outputVar != "" {
				outputNames[directives.outputVar] = true
			}

			// Also track output names from branch sub-steps
			if branchResult.hasBranches {
				for _, branch := range branchResult.branches {
					for _, subStep := range branch.Steps {
						if subStep.OutputVar != "" {
							outputNames[subStep.OutputVar] = true
						}
					}
				}
			}

			step := Step{
				Number:      stepNumber,
				Label:       strconv.Itoa(stepNumber),
				Title:       stepTitle,
				Content:     content,
				IsBranching: branchResult.hasBranches,
				Line:        sec.startLine,
			}
			if directives.outputVar != "" {
				step.OutputVar = directives.outputVar
			}
			if directives.outputType != "" {
				step.OutputType = directives.outputType
			}
			if len(directives.outputOptions) > 0 {
				step.OutputOptions = directives.outputOptions
			}
			if directives.extractField != "" {
				step.ExtractField = directives.extractField
			}
			if directives.elicitation != nil {
				step.Elicitation = directives.elicitation
			}
			if directives.toolCall != nil {
				step.ToolCall = directives.toolCall
			}
			if directives.promptRef != nil {
				step.PromptRef = directives.promptRef
			}
			if branchResult.hasBranches {
				step.Branches = branchResult.branches
			}

			steps = append(steps, step)
		}

		if sec.typ == sectionArtifacts {
			artifactType = parseArtifacts(sec.lines, sec.contentStartLine, &warnings)
		}
	}

	// No steps = fatal
	if len(steps) == 0 {
		errors = append(errors, ParseError{Message: "No steps found. A playbook must have at least one ## STEP N: Title."})
		return &ParseResult{Definition: nil, Warnings: warnings, Errors: errors}
	}

	// Check sequential numbering
	for i, step := range steps {
		if step.Number != i+1 {
			warnings = append(warnings, ParseWarning{
				Line:    step.Line,
				Message: fmt.Sprintf("Non-sequential step number: expected %d, found %d", i+1, step.Number),
			})
			break
		}
	}

	// Build description
	description := strings.TrimSpace(strings.Join(result.descriptionLines, "\n"))

	// Ensure inputs is non-nil
	if inputs == nil {
		inputs = []InputDef{}
	}

	definition := &PlaybookDefinition{
		Title:       result.title,
		Description: description,
		Inputs:      inputs,
		Steps:       steps,
	}
	if systemPrompt != "" {
		definition.SystemPrompt = systemPrompt
	}
	if artifactType != "" {
		definition.ArtifactType = artifactType
	}

	return &ParseResult{Definition: definition, Warnings: warnings, Errors: errors}
}
