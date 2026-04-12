"""
PLAYBOOK.md Parser

Line-by-line, regex-based parser. No external dependencies.
Follows the PLAYBOOK.md spec v0.1.0.

Ported from the TypeScript implementation in packages/core/src/parser.ts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .types import (
    ArtifactType,
    Branch,
    Condition,
    ElicitationDef,
    InputDef,
    ParseError,
    ParseResult,
    ParseWarning,
    PlaybookDefinition,
    PromptReference,
    Step,
    StepToolCall,
    VariableType,
)

# ---------------------------------------------------------------------------
# Regex patterns from the spec
# ---------------------------------------------------------------------------

RE_TITLE = re.compile(r"^#\s+(.+)$")
RE_SECTION = re.compile(r"^##\s+(.+)$")
RE_STEP = re.compile(r"^##\s+STEP\s+(\d+):\s+(.+)$")
RE_SUBSTEP = re.compile(r"^###\s+STEP\s+(\d+[a-z]):\s+(.+)$")
RE_SYSTEM = re.compile(r"^SYSTEM(?:\s+PROMPT)?$", re.IGNORECASE)
RE_INPUTS = re.compile(r"^INPUTS$", re.IGNORECASE)
RE_ARTIFACTS = re.compile(r"^ARTIFACTS$", re.IGNORECASE)

# Input line: - `name` (type_spec): Description
RE_INPUT_LINE = re.compile(
    r"^-\s+`([a-zA-Z][a-zA-Z0-9_]*)`\s+\(([^)]+)\)(?::\s*(.+))?$"
)

# Directives
RE_OUTPUT = re.compile(r'^@output\((\w+)(?:\s*:\s*(\w+))?((?:,\s*"[^"]*")*)?(?:,\s*extract:"(\w+)")?\)\s*$')
RE_ELICIT = re.compile(r"^@elicit\((\w+)(?:,\s*(.+))?\)\s*$")
RE_PROMPT = re.compile(r"^@prompt\(library:([a-zA-Z0-9-]+)\)\s*$")
RE_TOOL = re.compile(r"^@tool\((.+)\)\s*$")

# Branch markers
RE_IF = re.compile(r'^```if\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*```$')
RE_ELIF = re.compile(r'^```elif\s+(\w+)\s*(==|!=)\s*"([^"]*)"\s*```$')
RE_ELSE = re.compile(r"^```else```$")
RE_ENDIF = re.compile(r"^```endif```$")

# Artifact type line
RE_ARTIFACT_TYPE = re.compile(r"^type:\s*(.+)$")

VALID_ARTIFACT_TYPES: list[str] = [
    "markdown",
    "json",
    "mermaid",
    "chartjs",
    "html_css",
    "javascript",
    "typescript",
]

TYPE_ALIASES: dict[str, VariableType] = {
    "string": "string",
    "text": "text",
    "number": "number",
    "num": "number",
    "int": "number",
    "float": "number",
    "boolean": "boolean",
    "bool": "boolean",
    "enum": "enum",
    "select": "enum",
    "choice": "enum",
    "json": "json",
}

RE_ENUM_VALUE = re.compile(r',\s*"([^"]*)"')


# ---------------------------------------------------------------------------
# Section identification
# ---------------------------------------------------------------------------


@dataclass
class _Section:
    type: str  # 'title' | 'description' | 'system' | 'inputs' | 'step' | 'artifacts' | 'unknown'
    heading: str
    start_line: int  # 1-based line number of the heading
    content_start_line: int  # 1-based line number of first content line
    lines: list[str] = field(default_factory=list)
    step_number: Optional[int] = None
    step_title: Optional[str] = None


@dataclass
class _SectionResult:
    sections: list[_Section]
    title_line: int
    title: str
    description_lines: list[str]
    desc_start_line: int


def _identify_sections(lines: list[str]) -> _SectionResult:
    title = ""
    title_line = -1
    description_lines: list[str] = []
    desc_start_line = -1
    sections: list[_Section] = []
    current_section: Optional[_Section] = None

    for i, line in enumerate(lines):
        line_num = i + 1

        # Check for title (first # heading)
        if not title:
            title_match = RE_TITLE.match(line)
            if title_match:
                # Make sure it's not a ## heading
                if not line.startswith("## "):
                    title = title_match.group(1).strip()
                    title_line = line_num
                    continue

        # Check for ## section headings
        section_match = RE_SECTION.match(line)
        if section_match:
            # Save previous section
            if current_section is not None:
                sections.append(current_section)

            heading = section_match.group(1).strip()

            # Determine section type
            step_match = RE_STEP.match(line)
            if step_match:
                current_section = _Section(
                    type="step",
                    heading=heading,
                    start_line=line_num,
                    content_start_line=line_num + 1,
                    step_number=int(step_match.group(1)),
                    step_title=step_match.group(2).strip(),
                )
            elif RE_SYSTEM.match(heading):
                current_section = _Section(
                    type="system",
                    heading=heading,
                    start_line=line_num,
                    content_start_line=line_num + 1,
                )
            elif RE_INPUTS.match(heading):
                current_section = _Section(
                    type="inputs",
                    heading=heading,
                    start_line=line_num,
                    content_start_line=line_num + 1,
                )
            elif RE_ARTIFACTS.match(heading):
                current_section = _Section(
                    type="artifacts",
                    heading=heading,
                    start_line=line_num,
                    content_start_line=line_num + 1,
                )
            else:
                current_section = _Section(
                    type="unknown",
                    heading=heading,
                    start_line=line_num,
                    content_start_line=line_num + 1,
                )
            continue

        # If we have a title but no section yet, these are description lines
        if title and current_section is None:
            if desc_start_line == -1 and line.strip():
                desc_start_line = line_num
            description_lines.append(line)
            continue

        # Accumulate content into current section
        if current_section is not None:
            current_section.lines.append(line)

    # Push last section
    if current_section is not None:
        sections.append(current_section)

    return _SectionResult(
        sections=sections,
        title_line=title_line,
        title=title,
        description_lines=description_lines,
        desc_start_line=desc_start_line,
    )


# ---------------------------------------------------------------------------
# Input parsing
# ---------------------------------------------------------------------------


def _parse_inputs(
    lines: list[str],
    start_line: int,
    warnings: list[ParseWarning],
    errors: list[ParseError],
) -> list[InputDef]:
    inputs: list[InputDef] = []
    seen_names: set[str] = set()

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        line_num = start_line + i

        if not line:
            continue

        # Must start with - or * to be an input line
        if not line.startswith("-") and not line.startswith("*"):
            continue

        match = RE_INPUT_LINE.match(line)
        if not match:
            # Line starts with - but doesn't match format
            if line.startswith("-") or line.startswith("*"):
                warnings.append(
                    ParseWarning(line=line_num, message=f'Malformed input line: "{line}"')
                )
            continue

        name = match.group(1)
        type_spec = match.group(2).strip()
        description = match.group(3)
        if description is not None:
            description = description.strip()

        # Check for duplicate names
        if name in seen_names:
            errors.append(
                ParseError(line=line_num, message=f'Duplicate input name: "{name}"')
            )
            continue
        seen_names.add(name)

        # Parse type spec: "type" or "type: value" or "enum: opt1, opt2, ..."
        colon_idx = type_spec.find(":")
        if colon_idx != -1:
            raw_type = type_spec[:colon_idx].strip()
            raw_value: Optional[str] = type_spec[colon_idx + 1 :].strip()
        else:
            raw_type = type_spec.strip()
            raw_value = None

        # Resolve type
        resolved_type: VariableType = TYPE_ALIASES.get(raw_type.lower(), "string")

        input_def = InputDef(
            name=name,
            type=resolved_type,
            required=True,
            description=description,
            line=line_num,
        )

        if resolved_type == "enum" and raw_value:
            input_def.options = [
                o.strip() for o in raw_value.split(",") if o.strip()
            ]
            input_def.required = False  # enums have predefined options
        elif raw_value is not None:
            input_def.default = raw_value
            input_def.required = False

        inputs.append(input_def)

    return inputs


# ---------------------------------------------------------------------------
# Directive extraction
# ---------------------------------------------------------------------------


@dataclass
class _DirectiveResult:
    content_lines: list[str] = field(default_factory=list)
    output_var: Optional[str] = None
    output_type: Optional[VariableType] = None
    output_options: Optional[list[str]] = None
    extract_field: Optional[str] = None
    elicitation: Optional[ElicitationDef] = None
    tool_call: Optional[StepToolCall] = None
    prompt_ref: Optional[PromptReference] = None


def _parse_quoted_strings(s: str) -> list[str]:
    return re.findall(r'"([^"]*)"', s)


def _split_tool_args(s: str) -> list[str]:
    """Split on commas, but respect JSON braces and quoted strings."""
    parts: list[str] = []
    depth = 0
    in_quote = False
    current: list[str] = []

    for i, ch in enumerate(s):
        if ch == '"' and (i == 0 or s[i - 1] != "\\"):
            in_quote = not in_quote

        if not in_quote:
            if ch == "{":
                depth += 1
            if ch == "}":
                depth -= 1

            if ch == "," and depth == 0 and len(parts) < 2:
                parts.append("".join(current))
                current = []
                continue

        current.append(ch)

    if current:
        parts.append("".join(current))

    return parts


def _extract_directives(
    lines: list[str],
    start_line: int,
    warnings: list[ParseWarning],
) -> _DirectiveResult:
    result = _DirectiveResult()

    for i, line in enumerate(lines):
        trimmed = line.strip()
        line_num = start_line + i

        # @output
        output_match = RE_OUTPUT.match(trimmed)
        if output_match:
            result.output_var = output_match.group(1)
            if output_match.group(2):
                raw_type = output_match.group(2).lower()
                result.output_type = TYPE_ALIASES.get(raw_type, "string")
            if output_match.group(3):
                # Parse enum values from repeated `, "value"` patterns
                enum_values = RE_ENUM_VALUE.findall(output_match.group(3))
                if enum_values:
                    result.output_options = enum_values
            if output_match.group(4):
                result.extract_field = output_match.group(4)
            continue

        # @elicit
        elicit_match = RE_ELICIT.match(trimmed)
        if elicit_match:
            elicit_type = elicit_match.group(1).lower()
            valid_types = ["input", "confirm", "select"]
            if elicit_type not in valid_types:
                warnings.append(
                    ParseWarning(
                        line=line_num,
                        message=f'Invalid elicit type: "{elicit_type}"',
                    )
                )
                result.content_lines.append(line)
                continue
            args = elicit_match.group(2) or ""
            quoted = _parse_quoted_strings(args)
            prompt = quoted[0] if quoted else ""
            options = quoted[1:] if len(quoted) > 1 else None
            result.elicitation = ElicitationDef(
                type=elicit_type,  # type: ignore[arg-type]
                prompt=prompt,
                options=options if options else None,
            )
            continue

        # @prompt
        prompt_match = RE_PROMPT.match(trimmed)
        if prompt_match:
            result.prompt_ref = PromptReference(prompt_id=prompt_match.group(1))
            continue

        # @tool
        tool_match = RE_TOOL.match(trimmed)
        if tool_match:
            tool_args = tool_match.group(1)
            parts = _split_tool_args(tool_args)
            if len(parts) >= 2:
                conn_name = parts[0].strip().strip('"')
                tool_name = parts[1].strip().strip('"')
                json_args = parts[2].strip() if len(parts) > 2 else None
                result.tool_call = StepToolCall(
                    connection_name=conn_name,
                    tool_name=tool_name,
                    arguments=json_args if json_args else None,
                )
            continue

        # Regular content line
        result.content_lines.append(line)

    return result


# ---------------------------------------------------------------------------
# Branch parsing
# ---------------------------------------------------------------------------


@dataclass
class _BranchParseResult:
    branches: list[Branch]
    content_before: list[str]
    has_branches: bool


@dataclass
class _RawBranch:
    condition: Optional[Condition]
    lines: list[str]
    start_line: int


def _build_sub_step(
    number: int,
    label: str,
    title: str,
    lines: list[str],
    start_line: int,
    warnings: list[ParseWarning],
) -> Step:
    directives = _extract_directives(lines, start_line + 1, warnings)
    content = "\n".join(directives.content_lines).strip()

    return Step(
        number=number,
        label=label,
        title=title,
        content=content,
        is_branching=False,
        line=start_line,
        output_var=directives.output_var,
        output_type=directives.output_type,
        output_options=directives.output_options,
        extract_field=directives.extract_field,
        elicitation=directives.elicitation,
        tool_call=directives.tool_call,
        prompt_ref=directives.prompt_ref,
    )


def _finalize_branch(
    raw: _RawBranch,
    parent_step_number: int,
    letter_index: int,
    warnings: list[ParseWarning],
) -> Branch:
    letter = chr(97 + letter_index)  # a, b, c, ...
    steps: list[Step] = []

    # Look for ### STEP sub-headings within the branch
    current_sub_step: Optional[dict] = None

    for i, line in enumerate(raw.lines):
        trimmed = line.strip()
        line_num = raw.start_line + i

        sub_match = RE_SUBSTEP.match(trimmed)
        if sub_match:
            if current_sub_step is not None:
                steps.append(
                    _build_sub_step(
                        current_sub_step["number"],
                        current_sub_step["label"],
                        current_sub_step["title"],
                        current_sub_step["lines"],
                        current_sub_step["start_line"],
                        warnings,
                    )
                )
            current_sub_step = {
                "number": parent_step_number,
                "label": sub_match.group(1),
                "title": sub_match.group(2).strip(),
                "lines": [],
                "start_line": line_num,
            }
            continue

        if current_sub_step is not None:
            current_sub_step["lines"].append(line)

    if current_sub_step is not None:
        steps.append(
            _build_sub_step(
                current_sub_step["number"],
                current_sub_step["label"],
                current_sub_step["title"],
                current_sub_step["lines"],
                current_sub_step["start_line"],
                warnings,
            )
        )

    # If no sub-steps found, create a synthetic sub-step from the branch content
    if not steps:
        content = "\n".join(raw.lines).strip()
        if content:
            steps.append(
                Step(
                    number=parent_step_number,
                    label=f"{parent_step_number}{letter}",
                    title=f"Branch {letter}",
                    content=content,
                    is_branching=False,
                    line=raw.start_line,
                )
            )

    return Branch(condition=raw.condition, steps=steps)


def _parse_branches(
    lines: list[str],
    start_line: int,
    parent_step_number: int,
    input_names: set[str],
    output_names: set[str],
    warnings: list[ParseWarning],
) -> _BranchParseResult:
    content_before: list[str] = []
    branches: list[Branch] = []
    current_branch: Optional[_RawBranch] = None
    has_branches = False
    in_branch = False
    letter_index = 0

    for i, line in enumerate(lines):
        trimmed = line.strip()
        line_num = start_line + i

        # Check for branch markers
        if_match = RE_IF.match(trimmed)
        if if_match:
            has_branches = True
            in_branch = True
            variable = if_match.group(1)
            operator = if_match.group(2)
            value = if_match.group(3)

            # Check if variable is declared
            if variable in input_names:
                source = "input"
            elif variable in output_names:
                source = "step_output"
            else:
                source = "input"

            if variable not in input_names and variable not in output_names:
                warnings.append(
                    ParseWarning(
                        line=line_num,
                        message=f'Undeclared branch variable: "{variable}"',
                    )
                )

            if current_branch is not None:
                branches.append(
                    _finalize_branch(
                        current_branch, parent_step_number, letter_index, warnings
                    )
                )
                letter_index += 1

            current_branch = _RawBranch(
                condition=Condition(
                    variable=variable,
                    operator=operator,  # type: ignore[arg-type]
                    value=value,
                    source=source,  # type: ignore[arg-type]
                ),
                lines=[],
                start_line=line_num + 1,
            )
            continue

        elif_match = RE_ELIF.match(trimmed)
        if elif_match:
            variable = elif_match.group(1)
            operator = elif_match.group(2)
            value = elif_match.group(3)

            if variable in input_names:
                source = "input"
            elif variable in output_names:
                source = "step_output"
            else:
                source = "input"

            if variable not in input_names and variable not in output_names:
                warnings.append(
                    ParseWarning(
                        line=line_num,
                        message=f'Undeclared branch variable: "{variable}"',
                    )
                )

            if current_branch is not None:
                branches.append(
                    _finalize_branch(
                        current_branch, parent_step_number, letter_index, warnings
                    )
                )
                letter_index += 1

            current_branch = _RawBranch(
                condition=Condition(
                    variable=variable,
                    operator=operator,  # type: ignore[arg-type]
                    value=value,
                    source=source,  # type: ignore[arg-type]
                ),
                lines=[],
                start_line=line_num + 1,
            )
            continue

        if RE_ELSE.match(trimmed):
            if current_branch is not None:
                branches.append(
                    _finalize_branch(
                        current_branch, parent_step_number, letter_index, warnings
                    )
                )
                letter_index += 1

            current_branch = _RawBranch(
                condition=None,
                lines=[],
                start_line=line_num + 1,
            )
            continue

        if RE_ENDIF.match(trimmed):
            if current_branch is not None:
                branches.append(
                    _finalize_branch(
                        current_branch, parent_step_number, letter_index, warnings
                    )
                )
                letter_index += 1
            current_branch = None
            in_branch = False
            continue

        # Regular content
        if in_branch and current_branch is not None:
            current_branch.lines.append(line)
        elif not in_branch:
            content_before.append(line)

    return _BranchParseResult(
        branches=branches,
        content_before=content_before,
        has_branches=has_branches,
    )


# ---------------------------------------------------------------------------
# Artifact parsing
# ---------------------------------------------------------------------------


RE_DYNAMIC_VAR = re.compile(r"^\{\{(\w+)\}\}$")


def _parse_artifacts(
    lines: list[str],
    start_line: int,
    warnings: list[ParseWarning],
) -> Optional[str]:
    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        line_num = start_line + i

        match = RE_ARTIFACT_TYPE.match(line)
        if match:
            raw = match.group(1).strip()
            lower = raw.lower()
            if lower in VALID_ARTIFACT_TYPES:
                return lower
            # Check for dynamic variable reference like {{output_format}}
            if RE_DYNAMIC_VAR.match(raw):
                return raw
            warnings.append(
                ParseWarning(
                    line=line_num,
                    message=f'Unknown artifact type: "{lower}"',
                )
            )
            return lower

    return None


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------


def parse_playbook(markdown: str) -> ParseResult:
    """Parse a PLAYBOOK.md markdown string into a structured ParseResult.

    Args:
        markdown: The raw PLAYBOOK.md markdown content.

    Returns:
        A ParseResult containing the parsed definition (or None on fatal error),
        along with any warnings and errors.
    """
    warnings: list[ParseWarning] = []
    errors: list[ParseError] = []

    # Size check
    byte_length = len(markdown.encode("utf-8"))
    if byte_length > 200_000:
        errors.append(ParseError(message="Document exceeds 200KB size limit"))
        return ParseResult(definition=None, warnings=warnings, errors=errors)

    # Empty check
    if not markdown.strip():
        errors.append(ParseError(message="Document is empty"))
        return ParseResult(definition=None, warnings=warnings, errors=errors)

    lines = markdown.split("\n")
    section_result = _identify_sections(lines)

    # Title required
    if not section_result.title:
        errors.append(
            ParseError(
                message="No title found. A playbook must start with a # heading."
            )
        )
        return ParseResult(definition=None, warnings=warnings, errors=errors)

    # Process sections
    system_prompt: Optional[str] = None
    inputs: list[InputDef] = []
    artifact_type: Optional[str] = None
    steps: list[Step] = []

    # Collect input and output names for branch variable checking
    input_names: set[str] = set()
    output_names: set[str] = set()

    # First pass: parse inputs (needed for branch variable checking)
    for section in section_result.sections:
        if section.type == "inputs":
            inputs = _parse_inputs(
                section.lines, section.content_start_line, warnings, errors
            )
            for inp in inputs:
                input_names.add(inp.name)

    # Check for fatal duplicate input error
    if any(e.message.startswith("Duplicate input name") for e in errors):
        return ParseResult(definition=None, warnings=warnings, errors=errors)

    # Second pass: parse all other sections
    for section in section_result.sections:
        if section.type == "system":
            system_prompt = "\n".join(section.lines).strip()

        if section.type == "step":
            step_number = section.step_number
            assert step_number is not None
            step_title = section.step_title
            assert step_title is not None

            # Parse branches first
            branch_result = _parse_branches(
                section.lines,
                section.content_start_line,
                step_number,
                input_names,
                output_names,
                warnings,
            )

            # Extract directives from non-branch content
            directives = _extract_directives(
                branch_result.content_before,
                section.content_start_line,
                warnings,
            )

            content = "\n".join(directives.content_lines).strip()

            # Track output names for later branch variable checking
            if directives.output_var:
                output_names.add(directives.output_var)

            # Also track output names from branch sub-steps
            if branch_result.has_branches:
                for branch in branch_result.branches:
                    for sub_step in branch.steps:
                        if sub_step.output_var:
                            output_names.add(sub_step.output_var)

            step = Step(
                number=step_number,
                label=str(step_number),
                title=step_title,
                content=content,
                is_branching=branch_result.has_branches,
                line=section.start_line,
                output_var=directives.output_var,
                output_type=directives.output_type,
                output_options=directives.output_options,
                extract_field=directives.extract_field,
                elicitation=directives.elicitation,
                tool_call=directives.tool_call,
                prompt_ref=directives.prompt_ref,
                branches=branch_result.branches if branch_result.has_branches else None,
            )

            steps.append(step)

        if section.type == "artifacts":
            artifact_type = _parse_artifacts(
                section.lines, section.content_start_line, warnings
            )

    # No steps = fatal
    if not steps:
        errors.append(
            ParseError(
                message="No steps found. A playbook must have at least one ## STEP N: Title."
            )
        )
        return ParseResult(definition=None, warnings=warnings, errors=errors)

    # Check sequential numbering
    for i, step in enumerate(steps):
        if step.number != i + 1:
            warnings.append(
                ParseWarning(
                    line=step.line,
                    message=f"Non-sequential step number: expected {i + 1}, found {step.number}",
                )
            )
            break

    # Build description
    description = "\n".join(section_result.description_lines).strip() or None

    definition = PlaybookDefinition(
        title=section_result.title,
        description=description,
        system_prompt=system_prompt,
        inputs=inputs,
        steps=steps,
        artifact_type=artifact_type,  # type: ignore[arg-type]
    )

    return ParseResult(definition=definition, warnings=warnings, errors=errors)
