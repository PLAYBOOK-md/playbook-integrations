"""Tests for the PLAYBOOK.md semantic validator."""

from __future__ import annotations

from pathlib import Path

from playbook_md import validate_playbook

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Valid playbook
# ---------------------------------------------------------------------------


class TestValidPlaybook:
    def test_valid_playbook_passes(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = validate_playbook(md)
        assert result.valid is True
        assert result.fatal_errors == []

    def test_parse_failure_returns_invalid(self) -> None:
        md = _load_fixture("no-title.playbook.md")
        result = validate_playbook(md)
        assert result.valid is False
        assert len(result.fatal_errors) >= 1


# ---------------------------------------------------------------------------
# Variable interpolation warnings
# ---------------------------------------------------------------------------


class TestUndeclaredVariable:
    def test_undeclared_variable_in_step_content(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Go\n\n"
            "Use {{unknown_var}} in the text.\n"
        )
        result = validate_playbook(md)
        # Should produce a warning about undeclared variable
        assert any(
            "undeclared variable" in w.message.lower() for w in result.warnings
        )

    def test_declared_input_no_warning(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `name` (string): A name\n\n"
            "## STEP 1: Go\n\n"
            "Hello {{name}}!\n"
        )
        result = validate_playbook(md)
        assert result.valid is True
        # No undeclared-variable warnings
        assert not any(
            "undeclared variable" in w.message.lower() for w in result.warnings
        )

    def test_prior_output_no_warning(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Analyze\n\n"
            "Analyze stuff.\n\n"
            "@output(analysis)\n\n"
            "## STEP 2: Use\n\n"
            "Use {{analysis}} here.\n"
        )
        result = validate_playbook(md)
        assert result.valid is True
        assert not any(
            "undeclared variable" in w.message.lower() for w in result.warnings
        )

    def test_future_output_warns(self) -> None:
        """Referencing an @output from a later step should warn."""
        md = (
            "# Test\n\n"
            "## STEP 1: Use\n\n"
            "Use {{analysis}} here.\n\n"
            "## STEP 2: Analyze\n\n"
            "Analyze stuff.\n\n"
            "@output(analysis)\n"
        )
        result = validate_playbook(md)
        assert any(
            "undeclared variable" in w.message.lower() for w in result.warnings
        )


# ---------------------------------------------------------------------------
# Output shadowing
# ---------------------------------------------------------------------------


class TestOutputShadowing:
    def test_output_shadows_input(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `name` (string): A name\n\n"
            "## STEP 1: Generate\n\n"
            "Generate something.\n\n"
            "@output(name)\n"
        )
        result = validate_playbook(md)
        assert result.valid is False
        assert any(
            "shadows an input name" in e.message for e in result.fatal_errors
        )

    def test_no_shadowing_different_names(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `name` (string): A name\n\n"
            "## STEP 1: Generate\n\n"
            "Generate something.\n\n"
            "@output(result)\n"
        )
        result = validate_playbook(md)
        assert result.valid is True
        assert not any(
            "shadows" in e.message for e in result.fatal_errors
        )


# ---------------------------------------------------------------------------
# Branch condition variable checking
# ---------------------------------------------------------------------------


class TestBranchConditionValidation:
    def test_branch_with_declared_input(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `mode` (enum: a, b): Mode\n\n"
            "## STEP 1: Route\n\n"
            '```if mode == "a"```\n'
            "Do A.\n"
            "```else```\n"
            "Do B.\n"
            "```endif```\n"
        )
        result = validate_playbook(md)
        assert result.valid is True

    def test_branch_with_undeclared_variable(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Route\n\n"
            '```if unknown == "a"```\n'
            "Do A.\n"
            "```endif```\n"
        )
        result = validate_playbook(md)
        # The parser already emits a warning for undeclared branch variable
        assert any(
            "undeclared" in w.message.lower() for w in result.warnings
        )


# ---------------------------------------------------------------------------
# Artifact type validation
# ---------------------------------------------------------------------------


class TestArtifactTypeValidation:
    def test_valid_artifact_type(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Go\n\nDo it.\n\n"
            "## ARTIFACTS\n\ntype: json\n"
        )
        result = validate_playbook(md)
        assert result.valid is True

    def test_unknown_artifact_type(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Go\n\nDo it.\n\n"
            "## ARTIFACTS\n\ntype: foobar\n"
        )
        result = validate_playbook(md)
        # Parser warns about unknown artifact type
        assert any("artifact type" in w.message.lower() for w in result.warnings)
