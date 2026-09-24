import * as core from '@actions/core';
import type { Finding } from '../thresholds/types.js';

export interface AnnotateFindingsOptions {
  findings: Finding[];
  /** Injectable for tests; default to `core.error`/`core.warning`. */
  error?: typeof core.error;
  warning?: typeof core.warning;
}

/** Emits one `core.error`/`core.warning` annotation per finding, keyed off its level. */
export function annotateFindings(options: AnnotateFindingsOptions): void {
  const error = options.error ?? core.error;
  const warning = options.warning ?? core.warning;
  for (const finding of options.findings) {
    if (finding.level === 'fail') {
      error(finding.message, { title: `${finding.check}: ${finding.route}` });
    } else {
      warning(finding.message, { title: `${finding.check}: ${finding.route}` });
    }
  }
}
