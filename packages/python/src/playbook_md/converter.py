"""
PLAYBOOK.md Converter

Utility functions for converting between PLAYBOOK.md markdown and JSON.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from .parser import parse_playbook


def _strip_none(obj: object) -> object:
    """Recursively remove keys with None values from dicts, matching the
    TypeScript behaviour where undefined fields are omitted from JSON."""
    if isinstance(obj, dict):
        return {k: _strip_none(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_strip_none(item) for item in obj]
    return obj


def playbook_to_json(markdown: str) -> str:
    """Parse a PLAYBOOK.md string and return the definition as JSON.

    Args:
        markdown: The raw PLAYBOOK.md markdown content.

    Returns:
        A JSON string of the parse result (definition + warnings + errors).

    Raises:
        ValueError: If parsing produces no definition and there are errors.
    """
    result = parse_playbook(markdown)
    raw = asdict(result)
    cleaned = _strip_none(raw)
    return json.dumps(cleaned, indent=2, ensure_ascii=False)


def json_to_playbook(json_str: str) -> str:
    """Convert a JSON playbook definition back to PLAYBOOK.md markdown.

    Args:
        json_str: A JSON string representing a playbook definition.

    Returns:
        A PLAYBOOK.md markdown string.

    Raises:
        NotImplementedError: This function is not yet implemented.
    """
    raise NotImplementedError(
        "json_to_playbook is not yet implemented. "
        "Contributions welcome at https://github.com/PLAYBOOK-MD/playbook-integrations"
    )
