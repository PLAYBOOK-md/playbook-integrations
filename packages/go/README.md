# playbook

[![Go Reference](https://pkg.go.dev/badge/github.com/PLAYBOOK-MD/playbook-integrations/packages/go.svg)](https://pkg.go.dev/github.com/PLAYBOOK-MD/playbook-integrations/packages/go)

Go parser, validator, and summarizer for [PLAYBOOK.md](https://playbook.style) — an open specification for multi-step AI workflows written in plain markdown.

## Install

```bash
go get github.com/PLAYBOOK-MD/playbook-integrations/packages/go
```

## Usage

```go
package main

import (
	"fmt"
	playbook "github.com/PLAYBOOK-MD/playbook-integrations/packages/go"
)

func main() {
	md := `# My Playbook

A simple workflow.

## INPUTS

- ` + "`topic`" + ` (string): Subject to research

## STEP 1: Research

Find key facts about {{topic}}.

## STEP 2: Summarize

Write a summary of the research above.
`

	result := playbook.ParsePlaybook(md)
	if result.Definition != nil {
		fmt.Println(result.Definition.Title)
		fmt.Printf("%d steps\n", len(result.Definition.Steps))
	}

	validation := playbook.ValidatePlaybook(md)
	fmt.Printf("Valid: %v\n", validation.Valid)

	if result.Definition != nil {
		summary := playbook.SummarizePlaybook(result.Definition)
		fmt.Printf("Steps: %v\n", summary.StepTitles)
	}
}
```

## API

- `ParsePlaybook(markdown string) *ParseResult` — Parse a `.playbook.md` file into a structured definition
- `ValidatePlaybook(markdown string) *ValidationResult` — Semantic validation (variable scoping, output shadowing, branch conditions)
- `SummarizePlaybook(def *PlaybookDefinition) *PlaybookSummary` — Compact summary of a parsed playbook
- `PlaybookToJSON(markdown string) (string, error)` — Convert playbook markdown to JSON

## Links

- [Specification](https://github.com/PLAYBOOK-MD/playbook-spec)
- [Documentation](https://docs.playbook.style)
- [Playground](https://playground.playbook.style)
