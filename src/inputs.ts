/**
 * Pure parsing of action inputs into a typed config. Kept free of `@actions/*`
 * so it can be exercised by `src/cli.ts` and unit tests without the Actions
 * runtime.
 */

export interface ActionInputs {
  workingDirectory: string;
  nextDir: string;
  buildCommand: string | undefined;
  name: string | undefined;
  baseBranch: string | undefined;
  baselineWorkflow: string | undefined;
  artifactName: string | undefined;
  uploadArtifact: boolean;
  githubToken: string;
  comment: boolean;
  commentAuthor: string | undefined;
  jobSummary: boolean;
  compression: 'gzip' | 'brotli' | 'none';
  significantChange: string;
  warnRouteSize: string | undefined;
  failRouteSize: string | undefined;
  warnRouteIncrease: string | undefined;
  failRouteIncrease: string | undefined;
  warnTotalIncrease: string | undefined;
  failTotalIncrease: string | undefined;
  warnSharedSize: string | undefined;
  failSharedSize: string | undefined;
  budgetsFile: string | undefined;
}

export type RawInputs = Record<string, string | undefined>;

function optional(raw: RawInputs, key: string): string | undefined {
  const value = raw[key];
  return value === undefined || value === '' ? undefined : value;
}

function required(raw: RawInputs, key: string, fallback: string): string {
  return optional(raw, key) ?? fallback;
}

function boolean(raw: RawInputs, key: string, fallback: boolean): boolean {
  const value = optional(raw, key);
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid "${key}" input: "${value}". Expected "true" or "false".`);
}

function compression(raw: RawInputs): ActionInputs['compression'] {
  const value = optional(raw, 'compression') ?? 'gzip';
  if (value === 'gzip' || value === 'brotli' || value === 'none') return value;
  throw new Error(`Invalid "compression" input: "${value}". Expected gzip, brotli, or none.`);
}

export function parseInputs(raw: RawInputs): ActionInputs {
  return {
    workingDirectory: required(raw, 'working-directory', '.'),
    nextDir: required(raw, 'next-dir', '.next'),
    buildCommand: optional(raw, 'build-command'),
    name: optional(raw, 'name'),
    baseBranch: optional(raw, 'base-branch'),
    baselineWorkflow: optional(raw, 'baseline-workflow'),
    artifactName: optional(raw, 'artifact-name'),
    uploadArtifact: boolean(raw, 'upload-artifact', true),
    githubToken: required(raw, 'github-token', ''),
    comment: boolean(raw, 'comment', true),
    commentAuthor: optional(raw, 'comment-author'),
    jobSummary: boolean(raw, 'job-summary', true),
    compression: compression(raw),
    significantChange: required(raw, 'significant-change', '512B'),
    warnRouteSize: optional(raw, 'warn-route-size'),
    failRouteSize: optional(raw, 'fail-route-size'),
    warnRouteIncrease: optional(raw, 'warn-route-increase'),
    failRouteIncrease: optional(raw, 'fail-route-increase'),
    warnTotalIncrease: optional(raw, 'warn-total-increase'),
    failTotalIncrease: optional(raw, 'fail-total-increase'),
    warnSharedSize: optional(raw, 'warn-shared-size'),
    failSharedSize: optional(raw, 'fail-shared-size'),
    budgetsFile: optional(raw, 'budgets-file'),
  };
}
