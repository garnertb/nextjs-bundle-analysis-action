import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleReport } from './collectors/types.js';
import type { GithubApi } from './github/types.js';

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
  DefaultArtifactClient: vi.fn().mockImplementation(() => ({
    uploadArtifact: artifactState.uploadArtifact,
    downloadArtifact: artifactState.downloadArtifact,
  })),
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
});
