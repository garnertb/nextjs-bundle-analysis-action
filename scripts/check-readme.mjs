#!/usr/bin/env node
/**
 * Asserts README.md's input/output tables list exactly the same names as
 * action.yml. Run via `pnpm run check-readme`. Doesn't check descriptions
 * or defaults — those are free text and would make this too brittle.
 */
import { readFileSync } from 'node:fs';

/**
 * Extracts the top-level key names under a section like `inputs:` or
 * `outputs:` from action.yml, without a full YAML parser: those sections
 * are a flat map of `  key-name:` at 2-space indent, whose nested fields
 * (`description`, `required`, `default`) are indented further.
 */
function extractYamlSectionKeys(yamlText, sectionKey) {
  const lines = yamlText.split('\n');
  const sectionStart = lines.findIndex((line) => line === `${sectionKey}:`);
  if (sectionStart === -1) throw new Error(`action.yml is missing a top-level "${sectionKey}:".`);
  const names = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 0 && !line.startsWith(' ')) break;
    const match = /^ {2}([a-z0-9-]+):/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

function extractTableNames(markdown, sectionHeading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === sectionHeading);
  if (start === -1) throw new Error(`README.md is missing a "${sectionHeading}" section.`);
  const names = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    const match = /^\|\s*`([a-z0-9-]+)`\s*\|/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

function diff(label, expected, actual) {
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  const problems = [];
  if (missing.length > 0) problems.push(`README.md is missing ${label}: ${missing.join(', ')}`);
  if (extra.length > 0)
    problems.push(`README.md lists ${label} not in action.yml: ${extra.join(', ')}`);
  return problems;
}

function main() {
  const actionYml = readFileSync('action.yml', 'utf-8');
  const readme = readFileSync('README.md', 'utf-8');

  const expectedInputs = extractYamlSectionKeys(actionYml, 'inputs');
  const expectedOutputs = extractYamlSectionKeys(actionYml, 'outputs');
  const actualInputs = extractTableNames(readme, '## Inputs');
  const actualOutputs = extractTableNames(readme, '## Outputs');

  const problems = [
    ...diff('inputs', expectedInputs, actualInputs),
    ...diff('outputs', expectedOutputs, actualOutputs),
  ];

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  console.log(
    `README.md matches action.yml: ${expectedInputs.length} inputs, ${expectedOutputs.length} outputs.`,
  );
}

main();
