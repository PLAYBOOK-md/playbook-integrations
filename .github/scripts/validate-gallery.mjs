/**
 * validate-gallery.mjs
 *
 * Parses every .md file in the given directory through @playbook-md/core
 * and reports errors/warnings. Exits non-zero if any file has fatal errors.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePlaybook } from "@playbook-md/core";

// ---------------------------------------------------------------------------
// Glob for .md files recursively
// ---------------------------------------------------------------------------

function collectMarkdownFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node validate-gallery.mjs <directory>");
  process.exit(1);
}

const root = resolve(dir);
const files = collectMarkdownFiles(root);

if (files.length === 0) {
  console.error(`No .md files found in ${root}`);
  process.exit(1);
}

console.log(`Validating ${files.length} playbook(s) in ${root}\n`);

let totalErrors = 0;
let totalWarnings = 0;
let fatalCount = 0;

for (const file of files) {
  const relative = file.slice(root.length + 1);
  const content = readFileSync(file, "utf-8");
  const result = parsePlaybook(content);

  const errors = result.errors.length;
  const warnings = result.warnings.length;
  const hasFatal = result.definition === null && errors > 0;

  totalErrors += errors;
  totalWarnings += warnings;
  if (hasFatal) fatalCount++;

  // Status indicator
  const status = hasFatal ? "FAIL" : errors > 0 ? "WARN" : "PASS";
  console.log(`  [${status}] ${relative}`);

  for (const err of result.errors) {
    const loc = err.line ? ` (line ${err.line})` : "";
    console.log(`         ERROR${loc}: ${err.message}`);
  }
  for (const warn of result.warnings) {
    const loc = warn.line ? ` (line ${warn.line})` : "";
    console.log(`         WARN${loc}: ${warn.message}`);
  }
}

console.log(
  `\nSummary: ${files.length} files, ${fatalCount} fatal, ${totalErrors} errors, ${totalWarnings} warnings`
);

if (fatalCount > 0) {
  console.error(`\nFATAL: ${fatalCount} file(s) failed to parse.`);
  process.exit(1);
}

console.log("\nAll gallery playbooks parsed successfully.");
