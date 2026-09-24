import * as core from '@actions/core';
import { parseInputs, type RawInputs } from './inputs.js';

const INPUT_NAMES = [
  'working-directory',
  'next-dir',
  'build-command',
  'name',
  'base-branch',
  'baseline-workflow',
  'artifact-name',
  'upload-artifact',
  'github-token',
  'comment',
  'job-summary',
  'compression',
  'significant-change',
  'warn-route-size',
  'fail-route-size',
  'warn-route-increase',
  'fail-route-increase',
  'warn-total-increase',
  'fail-total-increase',
  'warn-shared-size',
  'fail-shared-size',
  'budgets-file',
] as const;

function readRawInputs(): RawInputs {
  const raw: RawInputs = {};
  for (const name of INPUT_NAMES) {
    raw[name] = core.getInput(name);
  }
  return raw;
}

export function run(): void {
  try {
    const inputs = parseInputs(readRawInputs());
    core.info(`Parsed inputs for working directory "${inputs.workingDirectory}".`);
    core.warning(
      'nextjs-bundle-analysis-action is a placeholder in this phase: measurement, ' +
        'thresholds, and reporting are not implemented yet.',
    );
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Not run under Vitest, where `main.ts` is imported only for its exports.
if (process.env['VITEST'] === undefined) {
  run();
}
