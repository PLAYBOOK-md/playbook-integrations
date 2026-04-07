# playbook-md

Parser, validator, and summarizer for [PLAYBOOK.md](https://playbook.style) files — multi-step AI workflows written in plain markdown.

## Installation

```bash
pip install playbook-md
```

## Quick start

```python
from playbook_md import parse_playbook, validate_playbook, summarize_playbook

markdown = open("my-workflow.playbook.md").read()

# Parse
result = parse_playbook(markdown)
if result.definition:
    print(f"Playbook: {result.definition.title}")
    print(f"Steps: {len(result.definition.steps)}")

# Validate
validation = validate_playbook(markdown)
if validation.valid:
    print("Playbook is valid!")
else:
    for err in validation.fatal_errors:
        print(f"Error: {err.message}")

# Summarize
if result.definition:
    summary = summarize_playbook(result.definition)
    print(f"Inputs: {summary.input_count}, Steps: {summary.step_count}")
```

## API

- `parse_playbook(markdown: str) -> ParseResult` — Parse a PLAYBOOK.md string into a structured definition.
- `validate_playbook(markdown: str) -> ValidationResult` — Parse and semantically validate a PLAYBOOK.md string.
- `summarize_playbook(definition: PlaybookDefinition) -> PlaybookSummary` — Generate a compact summary of a parsed playbook.
- `playbook_to_json(markdown: str) -> str` — Parse a PLAYBOOK.md string and return the definition as JSON.
- `json_to_playbook(json_str: str) -> str` — (Not yet implemented) Convert JSON back to PLAYBOOK.md markdown.

## Requirements

- Python 3.10+
- Zero external dependencies (stdlib only)

## License

MIT
