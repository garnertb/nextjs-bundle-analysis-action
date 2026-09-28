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
  /**
   * Caps how many workflow runs are inspected before giving up. This is a
   * **per-query** cap: when `preferredHeadSha` is set, the exact-SHA query
   * and the newest-first fallback query each get their own budget, so an
   * exhausted exact-SHA search can't starve the fallback.
   */
  maxRuns?: number;
  /**
   * When set, runs whose `head_sha` matches this commit are searched first
   * (still subject to every trust check below). Falls back to the newest
   * trusted run when none qualify.
   */
  preferredHeadSha?: string | undefined;
}

export interface BaselineArtifactMatch {
  runId: number;
  headSha: string;
  artifactId: number;
}

const DEFAULT_MAX_RUNS = 100;

interface SearchTrustedRunsParams {
  api: GithubApi;
  owner: string;
  repo: string;
  workflowFile: string;
  branch: string;
  artifactName: string;
  repositoryId: number;
  headSha: string | undefined;
  maxRuns: number;
}

/**
 * Walks the baseline workflow's successful runs on `branch` (optionally
 * filtered to a single `headSha`), newest first, and returns the first
 * trusted run (`head_repository.id === repositoryId`) that has a non-expired
 * artifact named `artifactName`. Returns `undefined` when no such run/
 * artifact is found within `maxRuns`.
 */
async function searchTrustedRuns(
  params: SearchTrustedRunsParams,
): Promise<BaselineArtifactMatch | undefined> {
  let checked = 0;
  for await (const run of params.api.listWorkflowRuns({
    owner: params.owner,
    repo: params.repo,
    workflowFile: params.workflowFile,
    branch: params.branch,
    headSha: params.headSha,
  })) {
    if (checked >= params.maxRuns) break;
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

/**
 * Finds the baseline artifact, preferring the run for `preferredHeadSha`
 * (the PR's actual merge base) when set, and falling back to the newest
 * trusted run otherwise. The returned match's `headSha` lets the caller
 * detect whether the fallback path was used (`headSha !== preferredHeadSha`)
 * and flag the comparison as `stale`.
 */
export async function findBaselineArtifact(
  params: FindBaselineArtifactParams,
): Promise<BaselineArtifactMatch | undefined> {
  const maxRuns = params.maxRuns ?? DEFAULT_MAX_RUNS;
  const shared = {
    api: params.api,
    owner: params.owner,
    repo: params.repo,
    workflowFile: params.workflowFile,
    branch: params.branch,
    artifactName: params.artifactName,
    repositoryId: params.repositoryId,
    maxRuns,
  };

  if (params.preferredHeadSha) {
    const exact = await searchTrustedRuns({ ...shared, headSha: params.preferredHeadSha });
    if (exact) return exact;
  }

  return searchTrustedRuns({ ...shared, headSha: undefined });
}

export interface ResolveMergeBaseShaParams {
  api: GithubApi;
  owner: string;
  repo: string;
  /** The PR build's own commit, `github.context.sha` (the merge ref's SHA on `pull_request`). */
  sha: string;
  /** The event payload's `pull_request.base.sha`, used when the merge-commit lookup is unusable. */
  payloadBaseSha: string | undefined;
}

export interface ResolvedMergeBase {
  sha: string;
  /** `'merge-commit'` when `sha`'s first parent was used; `'payload'` when the fallback was used. */
  source: 'merge-commit' | 'payload';
}

/**
 * Resolves the base-branch commit the PR build was actually merged onto:
 * `sha`'s first parent, but only when `sha` has exactly 2 parents (a normal
 * two-way merge commit). Falls back to `payloadBaseSha` when the commit
 * lookup errors, or the commit isn't a two-parent merge (unverified per-run
 * checkouts, squash workflows, etc.). Returns `undefined` when neither
 * source is available, so the caller can keep today's un-preferred lookup.
 */
export async function resolveMergeBaseSha(
  params: ResolveMergeBaseShaParams,
): Promise<ResolvedMergeBase | undefined> {
  let parents: string[] | undefined;
  try {
    parents = await params.api.getCommitParents({
      owner: params.owner,
      repo: params.repo,
      sha: params.sha,
    });
  } catch {
    parents = undefined;
  }

  if (parents?.length === 2) {
    return { sha: parents[0]!, source: 'merge-commit' };
  }
  return params.payloadBaseSha ? { sha: params.payloadBaseSha, source: 'payload' } : undefined;
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
