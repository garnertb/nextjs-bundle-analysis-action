import * as core from '@actions/core';

export interface WriteJobSummaryOptions {
  markdown: string;
  /** Injectable for tests; defaults to `core.summary`. */
  summary?: Pick<typeof core.summary, 'addRaw' | 'write'>;
}

/** Writes the full, untruncated report to the job summary (its own 1 MiB limit). */
export async function writeJobSummary(options: WriteJobSummaryOptions): Promise<void> {
  const summary = options.summary ?? core.summary;
  await summary.addRaw(options.markdown, true).write();
}

/** Builds the URL to this run's summary page, for linking from a truncated PR comment. */
export function buildJobSummaryUrl(params: {
  serverUrl: string;
  owner: string;
  repo: string;
  runId: number;
}): string {
  return `${params.serverUrl}/${params.owner}/${params.repo}/actions/runs/${params.runId}`;
}
