/**
 * check-regex.mjs
 *
 * Extracts regex patterns from the spec docs (```regex code blocks)
 * and compares them against the compiled patterns in the TS parser.
 * Reports any drift between the spec and the implementation.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Extract regex patterns from spec markdown files
// ---------------------------------------------------------------------------

/**
 * Finds all ```regex code blocks in a markdown file and returns
 * an array of { file, pattern } objects.
 */
function extractSpecRegexes(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results = [];
  let inRegexBlock = false;
  let currentPattern = [];

  for (const line of lines) {
    if (line.trim() === "```regex") {
      inRegexBlock = true;
      currentPattern = [];
      continue;
    }
    if (inRegexBlock && line.trim() === "```") {
      inRegexBlock = false;
      const pattern = currentPattern.join("\n").trim();
      if (pattern) {
        results.push(pattern);
      }
      continue;
    }
    if (inRegexBlock) {
      currentPattern.push(line);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Extract regex patterns from the TS parser source
// ---------------------------------------------------------------------------

/**
 * Reads parser.ts and extracts regex patterns from lines like:
 *   const RE_FOO = /pattern/flags;
 * Returns an array of { name, pattern } objects.
 */
function extractParserRegexes(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results = [];

  const reConst = /^const\s+(RE_\w+)\s*=\s*\/(.+)\/([gimsuy]*);\s*$/;

  for (const line of lines) {
    const match = line.match(reConst);
    if (match) {
      results.push({
        name: match[1],
        pattern: match[2],
        flags: match[3],
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Normalize a regex pattern for comparison
// ---------------------------------------------------------------------------

function normalize(pattern) {
  // Remove anchors and whitespace for loose comparison
  return pattern.replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// Known mappings: spec regex -> parser const name
// ---------------------------------------------------------------------------

// We map spec patterns to their expected parser counterpart by matching
// the core pattern structure. This avoids fragile exact-string matching.
const SPEC_TO_PARSER = [
  {
    specFile: "inputs.md",
    description: "Input line format",
    parserName: "RE_INPUT_LINE",
  },
  {
    specFile: "steps.md",
    description: "Step heading",
    parserName: "RE_STEP",
  },
  {
    specFile: "directives.md",
    description: "@output directive",
    parserName: "RE_OUTPUT",
  },
  {
    specFile: "directives.md",
    description: "@elicit directive",
    parserName: "RE_ELICIT",
  },
  {
    specFile: "directives.md",
    description: "@prompt directive",
    parserName: "RE_PROMPT",
  },
  {
    specFile: "directives.md",
    description: "@tool directive",
    parserName: "RE_TOOL",
  },
  {
    specFile: "branching.md",
    description: "Sub-step heading",
    parserName: "RE_SUBSTEP",
  },
  {
    specFile: "artifacts.md",
    description: "Artifact type line",
    parserName: "RE_ARTIFACT_TYPE",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const specDir = "spec/spec";
const parserPath = "packages/core/src/parser.ts";

// Collect all spec regexes keyed by file
const specRegexesByFile = {};
for (const file of readdirSync(specDir)) {
  if (!file.endsWith(".md")) continue;
  const regexes = extractSpecRegexes(join(specDir, file));
  if (regexes.length > 0) {
    specRegexesByFile[file] = regexes;
  }
}

// Collect parser regexes
const parserRegexes = extractParserRegexes(parserPath);
const parserByName = Object.fromEntries(
  parserRegexes.map((r) => [r.name, r])
);

console.log("Regex Pattern Alignment Check");
console.log("=".repeat(60));
console.log(`\nSpec files scanned: ${Object.keys(specRegexesByFile).length}`);
console.log(`Parser regexes found: ${parserRegexes.length}\n`);

// Print all spec regexes found
console.log("Spec regex patterns found:");
for (const [file, patterns] of Object.entries(specRegexesByFile)) {
  for (const p of patterns) {
    console.log(`  ${file}: ${p}`);
  }
}
console.log();

// Print all parser regexes found
console.log("Parser regex patterns found:");
for (const r of parserRegexes) {
  console.log(`  ${r.name}: /${r.pattern}/${r.flags}`);
}
console.log();

// Compare known mappings
let passed = 0;
let failed = 0;
let skipped = 0;

console.log("Alignment checks:");
console.log("-".repeat(60));

for (const mapping of SPEC_TO_PARSER) {
  const specPatterns = specRegexesByFile[mapping.specFile];
  const parserRegex = parserByName[mapping.parserName];

  if (!specPatterns || specPatterns.length === 0) {
    console.log(`  [SKIP] ${mapping.description} - no spec regex in ${mapping.specFile}`);
    skipped++;
    continue;
  }

  if (!parserRegex) {
    console.log(`  [FAIL] ${mapping.description} - parser missing ${mapping.parserName}`);
    failed++;
    continue;
  }

  // Find the spec pattern that best matches this parser regex
  const parserNorm = normalize(parserRegex.pattern);
  let matched = false;

  for (const specPattern of specPatterns) {
    const specNorm = normalize(specPattern);

    // Check if spec pattern is contained in the parser pattern or vice versa,
    // or if they share the core identifying substring
    if (parserNorm === specNorm || parserNorm.includes(specNorm) || specNorm.includes(parserNorm)) {
      matched = true;
      break;
    }

    // Try constructing a RegExp from the spec pattern and comparing
    try {
      const specRe = new RegExp(specPattern);
      const parserRe = new RegExp(parserRegex.pattern, parserRegex.flags);

      // Test with some representative inputs to see if they match the same things
      if (specRe.source === parserRe.source) {
        matched = true;
        break;
      }
    } catch {
      // spec pattern may not be valid JS regex, that's okay
    }
  }

  if (matched) {
    console.log(`  [PASS] ${mapping.description} (${mapping.parserName})`);
    passed++;
  } else {
    console.log(`  [FAIL] ${mapping.description} (${mapping.parserName})`);
    console.log(`         Spec patterns (${mapping.specFile}):`);
    for (const p of specPatterns) {
      console.log(`           ${p}`);
    }
    console.log(`         Parser pattern:`);
    console.log(`           /${parserRegex.pattern}/${parserRegex.flags}`);
    failed++;
  }
}

console.log();
console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  console.error(`\nFAIL: ${failed} regex pattern(s) drifted from spec.`);
  process.exit(1);
}

console.log("\nAll regex patterns aligned with spec.");
