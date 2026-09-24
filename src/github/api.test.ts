import { describe, expect, it, vi } from 'vitest';
import { createGithubApi, type Octokit } from './api.js';

function fakeOctokit(overrides: Record<string, unknown> = {}): Octokit {
  const base = {
    paginate: Object.assign(
      vi.fn(async () => []),
      {
        iterator: vi.fn(function* () {}),
      },
    ),
    rest: {
      actions: {
        listWorkflowRuns: vi.fn(),
        listWorkflowRunArtifacts: vi.fn(async () => ({ data: { artifacts: [] } })),
      },
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn(async () => ({})),
        updateComment: vi.fn(async () => ({})),
      },
      users: {
        getAuthenticated: vi.fn(async () => ({ data: { login: 'a-user' } })),
      },
      repos: {
        get: vi.fn(async () => ({ data: { default_branch: 'main' } })),
      },
    },
  };
  return { ...base, ...overrides } as unknown as Octokit;
}

describe('createGithubApi', () => {
  it('paginates workflow runs and maps fields, including a missing head_repository', async () => {
    const octokit = fakeOctokit({
      paginate: Object.assign(vi.fn(), {
        iterator: vi.fn(function* () {
          yield {
            data: [
              { id: 1, head_sha: 'aaa', head_repository: { id: 42 } },
              { id: 2, head_sha: 'bbb', head_repository: undefined },
            ],
          };
        }),
      }),
    });
    const api = createGithubApi(octokit);

    const runs = [];
    for await (const run of api.listWorkflowRuns({
      owner: 'o',
      repo: 'r',
      workflowFile: 'ci.yml',
      branch: 'main',
    })) {
      runs.push(run);
    }

    expect(runs).toEqual([
      { id: 1, headSha: 'aaa', headRepositoryId: 42 },
      { id: 2, headSha: 'bbb', headRepositoryId: undefined },
    ]);
    expect(octokit.paginate.iterator).toHaveBeenCalledWith(
      octokit.rest.actions.listWorkflowRuns,
      expect.objectContaining({ owner: 'o', repo: 'r', workflow_id: 'ci.yml', branch: 'main' }),
    );
  });

  it('lists workflow run artifacts and passes through expired', async () => {
    const octokit = fakeOctokit({
      rest: {
        actions: {
          listWorkflowRunArtifacts: vi.fn(async () => ({
            data: {
              artifacts: [
                { id: 1, name: 'sizes', expired: false },
                { id: 2, name: 'sizes-old', expired: true },
              ],
            },
          })),
        },
      },
    });
    const api = createGithubApi(octokit);

    const artifacts = await api.listWorkflowRunArtifacts({ owner: 'o', repo: 'r', runId: 9 });

    expect(artifacts).toEqual([
      { id: 1, name: 'sizes', expired: false },
      { id: 2, name: 'sizes-old', expired: true },
    ]);
  });

  it('lists issue comments, defaulting a null body and preserving a missing login', async () => {
    const octokit = fakeOctokit({
      paginate: vi.fn(async () => [
        { id: 1, body: 'hello', user: { login: 'someone' } },
        { id: 2, body: null, user: undefined },
      ]),
    });
    const api = createGithubApi(octokit);

    const comments = await api.listIssueComments({ owner: 'o', repo: 'r', issueNumber: 5 });

    expect(comments).toEqual([
      { id: 1, body: 'hello', login: 'someone' },
      { id: 2, body: '', login: undefined },
    ]);
  });

  it('creates an issue comment', async () => {
    const octokit = fakeOctokit();
    const api = createGithubApi(octokit);

    await api.createIssueComment({ owner: 'o', repo: 'r', issueNumber: 5, body: 'hi' });

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      issue_number: 5,
      body: 'hi',
    });
  });

  it('updates an issue comment', async () => {
    const octokit = fakeOctokit();
    const api = createGithubApi(octokit);

    await api.updateIssueComment({ owner: 'o', repo: 'r', commentId: 7, body: 'edited' });

    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      comment_id: 7,
      body: 'edited',
    });
  });

  it('returns the authenticated login when GET /user succeeds', async () => {
    const api = createGithubApi(fakeOctokit());
    await expect(api.getAuthenticatedLogin()).resolves.toBe('a-user');
  });

  it('returns undefined when GET /user fails (e.g. the default GITHUB_TOKEN)', async () => {
    const octokit = fakeOctokit({
      rest: {
        users: {
          getAuthenticated: vi.fn(async () => {
            throw new Error('403');
          }),
        },
      },
    });
    const api = createGithubApi(octokit);

    await expect(api.getAuthenticatedLogin()).resolves.toBeUndefined();
  });

  it('gets the repository default branch', async () => {
    const octokit = fakeOctokit({
      rest: {
        repos: {
          get: vi.fn(async () => ({ data: { default_branch: 'develop' } })),
        },
      },
    });
    const api = createGithubApi(octokit);

    await expect(api.getDefaultBranch({ owner: 'o', repo: 'r' })).resolves.toBe('develop');
  });
});
