import type { GithubApi } from './types.js';

export interface UpsertCommentOptions {
  api: GithubApi;
  owner: string;
  repo: string;
  issueNumber: number;
  /** Exact hidden marker line; a comment matches only when its body starts with this. */
  marker: string;
  body: string;
  /** `github-actions[bot]` for the default token, or the authenticated identity otherwise. */
  trustedLogin: string;
}

export type UpsertCommentResult =
  { status: 'created' | 'updated' } | { status: 'skipped'; reason: string };

/** HTTP statuses that mean "can't comment here" (fork PR, read-only token) rather than a real failure. */
const DOWNGRADE_STATUSES = new Set([403, 404]);

function httpStatusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
}

/**
 * Finds the newest comment whose body starts with `marker` and was authored
 * by `trustedLogin`, and updates it; otherwise creates a new comment. A
 * 403/404 (fork PR or read-only token) is downgraded to a `skipped` result
 * instead of throwing.
 */
export async function upsertComment(options: UpsertCommentOptions): Promise<UpsertCommentResult> {
  try {
    const comments = await options.api.listIssueComments({
      owner: options.owner,
      repo: options.repo,
      issueNumber: options.issueNumber,
    });
    const matches = comments.filter(
      (comment) =>
        comment.login === options.trustedLogin && comment.body.startsWith(options.marker),
    );
    const newestMatch = matches.at(-1);

    if (newestMatch) {
      await options.api.updateIssueComment({
        owner: options.owner,
        repo: options.repo,
        commentId: newestMatch.id,
        body: options.body,
      });
      return { status: 'updated' };
    }

    await options.api.createIssueComment({
      owner: options.owner,
      repo: options.repo,
      issueNumber: options.issueNumber,
      body: options.body,
    });
    return { status: 'created' };
  } catch (error) {
    const status = httpStatusOf(error);
    if (status !== undefined && DOWNGRADE_STATUSES.has(status)) {
      return {
        status: 'skipped',
        reason:
          `GitHub API responded ${status} while posting the PR comment ` +
          '(likely a fork pull request or a read-only token); see the job summary for the full report.',
      };
    }
    throw error;
  }
}

/**
 * Resolves the login comments should be attributed to for matching purposes:
 * the authenticated identity when the token can call `GET /user` (custom
 * PATs/App tokens), otherwise `github-actions[bot]` (the default `GITHUB_TOKEN`).
 */
export async function resolveTrustedCommentAuthor(api: GithubApi): Promise<string> {
  const login = await api.getAuthenticatedLogin();
  return login ?? 'github-actions[bot]';
}
