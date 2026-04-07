"""
PLAYBOOK.md Parser Types

Dataclass-based type definitions mirroring the TypeScript types
from the core package.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

VariableType = Literal["string", "text", "number", "boolean", "enum"]

ArtifactType = Literal[
    "markdown", "json", "mermaid", "chartjs", "html_css", "javascript", "typescript"
]

# ---------------------------------------------------------------------------
# Input definitions
# ---------------------------------------------------------------------------


@dataclass
class InputDef:
    name: str
    type: VariableType
    required: bool
    default: Optional[str] = None
    options: Optional[list[str]] = None
    description: Optional[str] = None
    line: Optional[int] = None
    """Line number in source (1-based)."""


# ---------------------------------------------------------------------------
# Directives
# ---------------------------------------------------------------------------


@dataclass
class PromptReference:
    prompt_id: str


@dataclass
class ElicitationDef:
    type: Literal["input", "confirm", "select"]
    prompt: str
    options: Optional[list[str]] = None


@dataclass
class StepToolCall:
    connection_name: str
    tool_name: str
    arguments: Optional[str] = None


# ---------------------------------------------------------------------------
# Branching
# ---------------------------------------------------------------------------


@dataclass
class Condition:
    variable: str
    operator: Literal["==", "!="]
    value: str
    source: Literal["input", "step_output"]


@dataclass
class Branch:
    condition: Optional[Condition]
    steps: list[Step] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


@dataclass
class Step:
    number: int
    label: str
    title: str
    content: str
    is_branching: bool = False
    prompt_ref: Optional[PromptReference] = None
    output_var: Optional[str] = None
    extract_field: Optional[str] = None
    elicitation: Optional[ElicitationDef] = None
    tool_call: Optional[StepToolCall] = None
    branches: Optional[list[Branch]] = None
    line: Optional[int] = None
    """Line number of the step heading (1-based)."""


# ---------------------------------------------------------------------------
# Playbook definition
# ---------------------------------------------------------------------------


@dataclass
class PlaybookDefinition:
    title: str
    inputs: list[InputDef] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    artifact_type: Optional[ArtifactType] = None


# ---------------------------------------------------------------------------
# Parse results
# ---------------------------------------------------------------------------


@dataclass
class ParseWarning:
    message: str
    line: Optional[int] = None


@dataclass
class ParseError:
    message: str
    line: Optional[int] = None


@dataclass
class ParseResult:
    definition: Optional[PlaybookDefinition]
    warnings: list[ParseWarning] = field(default_factory=list)
    errors: list[ParseError] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@dataclass
class ValidationResult:
    valid: bool
    fatal_errors: list[ParseError] = field(default_factory=list)
    warnings: list[ParseWarning] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


@dataclass
class PlaybookSummary:
    title: str
    input_count: int
    step_count: int
    step_titles: list[str]
    has_branching: bool
    has_elicitation: bool
    has_tool_calls: bool
    directives_used: list[str]
    description: Optional[str] = None
    artifact_type: Optional[str] = None
