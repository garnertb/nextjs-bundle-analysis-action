import type { BundleReport } from '../collectors/types.js';
import {
  buildUnreadableBaselineComparison,
  findBaselineArtifact,
  isBundleReport,
} from './baseline.js';
import type { ArtifactSummary, GithubApi, WorkflowRunSummary } from './types.js';

function fakeApi(overrides: {
  runs: WorkflowRunSummary[];
  artifactsByRun: Record<number, ArtifactSummary[]>;
}): GithubApi {
  return {
    async *listWorkflowRuns() {
      for (const run of overrides.runs) yield run;
    },
    listWorkflowRunArtifacts: async ({ runId }) => overrides.artifactsByRun[runId] ?? [],
    listIssueComments: async () => [],
    createIssueComment: async () => {},
    updateIssueComment: async () => {},
    getAuthenticatedLogin: async () => undefined,
    getDefaultBranch: async () => 'main',
  };
}

const baseParams = {
  owner: 'octocat',
  repo: 'hello-world',
  workflowFile: 'ci.yml',
  branch: 'main',
  artifactName: 'next-bundle-sizes-web',
  repositoryId: 1,
};

describe('findBaselineArtifact', () => {
  it('returns the first trusted run with a non-expired matching artifact', async () => {
    const api = fakeApi({
      runs: [
        { id: 1, headSha: 'sha1', headRepositoryId: 1 },
        { id: 2, headSha: 'sha2', headRepositoryId: 1 },
      ],
      artifactsByRun: {
        1: [{ id: 10, name: 'next-bundle-sizes-web', expired: false }],
        2: [{ id: 20, name: 'next-bundle-sizes-web', expired: false }],
      },
    });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match).toEqual({ runId: 1, headSha: 'sha1', artifactId: 10 });
  });

  it('skips a run from a forked repository', async () => {
    const api = fakeApi({
      runs: [
        { id: 1, headSha: 'fork-sha', headRepositoryId: 999 },
        { id: 2, headSha: 'trusted-sha', headRepositoryId: 1 },
      ],
      artifactsByRun: {
        1: [{ id: 10, name: 'next-bundle-sizes-web', expired: false }],
        2: [{ id: 20, name: 'next-bundle-sizes-web', expired: false }],
      },
    });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match?.runId).toBe(2);
  });

  it('skips a run whose matching artifact expired', async () => {
    const api = fakeApi({
      runs: [
        { id: 1, headSha: 'old-sha', headRepositoryId: 1 },
        { id: 2, headSha: 'fresh-sha', headRepositoryId: 1 },
      ],
      artifactsByRun: {
        1: [{ id: 10, name: 'next-bundle-sizes-web', expired: true }],
        2: [{ id: 20, name: 'next-bundle-sizes-web', expired: false }],
      },
    });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match?.runId).toBe(2);
  });

  it('skips a run missing the expected artifact name', async () => {
    const api = fakeApi({
      runs: [
        { id: 1, headSha: 'no-artifact', headRepositoryId: 1 },
        { id: 2, headSha: 'has-artifact', headRepositoryId: 1 },
      ],
      artifactsByRun: {
        1: [{ id: 10, name: 'some-other-artifact', expired: false }],
        2: [{ id: 20, name: 'next-bundle-sizes-web', expired: false }],
      },
    });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match?.runId).toBe(2);
  });

  it('pages past runs beyond the first batch to find a match', async () => {
    const runs: WorkflowRunSummary[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      headSha: `sha${i + 1}`,
      headRepositoryId: 1,
    }));
    const api = fakeApi({
      runs,
      artifactsByRun: { 5: [{ id: 50, name: 'next-bundle-sizes-web', expired: false }] },
    });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match).toEqual({ runId: 5, headSha: 'sha5', artifactId: 50 });
  });

  it('returns undefined when no run matches within maxRuns', async () => {
    const api = fakeApi({
      runs: [
        { id: 1, headSha: 's1', headRepositoryId: 1 },
        { id: 2, headSha: 's2', headRepositoryId: 1 },
        { id: 3, headSha: 's3', headRepositoryId: 1 },
      ],
      artifactsByRun: { 3: [{ id: 30, name: 'next-bundle-sizes-web', expired: false }] },
    });
    const match = await findBaselineArtifact({ ...baseParams, api, maxRuns: 2 });
    expect(match).toBeUndefined();
  });

  it('returns undefined when there are no runs at all', async () => {
    const api = fakeApi({ runs: [], artifactsByRun: {} });
    const match = await findBaselineArtifact({ ...baseParams, api });
    expect(match).toBeUndefined();
  });
});

describe('isBundleReport', () => {
  const valid: BundleReport = {
    fingerprint: { schemaVersion: 1, collectorVersion: '1', compression: 'gzip' },
    nextVersion: '15.0.0',
    bundler: 'webpack',
    total: 100,
    routers: { app: { shared: 10 } },
    routes: [],
  };

  it('accepts a well-formed report', () => {
    expect(isBundleReport(valid)).toBe(true);
  });

  it('rejects malformed JSON shapes', () => {
    expect(isBundleReport(null)).toBe(false);
    expect(isBundleReport('not an object')).toBe(false);
    expect(isBundleReport({})).toBe(false);
    expect(isBundleReport({ ...valid, fingerprint: undefined })).toBe(false);
    expect(isBundleReport({ ...valid, routes: 'nope' })).toBe(false);
    expect(
      isBundleReport({ ...valid, fingerprint: { ...valid.fingerprint, compression: 'lzma' } }),
    ).toBe(false);
  });
});

describe('buildUnreadableBaselineComparison', () => {
  it('marks the baseline incompatible without a usable base report', () => {
    const head: BundleReport = {
      fingerprint: { schemaVersion: 1, collectorVersion: '1', compression: 'gzip' },
      nextVersion: '15.0.0',
      bundler: 'webpack',
      total: 100,
      routers: {},
      routes: [],
    };
    const comparison = buildUnreadableBaselineComparison(head);
    expect(comparison.baselineStatus).toBe('incompatible');
    expect(comparison.incompatibility?.headCompression).toBe('gzip');
    expect(comparison.totalBefore).toBeUndefined();
  });
});
