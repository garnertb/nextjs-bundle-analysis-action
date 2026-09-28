import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BundleReport } from './collectors/types.js';
import type { ArtifactSummary, GithubApi, WorkflowRunSummary } from './github/types.js';

const FIXTURE_NEXT_DIR = 'fixtures/next/15-webpack/mixed';

interface CoreState {
  inputs: Record<string, string>;
  setOutputCalls: [string, unknown][];
  setFailedCalls: unknown[];
  summaryWrite: ReturnType<typeof vi.fn>;
}

const coreState = vi.hoisted<CoreState>(() => ({
  inputs: {},
  setOutputCalls: [],
  setFailedCalls: [],
  summaryWrite: vi.fn(async () => undefined),
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => coreState.inputs[name] ?? '',
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setOutput: (name: string, value: unknown) => coreState.setOutputCalls.push([name, value]),
  setFailed: (message: unknown) => coreState.setFailedCalls.push(message),
  summary: {
    addRaw: () => ({ write: coreState.summaryWrite }),
  },
}));

interface FakeContext {
  eventName: string;
  ref: string;
  sha: string;
  serverUrl: string;
  runId: number;
  repo: { owner: string; repo: string };
  issue: { owner: string; repo: string; number: number };
  payload: Record<string, unknown>;
}

const contextState = vi.hoisted<{ current: FakeContext }>(() => ({
  current: {
    eventName: 'push',
    ref: 'refs/heads/main',
    sha: 'headcommit0000000000000000000000000000',
    serverUrl: 'https://github.com',
    runId: 123,
    repo: { owner: 'octocat', repo: 'demo' },
    issue: { owner: 'octocat', repo: 'demo', number: 0 },
    payload: {},
  },
}));

vi.mock('@actions/github', () => ({
  context: new Proxy(
    {},
    { get: (_target, prop: string) => Reflect.get(contextState.current, prop) as unknown },
  ),
  getOctokit: vi.fn(() => ({})),
}));

const artifactState = vi.hoisted(() => ({
  uploadArtifact: vi.fn(async (..._args: unknown[]) => ({})),
  downloadArtifact: vi.fn(async (_artifactId: number, _options: { path?: string }) => ({
    downloadPath: '',
  })),
}));

vi.mock('@actions/artifact', () => ({
  // A real (non-arrow) function, since `new` on an arrow-function mock
  // implementation throws "is not a constructor".
  DefaultArtifactClient: vi.fn().mockImplementation(function DefaultArtifactClient() {
    return {
      uploadArtifact: artifactState.uploadArtifact,
      downloadArtifact: artifactState.downloadArtifact,
    };
  }),
}));

const apiState = vi.hoisted<{ fakeApi: GithubApi | undefined }>(() => ({ fakeApi: undefined }));

vi.mock('./github/api.js', () => ({
  createGithubApi: () => apiState.fakeApi,
}));

const { run } = await import('./main.js');
const { collectBundleReport } = await import('./collectors/index.js');

function defaultInputs(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'working-directory': FIXTURE_NEXT_DIR,
    'next-dir': '.next',
    'build-command': '',
    name: 'test-app',
    'base-branch': '',
    'baseline-workflow': '',
    'artifact-name': '',
    'upload-artifact': 'true',
    'github-token': 'test-token',
    comment: 'true',
    'job-summary': 'true',
    compression: 'gzip',
    'significant-change': '512B',
    'warn-route-size': '',
    'fail-route-size': '',
    'warn-route-increase': '',
    'fail-route-increase': '',
    'warn-total-increase': '',
    'fail-total-increase': '',
    'warn-shared-size': '',
    'fail-shared-size': '',
    'budgets-file': '',
    ...overrides,
  };
}

function fakeGithubApi(overrides: Partial<GithubApi> = {}): GithubApi {
  return {
    listWorkflowRuns: async function* () {},
    listWorkflowRunArtifacts: async () => [],
    listIssueComments: async () => [],
    createIssueComment: vi.fn(async () => {}),
    updateIssueComment: vi.fn(async () => {}),
    getAuthenticatedLogin: async () => undefined,
    getDefaultBranch: async () => 'main',
    getCommitParents: vi.fn(async () => []),
    ...overrides,
  };
}

function outputValue(name: string): unknown {
  return coreState.setOutputCalls.filter(([n]) => n === name).at(-1)?.[1];
}

describe('run', () => {
  let scratchRoot: string;

  beforeEach(() => {
    coreState.inputs = defaultInputs();
    coreState.setOutputCalls.length = 0;
    coreState.setFailedCalls.length = 0;
    coreState.summaryWrite.mockClear();
    artifactState.uploadArtifact.mockClear();
    artifactState.downloadArtifact.mockClear();
    contextState.current = {
      eventName: 'push',
      ref: 'refs/heads/main',
      sha: 'headcommit0000000000000000000000000000',
      serverUrl: 'https://github.com',
      runId: 123,
      repo: { owner: 'octocat', repo: 'demo' },
      issue: { owner: 'octocat', repo: 'demo', number: 0 },
      payload: {},
    };
    apiState.fakeApi = undefined;
    scratchRoot = mkdtempSync(join(tmpdir(), 'nba-main-'));
    process.env['RUNNER_TEMP'] = scratchRoot;
    process.env['GITHUB_ACTION_REF'] = 'v1.2.3';
    delete process.env['GITHUB_ACTION_REPOSITORY'];
    delete process.env['GITHUB_WORKFLOW_REF'];
  });

  afterEach(() => {
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('measures, uploads, and summarizes on a push event with no baseline lookup', async () => {
    await run();

    expect(artifactState.uploadArtifact).toHaveBeenCalledOnce();
    expect(coreState.summaryWrite).toHaveBeenCalledOnce();
    expect(outputValue('baseline-status')).toBe('missing');
    expect(outputValue('status')).toBe('pass');
    expect(coreState.setFailedCalls).toEqual([]);

    const sizesPath = outputValue('sizes-path') as string;
    const reportPath = outputValue('report-path') as string;
    expect(existsSync(sizesPath)).toBe(true);
    expect(existsSync(reportPath)).toBe(true);
    const sizes = JSON.parse(readFileSync(sizesPath, 'utf8')) as BundleReport;
    expect(sizes.routes.length).toBeGreaterThan(0);
    expect(readFileSync(reportPath, 'utf8')).toContain('Bundle sizes');
  });

  it('fails without publishing anything when the resolved Next version is below 15', async () => {
    const appDir = join(scratchRoot, 'app');
    cpSync(FIXTURE_NEXT_DIR, appDir, { recursive: true });
    mkdirSync(join(appDir, 'node_modules', 'next'), { recursive: true });
    writeFileSync(
      join(appDir, 'node_modules', 'next', 'package.json'),
      JSON.stringify({ version: '14.2.35' }),
    );
    coreState.inputs = defaultInputs({ 'working-directory': appDir });

    await run();

    expect(coreState.setFailedCalls).toEqual([
      'Next.js 14.2.35 is not supported: this action requires Next.js 15 or newer. ' +
        'See the support matrix in the README.',
    ]);
    expect(coreState.setOutputCalls).toEqual([]);
    expect(artifactState.uploadArtifact).not.toHaveBeenCalled();
    expect(coreState.summaryWrite).not.toHaveBeenCalled();
  });

  it('finds a baseline, compares it, and upserts a comment on a pull_request event', async () => {
    contextState.current.eventName = 'pull_request';
    contextState.current.payload = {
      pull_request: { base: { ref: 'main' } },
      repository: { id: 555 },
    };
    contextState.current.issue = { owner: 'octocat', repo: 'demo', number: 42 };
    process.env['GITHUB_WORKFLOW_REF'] = 'octocat/demo/.github/workflows/ci.yml@refs/heads/main';

    const baselineReport = collectBundleReport(FIXTURE_NEXT_DIR + '/.next', {
      compression: 'gzip',
    });
    artifactState.downloadArtifact.mockImplementation(
      async (_id: number, options: { path?: string }) => {
        const dir = options.path!;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'bundle-sizes.json'), JSON.stringify(baselineReport));
        return { downloadPath: dir };
      },
    );

    const api = fakeGithubApi({
      listWorkflowRuns: async function* () {
        yield { id: 1, headSha: 'abcdef1234567890', headRepositoryId: 555 };
      },
      listWorkflowRunArtifacts: async () => [
        { id: 10, name: 'next-bundle-sizes-test-app', expired: false },
      ],
    });
    apiState.fakeApi = api;

    await run();

    expect(outputValue('baseline-status')).toBe('found');
    expect(api.createIssueComment).toHaveBeenCalledOnce();
    expect(api.updateIssueComment).not.toHaveBeenCalled();
  });

  function fakeGithubApiFilteringByHeadSha(
    runs: WorkflowRunSummary[],
    artifactsByRunId: Record<number, ArtifactSummary[]>,
    overrides: Partial<GithubApi> = {},
  ): GithubApi {
    return fakeGithubApi({
      listWorkflowRuns: async function* (params) {
        for (const run of runs) {
          if (params.headSha !== undefined && run.headSha !== params.headSha) continue;
          yield run;
        }
      },
      listWorkflowRunArtifacts: async (params) => artifactsByRunId[params.runId] ?? [],
      ...overrides,
    });
  }

  function mockBaselineDownload(): void {
    const baselineReport = collectBundleReport(FIXTURE_NEXT_DIR + '/.next', {
      compression: 'gzip',
    });
    artifactState.downloadArtifact.mockImplementation(
      async (_id: number, options: { path?: string }) => {
        const dir = options.path!;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'bundle-sizes.json'), JSON.stringify(baselineReport));
        return { downloadPath: dir };
      },
    );
  }

  const BASE_COMMIT_SHA = 'basecommit111111111111111111111111111';
  const PR_HEAD_SHA = 'prhead222222222222222222222222222222';
  const NEWER_PUSH_SHA = 'newerpush33333333333333333333333333';
  const PAYLOAD_BASE_SHA = 'payloadbase0000000000000000000000000';

  function setUpBaseCommitPullRequest(payloadBaseSha: string | undefined): void {
    contextState.current.eventName = 'pull_request';
    contextState.current.sha = 'headcommit0000000000000000000000000000';
    contextState.current.payload = {
      pull_request: { base: { ref: 'main', sha: payloadBaseSha } },
      repository: { id: 555 },
    };
    contextState.current.issue = { owner: 'octocat', repo: 'demo', number: 42 };
    process.env['GITHUB_WORKFLOW_REF'] = 'octocat/demo/.github/workflows/ci.yml@refs/heads/main';
  }

  it("prefers an exact match on the PR's base commit over a newer push run (baseline-status: found)", async () => {
    setUpBaseCommitPullRequest(PAYLOAD_BASE_SHA);
    mockBaselineDownload();

    const api = fakeGithubApiFilteringByHeadSha(
      [
        { id: 2, headSha: NEWER_PUSH_SHA, headRepositoryId: 555 },
        { id: 1, headSha: BASE_COMMIT_SHA, headRepositoryId: 555 },
      ],
      {
        1: [{ id: 10, name: 'next-bundle-sizes-test-app', expired: false }],
        2: [{ id: 20, name: 'next-bundle-sizes-test-app', expired: false }],
      },
      { getCommitParents: vi.fn(async () => [BASE_COMMIT_SHA, PR_HEAD_SHA]) },
    );
    apiState.fakeApi = api;

    await run();

    expect(outputValue('baseline-status')).toBe('found');
    expect(api.getCommitParents).toHaveBeenCalledWith(
      expect.objectContaining({ sha: contextState.current.sha }),
    );
  });

  it('falls back to the latest trusted run and reports a stale baseline when the base commit has no run', async () => {
    setUpBaseCommitPullRequest(PAYLOAD_BASE_SHA);
    mockBaselineDownload();

    const api = fakeGithubApiFilteringByHeadSha(
      [{ id: 2, headSha: NEWER_PUSH_SHA, headRepositoryId: 555 }],
      { 2: [{ id: 20, name: 'next-bundle-sizes-test-app', expired: false }] },
      { getCommitParents: vi.fn(async () => [BASE_COMMIT_SHA, PR_HEAD_SHA]) },
    );
    apiState.fakeApi = api;

    await run();

    expect(outputValue('baseline-status')).toBe('stale');
    expect(outputValue('total-delta')).not.toBe('');
    expect(outputValue('total-delta')).not.toBeUndefined();
  });

  it.each([
    [
      'a getCommit API error',
      async () => Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })),
    ],
    ['a commit with a single parent (linear history)', async () => [BASE_COMMIT_SHA]],
    [
      'a commit with three parents (octopus merge)',
      async () => [BASE_COMMIT_SHA, PR_HEAD_SHA, 'thirdparent4444444444444444444444444'],
    ],
  ])(
    "falls back to the payload's base sha and warns when the base commit can't be resolved (%s)",
    async (_label, getCommitParentsImpl) => {
      setUpBaseCommitPullRequest(PAYLOAD_BASE_SHA);
      mockBaselineDownload();

      const api = fakeGithubApiFilteringByHeadSha(
        [{ id: 1, headSha: PAYLOAD_BASE_SHA, headRepositoryId: 555 }],
        { 1: [{ id: 10, name: 'next-bundle-sizes-test-app', expired: false }] },
        { getCommitParents: vi.fn(getCommitParentsImpl) },
      );
      apiState.fakeApi = api;
      const core = await import('@actions/core');
      const warningCallsBefore = vi.mocked(core.warning).mock.calls.length;

      await run();

      expect(outputValue('baseline-status')).toBe('found');
      expect(vi.mocked(core.warning).mock.calls.length).toBeGreaterThan(warningCallsBefore);
    },
  );

  it("still resolves the base commit when base-branch input matches the PR's base ref", async () => {
    coreState.inputs = defaultInputs({ 'base-branch': 'main' });
    setUpBaseCommitPullRequest(PAYLOAD_BASE_SHA);
    mockBaselineDownload();

    const api = fakeGithubApiFilteringByHeadSha(
      [{ id: 1, headSha: BASE_COMMIT_SHA, headRepositoryId: 555 }],
      { 1: [{ id: 10, name: 'next-bundle-sizes-test-app', expired: false }] },
      { getCommitParents: vi.fn(async () => [BASE_COMMIT_SHA, PR_HEAD_SHA]) },
    );
    apiState.fakeApi = api;

    await run();

    expect(api.getCommitParents).toHaveBeenCalled();
    expect(outputValue('baseline-status')).toBe('found');
  });

  it("skips base-commit resolution when base-branch overrides the PR's actual base branch", async () => {
    coreState.inputs = defaultInputs({ 'base-branch': 'develop' });
    setUpBaseCommitPullRequest(PAYLOAD_BASE_SHA);
    mockBaselineDownload();

    const api = fakeGithubApiFilteringByHeadSha(
      [{ id: 1, headSha: 'developheadsha00000000000000000000000', headRepositoryId: 555 }],
      { 1: [{ id: 10, name: 'next-bundle-sizes-test-app', expired: false }] },
      { getCommitParents: vi.fn(async () => [BASE_COMMIT_SHA, PR_HEAD_SHA]) },
    );
    apiState.fakeApi = api;

    await run();

    expect(api.getCommitParents).not.toHaveBeenCalled();
    expect(outputValue('baseline-status')).toBe('found');
  });

  it.each(['push', 'workflow_dispatch'])(
    'never calls getCommitParents or looks up a baseline on a %s event',
    async (eventName) => {
      contextState.current.eventName = eventName;
      const getCommitParents = vi.fn(async () => [BASE_COMMIT_SHA, PR_HEAD_SHA]);
      apiState.fakeApi = fakeGithubApi({ getCommitParents });

      await run();

      expect(getCommitParents).not.toHaveBeenCalled();
    },
  );

  it('reports a missing baseline when no matching run is found', async () => {
    contextState.current.eventName = 'pull_request';
    contextState.current.payload = {
      pull_request: { base: { ref: 'main' } },
      repository: { id: 555 },
    };
    contextState.current.issue = { owner: 'octocat', repo: 'demo', number: 42 };
    process.env['GITHUB_WORKFLOW_REF'] = 'octocat/demo/.github/workflows/ci.yml@refs/heads/main';
    apiState.fakeApi = fakeGithubApi();

    await run();

    expect(outputValue('baseline-status')).toBe('missing');
  });

  it('warns and still writes outputs/summary when the baseline lookup errors (e.g. missing actions: read)', async () => {
    contextState.current.eventName = 'pull_request';
    contextState.current.payload = {
      pull_request: { base: { ref: 'main' } },
      repository: { id: 555 },
    };
    contextState.current.issue = { owner: 'octocat', repo: 'demo', number: 42 };
    process.env['GITHUB_WORKFLOW_REF'] = 'octocat/demo/.github/workflows/ci.yml@refs/heads/main';
    apiState.fakeApi = fakeGithubApi({
      // eslint-disable-next-line require-yield -- deliberately throws before ever yielding a run
      listWorkflowRuns: async function* () {
        throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
      },
    });

    await run();

    expect(outputValue('baseline-status')).toBe('missing');
    expect(outputValue('status')).not.toBeUndefined();
    expect(coreState.summaryWrite).toHaveBeenCalledOnce();
    expect(coreState.setFailedCalls).toEqual([]);
    const reportPath = outputValue('report-path') as string;
    expect(existsSync(reportPath)).toBe(true);
  });

  it('downgrades a comment API error to a warning and still writes outputs/summary', async () => {
    contextState.current.eventName = 'pull_request';
    contextState.current.payload = {
      pull_request: { base: { ref: 'main' } },
      repository: { id: 555 },
    };
    contextState.current.issue = { owner: 'octocat', repo: 'demo', number: 42 };
    const api = fakeGithubApi();
    (api.createIssueComment as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Unprocessable Entity'), { status: 422 }),
    );
    apiState.fakeApi = api;

    await run();

    expect(coreState.summaryWrite).toHaveBeenCalledOnce();
    expect(coreState.setFailedCalls).toEqual([]);
    const reportPath = outputValue('report-path') as string;
    expect(existsSync(reportPath)).toBe(true);
  });

  it('throws when next-dir has no measurable routes', async () => {
    coreState.inputs = defaultInputs({ 'next-dir': '.nxt-typo' });
    await run();
    expect(coreState.setFailedCalls).toHaveLength(1);
  });

  it('sets failed only when a fail threshold is breached', async () => {
    coreState.inputs = defaultInputs({ 'fail-route-size': '1B' });
    await run();
    expect(coreState.setFailedCalls).toHaveLength(1);
    expect(outputValue('status')).toBe('fail');
  });

  it('does not set failed when only warnings are produced', async () => {
    coreState.inputs = defaultInputs({ 'warn-route-size': '1B' });
    await run();
    expect(coreState.setFailedCalls).toEqual([]);
    expect(outputValue('status')).toBe('warn');
  });

  describe('footer action version', () => {
    const ACTION_REPO = 'garnertb/nextjs-bundle-analysis-action';

    function footer(): string {
      const markdown = readFileSync(outputValue('report-path') as string, 'utf8');
      const line = markdown.split('\n').find((l) => l.includes('nextjs-bundle-analysis-action'));
      if (line === undefined) throw new Error('footer line not found');
      return line;
    }

    it("links the action's own repository at its ref, not the workflow's repository", async () => {
      process.env['GITHUB_ACTION_REPOSITORY'] = ACTION_REPO;
      await run();
      expect(footer()).toContain(
        `nextjs-bundle-analysis-action [v1.2.3](https://github.com/${ACTION_REPO}/tree/v1.2.3)`,
      );
      expect(footer()).not.toContain('octocat/demo');
    });

    it('renders plain text when only the ref is set', async () => {
      await run();
      expect(footer()).toMatch(/nextjs-bundle-analysis-action v1\.2\.3<\/sub>$/);
    });

    it('renders plain text when only the repository is set', async () => {
      process.env['GITHUB_ACTION_REPOSITORY'] = ACTION_REPO;
      delete process.env['GITHUB_ACTION_REF'];
      await run();
      expect(footer()).toMatch(/nextjs-bundle-analysis-action dev<\/sub>$/);
    });

    it('renders dev without a link when the ref is empty (uses: ./)', async () => {
      process.env['GITHUB_ACTION_REPOSITORY'] = '';
      process.env['GITHUB_ACTION_REF'] = '';
      await run();
      expect(footer()).toMatch(/nextjs-bundle-analysis-action dev<\/sub>$/);
    });

    it('renders plain text on a GHES server', async () => {
      process.env['GITHUB_ACTION_REPOSITORY'] = ACTION_REPO;
      contextState.current = { ...contextState.current, serverUrl: 'https://ghe.example.com' };
      await run();
      expect(footer()).toMatch(/nextjs-bundle-analysis-action v1\.2\.3<\/sub>$/);
    });
  });
});
