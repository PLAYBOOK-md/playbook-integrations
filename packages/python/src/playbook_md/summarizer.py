"""
PLAYBOOK.md Summarizer

Produces a compact summary of a PlaybookDefinition,
useful for indexing, display, and quick inspection.

Ported from the TypeScript implementation in packages/core/src/summarizer.ts.
"""

from __future__ import annotations

from typing import Callable

from .types import PlaybookDefinition, PlaybookSummary, Step


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _collect_directives(steps: list[Step]) -> set[str]:
    """Collect the set of directive names used across all steps and sub-steps."""
    directives: set[str] = set()

    def scan_step(step: Step) -> None:
        if step.output_var:
            directives.add("@output")
        if step.elicitation:
            directives.add("@elicit")
        if step.prompt_ref:
            directives.add("@prompt")
        if step.tool_call:
            directives.add("@tool")

        if step.branches:
            for branch in step.branches:
                for sub_step in branch.steps:
                    scan_step(sub_step)

    for step in steps:
        scan_step(step)

    return directives


def _has_feature(steps: list[Step], predicate: Callable[[Step], bool]) -> bool:
    """Check if any step or sub-step has a particular feature."""
    for step in steps:
        if predicate(step):
            return True
        if step.branches:
            for branch in step.branches:
                for sub_step in branch.steps:
                    if predicate(sub_step):
                        return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def summarize_playbook(definition: PlaybookDefinition) -> PlaybookSummary:
    """Summarize a PlaybookDefinition into a compact summary object.

    Args:
        definition: A parsed PlaybookDefinition.

    Returns:
        A PlaybookSummary with counts, feature flags, and directive usage.
    """
    directives = _collect_directives(definition.steps)

    return PlaybookSummary(
        title=definition.title,
        description=definition.description,
        input_count=len(definition.inputs),
        step_count=len(definition.steps),
        step_titles=[s.title for s in definition.steps],
        artifact_type=definition.artifact_type,
        has_branching=_has_feature(definition.steps, lambda s: s.is_branching),
        has_elicitation=_has_feature(
            definition.steps, lambda s: s.elicitation is not None
        ),
        has_tool_calls=_has_feature(
            definition.steps, lambda s: s.tool_call is not None
        ),
        directives_used=sorted(directives),
    )
