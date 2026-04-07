"""
PLAYBOOK.md Semantic Validator

Performs additional semantic checks beyond what the parser does.
The parser handles syntax; the validator checks cross-references,
variable scoping, and other semantic constraints.

Ported from the TypeScript implementation in packages/core/src/validator.ts.
"""

from __future__ import annotations

import re
from typing import Optional

from .parser import parse_playbook
from .types import (
    ArtifactType,
    ParseError,
    ParseWarning,
    PlaybookDefinition,
    Step,
    ValidationResult,
)

VALID_ARTIFACT_TYPES: list[str] = [
    "markdown",
    "json",
    "mermaid",
    "chartjs",
    "html_css",
    "javascript",
    "typescript",
]

RE_INTERPOLATION = re.compile(r"\{\{(\w+)(?::\w+(?::[^}]*)?)?}}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _collect_interpolations(text: str) -> list[dict[str, object]]:
    """Collect all {{variable}} references from a string."""
    refs: list[dict[str, object]] = []
    for match in RE_INTERPOLATION.finditer(text):
        refs.append({"name": match.group(1), "offset": match.start()})
    return refs


def _check_interpolations(
    content: str,
    step: Step,
    input_names: set[str],
    available_outputs: set[str],
    warnings: list[ParseWarning],
) -> None:
    """Check {{variable}} interpolations in step content."""
    refs = _collect_interpolations(content)
    for ref in refs:
        name = str(ref["name"])
        if name not in input_names and name not in available_outputs:
            warnings.append(
                ParseWarning(
                    line=step.line,
                    message=f'Step {step.label} references undeclared variable "{{{{{name}}}}}"',
                )
            )


# ---------------------------------------------------------------------------
# Core validation
# ---------------------------------------------------------------------------


def _validate_definition(definition: PlaybookDefinition) -> ValidationResult:
    """Validate a parsed PlaybookDefinition for semantic correctness."""
    fatal_errors: list[ParseError] = []
    warnings: list[ParseWarning] = []

    input_names = {inp.name for inp in definition.inputs}

    # Track which @output variables are available at each point in execution.
    # We walk steps in order; an @output from step N is available in step N+1 onward.
    outputs_before: dict[int, set[str]] = {}  # step_index -> outputs available before this step
    all_outputs: set[str] = set()

    # First pass: collect outputs in execution order
    for i, step in enumerate(definition.steps):
        outputs_before[i] = set(all_outputs)

        if step.output_var:
            all_outputs.add(step.output_var)

        # Also collect outputs from branch sub-steps (they may or may not execute,
        # but the variables they declare become "potentially available" downstream)
        if step.branches:
            for branch in step.branches:
                for sub_step in branch.steps:
                    if sub_step.output_var:
                        all_outputs.add(sub_step.output_var)

    # Check 1: @output variable names must not shadow input names
    for step in definition.steps:
        if step.output_var and step.output_var in input_names:
            fatal_errors.append(
                ParseError(
                    line=step.line,
                    message=f'@output variable "{step.output_var}" in step {step.number} shadows an input name',
                )
            )

        if step.branches:
            for branch in step.branches:
                for sub_step in branch.steps:
                    if sub_step.output_var and sub_step.output_var in input_names:
                        fatal_errors.append(
                            ParseError(
                                line=sub_step.line,
                                message=f'@output variable "{sub_step.output_var}" in sub-step {sub_step.label} shadows an input name',
                            )
                        )

    # Check 2: Verify {{variable}} interpolations reference declared inputs or prior @output vars
    for i, step in enumerate(definition.steps):
        available_outputs = outputs_before[i]

        _check_interpolations(
            step.content, step, input_names, available_outputs, warnings
        )

        # Check branch sub-step content
        if step.branches:
            for branch in step.branches:
                for sub_step in branch.steps:
                    _check_interpolations(
                        sub_step.content,
                        sub_step,
                        input_names,
                        available_outputs,
                        warnings,
                    )

        # Check @tool arguments for interpolations
        if step.tool_call and step.tool_call.arguments:
            refs = _collect_interpolations(step.tool_call.arguments)
            for ref in refs:
                name = str(ref["name"])
                if name not in input_names and name not in available_outputs:
                    warnings.append(
                        ParseWarning(
                            line=step.line,
                            message=f'Step {step.number} @tool argument references undeclared variable "{{{{{name}}}}}"',
                        )
                    )

    # Check 3: Verify branch conditions reference variables that exist at that point
    for i, step in enumerate(definition.steps):
        available_outputs = outputs_before[i]

        if step.branches:
            for branch in step.branches:
                if branch.condition:
                    var_name = branch.condition.variable
                    if var_name not in input_names and var_name not in available_outputs:
                        warnings.append(
                            ParseWarning(
                                line=step.line,
                                message=f'Branch condition in step {step.number} references undeclared variable "{var_name}"',
                            )
                        )

    # Check 4: Verify artifact type is valid
    if (
        definition.artifact_type
        and definition.artifact_type not in VALID_ARTIFACT_TYPES
    ):
        warnings.append(
            ParseWarning(
                message=f'Unknown artifact type "{definition.artifact_type}". Valid types: {", ".join(VALID_ARTIFACT_TYPES)}',
            )
        )

    return ValidationResult(
        valid=len(fatal_errors) == 0,
        fatal_errors=fatal_errors,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_playbook(markdown: str) -> ValidationResult:
    """Parse and validate a playbook markdown string.

    Runs the parser first, then performs additional semantic validation
    on the resulting definition.

    Args:
        markdown: The raw PLAYBOOK.md markdown content.

    Returns:
        A ValidationResult indicating whether the playbook is valid,
        along with any fatal errors and warnings.
    """
    parse_result = parse_playbook(markdown)

    # If parsing failed, return parser errors as fatal errors
    if parse_result.definition is None:
        return ValidationResult(
            valid=False,
            fatal_errors=parse_result.errors,
            warnings=parse_result.warnings,
        )

    # Run semantic validation on the parsed definition
    validation_result = _validate_definition(parse_result.definition)

    # Merge parser warnings with validation warnings
    return ValidationResult(
        valid=len(validation_result.fatal_errors) == 0,
        fatal_errors=validation_result.fatal_errors,
        warnings=parse_result.warnings + validation_result.warnings,
    )
