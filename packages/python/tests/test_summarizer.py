"""Tests for the PLAYBOOK.md summarizer."""

from __future__ import annotations

from pathlib import Path

from playbook_md import parse_playbook, summarize_playbook

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class TestSummarizer:
    """Tests for all summary fields."""

    def test_title(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.title == "Content Pipeline"

    def test_description(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.description == (
            "Generate a polished article from a topic and target audience."
        )

    def test_input_count(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.input_count == 3

    def test_step_count(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.step_count == 4

    def test_step_titles(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.step_titles == ["Research", "Outline", "Draft", "Polish"]

    def test_artifact_type(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.artifact_type == "markdown"

    def test_no_branching(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.has_branching is False

    def test_no_elicitation(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.has_elicitation is False

    def test_no_tool_calls(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.has_tool_calls is False

    def test_no_directives_used(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        # content-pipeline has no directives
        assert summary.directives_used == []

    def test_with_directives(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Analyze\n\n"
            "Analyze.\n\n"
            "@output(result)\n\n"
            "## STEP 2: Ask\n\n"
            "Ask user.\n\n"
            '@elicit(confirm, "OK?")\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert "@output" in summary.directives_used
        assert "@elicit" in summary.directives_used
        assert summary.has_elicitation is True

    def test_with_branching(self) -> None:
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
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.has_branching is True

    def test_with_tool_calls(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: Search\n\n"
            "Search.\n\n"
            '@tool("google", "search")\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.has_tool_calls is True
        assert "@tool" in summary.directives_used

    def test_no_description(self) -> None:
        md = "# Test\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.description is None

    def test_no_artifact_type(self) -> None:
        md = "# Test\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        summary = summarize_playbook(result.definition)
        assert summary.artifact_type is None
