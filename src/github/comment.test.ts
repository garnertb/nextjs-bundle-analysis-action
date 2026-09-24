import { describe, expect, it, vi } from 'vitest';
import { resolveTrustedCommentAuthor, upsertComment } from './comment.js';
import type { CommentSummary, GithubApi } from './types.js';

const MARKER = '<!-- nextjs-bundle-analysis:web -->';

function fakeApi(comments: CommentSummary[]): GithubApi & {
  createIssueComment: ReturnType<typeof vi.fn>;
  updateIssueComment: ReturnType<typeof vi.fn>;
} {
  return {
    listWorkflowRuns: async function* () {},
    listWorkflowRunArtifacts: async () => [],
    listIssueComments: async () => comments,
    createIssueComment: vi.fn(async () => {}),
    updateIssueComment: vi.fn(async () => {}),
    getAuthenticatedLogin: async () => undefined,
    getDefaultBranch: async () => 'main',
  };
}

const baseOptions = {
  owner: 'octocat',
  repo: 'hello-world',
  issueNumber: 1,
  marker: MARKER,
  body: `${MARKER}\nreport`,
  trustedLogin: 'github-actions[bot]',
};

describe('upsertComment', () => {
  it('creates a comment when no match exists', async () => {
    const api = fakeApi([]);
    const result = await upsertComment({ ...baseOptions, api });
    expect(result).toEqual({ status: 'created' });
    expect(api.createIssueComment).toHaveBeenCalledOnce();
    expect(api.updateIssueComment).not.toHaveBeenCalled();
  });

  it('updates the newest matching comment', async () => {
    const api = fakeApi([
      { id: 1, body: `${MARKER}\nold report 1`, login: 'github-actions[bot]' },
      { id: 2, body: `${MARKER}\nold report 2`, login: 'github-actions[bot]' },
    ]);
    const result = await upsertComment({ ...baseOptions, api });
    expect(result).toEqual({ status: 'updated' });
    expect(api.updateIssueComment).toHaveBeenCalledWith(expect.objectContaining({ commentId: 2 }));
    expect(api.createIssueComment).not.toHaveBeenCalled();
  });

  it('only matches a comment whose body STARTS WITH the marker', async () => {
    const api = fakeApi([
      { id: 1, body: `some preamble\n${MARKER}\nspoofed`, login: 'github-actions[bot]' },
    ]);
    const result = await upsertComment({ ...baseOptions, api });
    expect(result).toEqual({ status: 'created' });
    expect(api.createIssueComment).toHaveBeenCalledOnce();
  });

  it('ignores a matching-body comment from an untrusted author', async () => {
    const api = fakeApi([{ id: 1, body: `${MARKER}\nspoofed`, login: 'some-random-user' }]);
    const result = await upsertComment({ ...baseOptions, api });
    expect(result).toEqual({ status: 'created' });
  });

  it('downgrades a 403 to a skipped result', async () => {
    const api = fakeApi([]);
    api.createIssueComment.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );
    const result = await upsertComment({ ...baseOptions, api });
    expect(result.status).toBe('skipped');
  });

  it('downgrades a 404 to a skipped result', async () => {
    const api = fakeApi([]);
    api.createIssueComment.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );
    const result = await upsertComment({ ...baseOptions, api });
    expect(result.status).toBe('skipped');
  });

  it('rethrows other errors', async () => {
    const api = fakeApi([]);
    api.createIssueComment.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 500 }));
    await expect(upsertComment({ ...baseOptions, api })).rejects.toThrow('nope');
  });
});

describe('resolveTrustedCommentAuthor', () => {
  it('falls back to github-actions[bot] when GET /user is unavailable', async () => {
    const api = fakeApi([]);
    await expect(resolveTrustedCommentAuthor(api)).resolves.toBe('github-actions[bot]');
  });

  it('uses the authenticated login when available', async () => {
    const api = fakeApi([]);
    api.getAuthenticatedLogin = async () => 'my-pat-user';
    await expect(resolveTrustedCommentAuthor(api)).resolves.toBe('my-pat-user');
  });
});
