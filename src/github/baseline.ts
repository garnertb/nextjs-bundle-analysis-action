import type { BundleReport } from '../collectors/types.js';
import { compareBundleReports, type Comparison } from '../report/compare.js';
import type { ArtifactSummary, GithubApi } from './types.js';

export interface FindBaselineArtifactParams {
  api: GithubApi;
  owner: string;
  repo: string;
  workflowFile: string;
  branch: string;
  artifactName: string;
  /** The current repository's numeric ID, to reject artifacts from forked runs. */
  repositoryId: number;
  /** Caps how many workflow runs are inspected before giving up. */
  maxRuns?: number;
}

export interface BaselineArtifactMatch {
  runId: number;
  headSha: string;
  artifactId: number;
}

const DEFAULT_MAX_RUNS = 100;

/**
 * Walks the baseline workflow's successful runs on `branch`, newest first,
 * and returns the first trusted run (`head_repository.id === repositoryId`)
 * that has a non-expired artifact named `artifactName`. Returns `undefined`
 * when no such run/artifact is found within `maxRuns`.
 */
export async function findBaselineArtifact(
  params: FindBaselineArtifactParams,
): Promise<BaselineArtifactMatch | undefined> {
  const maxRuns = params.maxRuns ?? DEFAULT_MAX_RUNS;
  let checked = 0;
  for await (const run of params.api.listWorkflowRuns({
    owner: params.owner,
    repo: params.repo,
    workflowFile: params.workflowFile,
    branch: params.branch,
  })) {
    if (checked >= maxRuns) break;
    checked++;

    if (run.headRepositoryId !== params.repositoryId) continue;

    const artifacts: ArtifactSummary[] = await params.api.listWorkflowRunArtifacts({
      owner: params.owner,
      repo: params.repo,
      runId: run.id,
    });
    const match = artifacts.find(
      (artifact) => artifact.name === params.artifactName && !artifact.expired,
    );
    if (match) {
      return { runId: run.id, headSha: run.headSha, artifactId: match.id };
    }
  }
  return undefined;
}

/** Structural check that `value` is at least shaped like a {@link BundleReport}. */
export function isBundleReport(value: unknown): value is BundleReport {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Record<string, unknown>;
  const fingerprint = report.fingerprint as Record<string, unknown> | undefined;
  if (typeof fingerprint !== 'object' || fingerprint === null) return false;
  if (typeof fingerprint.schemaVersion !== 'number') return false;
  if (typeof fingerprint.collectorVersion !== 'string') return false;
  if (!['gzip', 'brotli', 'none'].includes(fingerprint.compression as string)) return false;
  if (typeof report.total !== 'number') return false;
  if (!Array.isArray(report.routes)) return false;
  if (typeof report.routers !== 'object' || report.routers === null) return false;
  return true;
}

/**
 * Builds a {@link Comparison} for a baseline artifact that downloaded but
 * failed schema validation: `baseline-status: incompatible`, without a
 * usable base report to diff against. Absolute budgets still apply because
 * `compareBundleReports(head, undefined)` already treats the baseline as
 * non-comparable.
 */
export function buildUnreadableBaselineComparison(head: BundleReport): Comparison {
  const comparison = compareBundleReports(head, undefined);
  return {
    ...comparison,
    baselineStatus: 'incompatible',
    incompatibility: {
      baseCompression: 'unreadable',
      baseCollectorVersion: 'unreadable',
      headCompression: head.fingerprint.compression,
      headCollectorVersion: head.fingerprint.collectorVersion,
    },
  };
}
