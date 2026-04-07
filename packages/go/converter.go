package playbook

import (
	"encoding/json"
	"errors"
	"fmt"
)

// PlaybookToJSON parses a PLAYBOOK.md markdown string and returns its JSON representation.
// If parsing produces errors, the first error is returned.
func PlaybookToJSON(markdown string) (string, error) {
	result := ParsePlaybook(markdown)
	if result.Definition == nil {
		if len(result.Errors) > 0 {
			return "", fmt.Errorf("parse error: %s", result.Errors[0].Message)
		}
		return "", errors.New("parse error: unknown error")
	}

	data, err := json.MarshalIndent(result.Definition, "", "  ")
	if err != nil {
		return "", fmt.Errorf("json marshal error: %w", err)
	}

	return string(data), nil
}

// JSONToPlaybook converts a JSON representation back to PLAYBOOK.md markdown.
// This is not yet implemented and will return an error.
func JSONToPlaybook(jsonStr string) (string, error) {
	return "", errors.New("JSONToPlaybook is not yet implemented")
}
