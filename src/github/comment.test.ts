import { describe, expect, it, vi } from 'vitest';
import { resolveTrustedCommentAuthors, upsertComment } from './comment.js';
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
  trustedLogins: ['github-actions[bot]'],
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

  it('matches any configured trusted login, e.g. a comment-author app slug', async () => {
    const api = fakeApi([{ id: 1, body: `${MARKER}\nold`, login: 'my-bundle-bot[bot]' }]);
    const result = await upsertComment({
      ...baseOptions,
      trustedLogins: ['github-actions[bot]', 'my-bundle-bot[bot]'],
      api,
    });
    expect(result).toEqual({ status: 'updated' });
  });

  it('does not treat an unlisted bot login as trusted, even though it is a bot', async () => {
    // Regression test: matching must be an exact-login allowlist, never "any
    // Bot-type user", or another installed GitHub App could spoof a match.
    const api = fakeApi([{ id: 1, body: `${MARKER}\nspoofed`, login: 'some-other-app[bot]' }]);
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

  it('downgrades any other error to a skipped result too, so a comment failure never aborts the run', async () => {
    const api = fakeApi([]);
    api.createIssueComment.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 500 }));
    const result = await upsertComment({ ...baseOptions, api });
    expect(result.status).toBe('skipped');
    expect((result as { reason: string }).reason).toContain('nope');
  });
});

describe('resolveTrustedCommentAuthors', () => {
  it('falls back to github-actions[bot] when GET /user is unavailable and no comment-author is set', async () => {
    const api = fakeApi([]);
    await expect(resolveTrustedCommentAuthors(api, undefined)).resolves.toEqual([
      'github-actions[bot]',
    ]);
  });

  it('trusts github-actions[bot] plus the configured comment-author when GET /user is unavailable', async () => {
    const api = fakeApi([]);
    await expect(resolveTrustedCommentAuthors(api, 'my-bundle-bot[bot]')).resolves.toEqual([
      'github-actions[bot]',
      'my-bundle-bot[bot]',
    ]);
  });

  it('uses only the authenticated login when GET /user succeeds', async () => {
    const api = fakeApi([]);
    api.getAuthenticatedLogin = async () => 'my-pat-user';
    await expect(resolveTrustedCommentAuthors(api, 'my-bundle-bot[bot]')).resolves.toEqual([
      'my-pat-user',
    ]);
  });
});
