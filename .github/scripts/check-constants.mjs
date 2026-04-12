/**
 * check-constants.mjs
 *
 * Verifies that key constants from the spec are consistent across
 * all parser implementations (TypeScript, Go, Python).
 *
 * Checks:
 *   - 200KB (200,000 byte) size limit
 *   - 7 artifact types
 *   - 6 variable types (canonical VariableType values, includes json for outputs)
 *   - 4 directives handled (@output, @elicit, @prompt, @tool)
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Expected constants from the spec
// ---------------------------------------------------------------------------

const EXPECTED_SIZE_LIMIT = 200000;

const EXPECTED_ARTIFACT_TYPES = [
  "markdown",
  "json",
  "mermaid",
  "chartjs",
  "html_css",
  "javascript",
  "typescript",
].sort();

const EXPECTED_INPUT_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "enum",
  "json",
].sort();

const EXPECTED_DIRECTIVES = [
  "@output",
  "@elicit",
  "@prompt",
  "@tool",
].sort();

// ---------------------------------------------------------------------------
// Parser file paths
// ---------------------------------------------------------------------------

const PARSERS = {
  TypeScript: ["packages/core/src/parser.ts"],
  Go: ["packages/go/parser.go", "packages/go/playbook.go"],
  Python: ["packages/python/src/playbook_md/parser.py"],
};

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function readParser(name) {
  const files = PARSERS[name];
  let combined = "";
  for (const f of files) {
    try {
      combined += readFileSync(f, "utf-8") + "\n";
    } catch {
      // file not found, skip
    }
  }
  return combined || null;
}

/**
 * Check if the parser source contains the 200KB size limit constant.
 */
function checkSizeLimit(name, source) {
  // Look for 200000 or 200_000 in the source
  return source.includes("200000") || source.includes("200_000");
}

/**
 * Extract artifact types from the parser source.
 */
function extractArtifactTypes(name, source) {
  const types = new Set();

  if (name === "TypeScript") {
    // Matches: "markdown", "json", etc. in the VALID_ARTIFACT_TYPES array
    const match = source.match(
      /VALID_ARTIFACT_TYPES[^=]*=\s*\[([\s\S]*?)\]/
    );
    if (match) {
      const items = match[1].match(/"([^"]+)"/g);
      if (items) {
        for (const item of items) {
          types.add(item.replace(/"/g, ""));
        }
      }
    }
  }

  if (name === "Go") {
    // Matches: ArtifactMarkdown ArtifactType = "markdown"
    const re = /Artifact\w+\s+ArtifactType\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      types.add(m[1]);
    }
  }

  if (name === "Python") {
    // Matches: items in VALID_ARTIFACT_TYPES list
    const match = source.match(
      /VALID_ARTIFACT_TYPES[^=]*=\s*\[([\s\S]*?)\]/
    );
    if (match) {
      const items = match[1].match(/"([^"]+)"/g);
      if (items) {
        for (const item of items) {
          types.add(item.replace(/"/g, ""));
        }
      }
    }
  }

  return [...types].sort();
}

/**
 * Extract the canonical input types (VariableType values) from the parser.
 */
function extractInputTypes(name, source) {
  const types = new Set();

  if (name === "TypeScript") {
    // Keys in TYPE_ALIASES are unquoted, values are quoted.
    // Extract all unique values: `key: "value"` patterns
    const match = source.match(/TYPE_ALIASES[^{]*\{([\s\S]*?)\}/);
    if (match) {
      const re = /:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(match[1])) !== null) {
        types.add(m[1]);
      }
    }
  }

  if (name === "Go") {
    // Matches: VariableTypeString VariableType = "string"
    const re = /VariableType\w+\s+VariableType\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      types.add(m[1]);
    }
  }

  if (name === "Python") {
    // Look at TYPE_ALIASES dict values
    const match = source.match(/TYPE_ALIASES[^{]*\{([\s\S]*?)\}/);
    if (match) {
      const items = match[1].match(/"([^"]+)"/g);
      if (items) {
        // Values are at odd indices
        for (let i = 1; i < items.length; i += 2) {
          types.add(items[i].replace(/"/g, ""));
        }
      }
    }
  }

  return [...types].sort();
}

/**
 * Check which of the 4 directives the parser handles.
 */
function extractDirectives(name, source) {
  const directives = [];

  // All three parsers use regex constants named RE_OUTPUT, RE_ELICIT, RE_PROMPT, RE_TOOL
  // or reOutput, reElicit, rePrompt, reTool (Go)
  const patterns = [
    { directive: "@output", tsPattern: /RE_OUTPUT/, goPattern: /reOutput/, pyPattern: /RE_OUTPUT/ },
    { directive: "@elicit", tsPattern: /RE_ELICIT/, goPattern: /reElicit/, pyPattern: /RE_ELICIT/ },
    { directive: "@prompt", tsPattern: /RE_PROMPT/, goPattern: /rePrompt/, pyPattern: /RE_PROMPT/ },
    { directive: "@tool", tsPattern: /RE_TOOL/, goPattern: /reTool/, pyPattern: /RE_TOOL/ },
  ];

  for (const p of patterns) {
    let found = false;
    if (name === "TypeScript" && p.tsPattern.test(source)) found = true;
    if (name === "Go" && p.goPattern.test(source)) found = true;
    if (name === "Python" && p.pyPattern.test(source)) found = true;
    if (found) directives.push(p.directive);
  }

  return directives.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Constants Alignment Check");
console.log("=".repeat(60));

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;

for (const [name, path] of Object.entries(PARSERS)) {
  console.log(`\n${name} (${path})`);
  console.log("-".repeat(60));

  const source = readParser(name);
  if (!source) {
    console.log(`  [SKIP] File not found`);
    totalSkipped += 4;
    continue;
  }

  // 1. Size limit
  const hasSizeLimit = checkSizeLimit(name, source);
  if (hasSizeLimit) {
    console.log(`  [PASS] Size limit: 200KB (200,000 bytes)`);
    totalPassed++;
  } else {
    console.log(`  [FAIL] Size limit: 200KB constant not found`);
    totalFailed++;
  }

  // 2. Artifact types
  const artifactTypes = extractArtifactTypes(name, source);
  const artifactMatch =
    JSON.stringify(artifactTypes) === JSON.stringify(EXPECTED_ARTIFACT_TYPES);
  if (artifactMatch) {
    console.log(`  [PASS] Artifact types: ${artifactTypes.length} types`);
    totalPassed++;
  } else {
    console.log(`  [FAIL] Artifact types: expected ${EXPECTED_ARTIFACT_TYPES.length}, found ${artifactTypes.length}`);
    console.log(`         Expected: ${EXPECTED_ARTIFACT_TYPES.join(", ")}`);
    console.log(`         Found:    ${artifactTypes.join(", ")}`);
    totalFailed++;
  }

  // 3. Input types
  const inputTypes = extractInputTypes(name, source);
  const inputMatch =
    JSON.stringify(inputTypes) === JSON.stringify(EXPECTED_INPUT_TYPES);
  if (inputMatch) {
    console.log(`  [PASS] Input types: ${inputTypes.length} types`);
    totalPassed++;
  } else {
    console.log(`  [FAIL] Input types: expected ${EXPECTED_INPUT_TYPES.length}, found ${inputTypes.length}`);
    console.log(`         Expected: ${EXPECTED_INPUT_TYPES.join(", ")}`);
    console.log(`         Found:    ${inputTypes.join(", ")}`);
    totalFailed++;
  }

  // 4. Directives
  const directives = extractDirectives(name, source);
  const directiveMatch =
    JSON.stringify(directives) === JSON.stringify(EXPECTED_DIRECTIVES);
  if (directiveMatch) {
    console.log(`  [PASS] Directives: ${directives.length} handled`);
    totalPassed++;
  } else {
    console.log(`  [FAIL] Directives: expected ${EXPECTED_DIRECTIVES.length}, found ${directives.length}`);
    console.log(`         Expected: ${EXPECTED_DIRECTIVES.join(", ")}`);
    console.log(`         Found:    ${directives.join(", ")}`);
    totalFailed++;
  }
}

console.log("\n" + "=".repeat(60));
console.log(
  `Summary: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`
);

if (totalFailed > 0) {
  console.error(
    `\nFAIL: ${totalFailed} constant(s) misaligned across parsers.`
  );
  process.exit(1);
}

console.log("\nAll constants aligned across parsers.");
