"""Tests for the PLAYBOOK.md parser."""

from __future__ import annotations

from pathlib import Path

from playbook_md import parse_playbook

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Valid playbook parsing
# ---------------------------------------------------------------------------


class TestValidPlaybook:
    """Tests for parsing the content-pipeline fixture."""

    def test_parses_without_errors(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert result.errors == []

    def test_title(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert result.definition.title == "Content Pipeline"

    def test_description(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert result.definition.description == (
            "Generate a polished article from a topic and target audience."
        )

    def test_system_prompt(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert result.definition.system_prompt is not None
        assert "professional content writer" in result.definition.system_prompt

    def test_inputs_count(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert len(result.definition.inputs) == 3

    def test_steps_count(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert len(result.definition.steps) == 4

    def test_step_titles(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        titles = [s.title for s in result.definition.steps]
        assert titles == ["Research", "Outline", "Draft", "Polish"]

    def test_artifact_type(self) -> None:
        md = _load_fixture("content-pipeline.playbook.md")
        result = parse_playbook(md)
        assert result.definition is not None
        assert result.definition.artifact_type == "markdown"


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------


class TestErrorCases:
    """Tests for parser error handling."""

    def test_empty_input(self) -> None:
        result = parse_playbook("")
        assert result.definition is None
        assert len(result.errors) == 1
        assert "empty" in result.errors[0].message.lower()

    def test_whitespace_only(self) -> None:
        result = parse_playbook("   \n\n   \t  \n")
        assert result.definition is None
        assert len(result.errors) == 1
        assert "empty" in result.errors[0].message.lower()

    def test_no_title(self) -> None:
        md = _load_fixture("no-title.playbook.md")
        result = parse_playbook(md)
        assert result.definition is None
        assert len(result.errors) == 1
        assert "title" in result.errors[0].message.lower()

    def test_no_steps(self) -> None:
        md = "# My Playbook\n\nSome description but no steps.\n"
        result = parse_playbook(md)
        assert result.definition is None
        assert len(result.errors) == 1
        assert "steps" in result.errors[0].message.lower()

    def test_size_limit(self) -> None:
        # Create a document larger than 200KB
        md = "# Big Playbook\n\n## STEP 1: Do stuff\n\n" + ("x" * 210_000)
        result = parse_playbook(md)
        assert result.definition is None
        assert len(result.errors) == 1
        assert "200KB" in result.errors[0].message


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------


class TestInputParsing:
    """Tests for all 5 input types."""

    def test_string_input(self) -> None:
        md = "# Test\n\n## INPUTS\n\n- `name` (string): A name\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        assert len(result.definition.inputs) == 1
        inp = result.definition.inputs[0]
        assert inp.name == "name"
        assert inp.type == "string"
        assert inp.required is True
        assert inp.description == "A name"

    def test_text_input(self) -> None:
        md = "# Test\n\n## INPUTS\n\n- `body` (text): Long text\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        inp = result.definition.inputs[0]
        assert inp.type == "text"

    def test_number_input(self) -> None:
        md = "# Test\n\n## INPUTS\n\n- `count` (number: 10): A count\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        inp = result.definition.inputs[0]
        assert inp.type == "number"
        assert inp.default == "10"
        assert inp.required is False

    def test_boolean_input(self) -> None:
        md = "# Test\n\n## INPUTS\n\n- `verbose` (boolean): Verbose output\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        inp = result.definition.inputs[0]
        assert inp.type == "boolean"
        assert inp.required is True

    def test_enum_input(self) -> None:
        md = "# Test\n\n## INPUTS\n\n- `level` (enum: low, medium, high): Priority\n\n## STEP 1: Go\n\nDo it.\n"
        result = parse_playbook(md)
        assert result.definition is not None
        inp = result.definition.inputs[0]
        assert inp.type == "enum"
        assert inp.options == ["low", "medium", "high"]
        assert inp.required is False

    def test_type_aliases(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `a` (bool): Bool alias\n"
            "- `b` (int): Int alias\n"
            "- `c` (select: x, y): Select alias\n"
            "\n## STEP 1: Go\n\nDo it.\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        inputs = result.definition.inputs
        assert inputs[0].type == "boolean"
        assert inputs[1].type == "number"
        assert inputs[2].type == "enum"

    def test_duplicate_input_name(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `name` (string): First\n"
            "- `name` (string): Duplicate\n"
            "\n## STEP 1: Go\n\nDo it.\n"
        )
        result = parse_playbook(md)
        assert result.definition is None
        assert any("Duplicate input name" in e.message for e in result.errors)


# ---------------------------------------------------------------------------
# Directives
# ---------------------------------------------------------------------------


class TestDirectives:
    """Tests for all directive types."""

    def test_output_directive(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Analyze\n\n"
            "Analyze the data.\n\n"
            "@output(analysis)\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.output_var == "analysis"

    def test_output_with_extract(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Analyze\n\n"
            "Analyze the data.\n\n"
            '@output(result, extract:"summary")\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.output_var == "result"
        assert step.extract_field == "summary"

    def test_elicit_directive(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Ask\n\n"
            'Ask user something.\n\n'
            '@elicit(confirm, "Are you sure?")\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.elicitation is not None
        assert step.elicitation.type == "confirm"
        assert step.elicitation.prompt == "Are you sure?"

    def test_elicit_select_with_options(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Choose\n\n"
            "Choose one.\n\n"
            '@elicit(select, "Pick one" "Option A" "Option B")\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.elicitation is not None
        assert step.elicitation.type == "select"
        assert step.elicitation.prompt == "Pick one"
        assert step.elicitation.options == ["Option A", "Option B"]

    def test_prompt_directive(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Generate\n\n"
            "Generate content.\n\n"
            "@prompt(library:my-prompt-123)\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.prompt_ref is not None
        assert step.prompt_ref.prompt_id == "my-prompt-123"

    def test_tool_directive(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Search\n\n"
            "Search for data.\n\n"
            '@tool("google", "search", {"query": "test"})\n'
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.tool_call is not None
        assert step.tool_call.connection_name == "google"
        assert step.tool_call.tool_name == "search"
        assert step.tool_call.arguments == '{"query": "test"}'


# ---------------------------------------------------------------------------
# Branching
# ---------------------------------------------------------------------------


class TestBranching:
    """Tests for if/elif/else/endif branching."""

    def test_basic_if_else_endif(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `mode` (enum: fast, slow): Mode\n\n"
            "## STEP 1: Route\n\n"
            'Content before branch.\n\n'
            '```if mode == "fast"```\n'
            "Do it quickly.\n"
            "```else```\n"
            "Take your time.\n"
            "```endif```\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.is_branching is True
        assert step.branches is not None
        assert len(step.branches) == 2

        # First branch: if condition
        assert step.branches[0].condition is not None
        assert step.branches[0].condition.variable == "mode"
        assert step.branches[0].condition.operator == "=="
        assert step.branches[0].condition.value == "fast"

        # Second branch: else (no condition)
        assert step.branches[1].condition is None

    def test_if_elif_else_endif(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `level` (enum: low, medium, high): Level\n\n"
            "## STEP 1: Act\n\n"
            '```if level == "low"```\n'
            "Low action.\n"
            '```elif level == "medium"```\n'
            "Medium action.\n"
            "```else```\n"
            "High action.\n"
            "```endif```\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.is_branching is True
        assert step.branches is not None
        assert len(step.branches) == 3

    def test_undeclared_branch_variable_warning(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Route\n\n"
            '```if unknown_var == "value"```\n'
            "Do something.\n"
            "```endif```\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        assert any(
            "Undeclared branch variable" in w.message for w in result.warnings
        )

    def test_branch_condition_source_input(self) -> None:
        md = (
            "# Test\n\n## INPUTS\n\n"
            "- `mode` (string): Mode\n\n"
            "## STEP 1: Route\n\n"
            '```if mode == "fast"```\n'
            "Fast path.\n"
            "```endif```\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step = result.definition.steps[0]
        assert step.branches is not None
        assert step.branches[0].condition is not None
        assert step.branches[0].condition.source == "input"

    def test_branch_condition_source_output(self) -> None:
        md = (
            "# Test\n\n## STEP 1: Analyze\n\n"
            "Analyze.\n\n"
            "@output(result)\n\n"
            "## STEP 2: Route\n\n"
            '```if result == "good"```\n'
            "Good path.\n"
            "```endif```\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        step2 = result.definition.steps[1]
        assert step2.branches is not None
        assert step2.branches[0].condition is not None
        assert step2.branches[0].condition.source == "step_output"


# ---------------------------------------------------------------------------
# Sequential numbering
# ---------------------------------------------------------------------------


class TestSequentialNumbering:
    def test_non_sequential_warning(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: First\n\nDo first.\n\n"
            "## STEP 3: Third\n\nDo third.\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        assert any(
            "Non-sequential step number" in w.message for w in result.warnings
        )

    def test_sequential_no_warning(self) -> None:
        md = (
            "# Test\n\n"
            "## STEP 1: First\n\nDo first.\n\n"
            "## STEP 2: Second\n\nDo second.\n"
        )
        result = parse_playbook(md)
        assert result.definition is not None
        assert not any(
            "Non-sequential" in w.message for w in result.warnings
        )
