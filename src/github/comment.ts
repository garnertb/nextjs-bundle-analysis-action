import type { GithubApi } from './types.js';

export interface UpsertCommentOptions {
  api: GithubApi;
  owner: string;
  repo: string;
  issueNumber: number;
  /** Exact hidden marker line; a comment matches only when its body starts with this. */
  marker: string;
  body: string;
  /**
   * Logins trusted as this action's own prior comment, e.g.
   * `github-actions[bot]` for the default token, the authenticated identity
   * for a custom PAT, or an explicit `comment-author` for an app
   * installation token that can't call `GET /user`. Matching a fixed set of
   * exact logins (never "any Bot-type user") keeps another installed app on
   * the same repo from spoofing a match.
   */
  trustedLogins: readonly string[];
}

export type UpsertCommentResult =
  { status: 'created' | 'updated' } | { status: 'skipped'; reason: string };

/** HTTP statuses that specifically mean "can't comment here" (fork PR, read-only token). */
const FORK_OR_READONLY_STATUSES = new Set([403, 404]);

function httpStatusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
}

/**
 * Finds the newest comment whose body starts with `marker` and was authored
 * by one of `trustedLogins`, and updates it; otherwise creates a new
 * comment. Any error posting the comment (a fork PR's read-only token, a
 * transient 5xx/429, a malformed request, ...) is downgraded to a `skipped`
 * result rather than aborting the run: the summary/outputs/annotations are
 * more important than the comment, and the caller has already written them
 * before calling this function.
 */
export async function upsertComment(options: UpsertCommentOptions): Promise<UpsertCommentResult> {
  try {
    const comments = await options.api.listIssueComments({
      owner: options.owner,
      repo: options.repo,
      issueNumber: options.issueNumber,
    });
    const trustedLogins = new Set(options.trustedLogins);
    const matches = comments.filter(
      (comment) =>
        comment.login !== undefined &&
        trustedLogins.has(comment.login) &&
        comment.body.startsWith(options.marker),
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
    const message = error instanceof Error ? error.message : String(error);
    const reason =
      status !== undefined && FORK_OR_READONLY_STATUSES.has(status)
        ? `GitHub API responded ${status} while posting the PR comment ` +
          '(likely a fork pull request or a read-only token); see the job summary for the full report.'
        : `Failed to post the PR comment (${status ?? 'unknown status'}): ${message}; see the job summary for the full report.`;
    return { status: 'skipped', reason };
  }
}

/**
 * Resolves the set of logins a prior comment may be attributed to for
 * matching purposes: the authenticated identity when the token can call
 * `GET /user` (custom PATs), or otherwise `github-actions[bot]` (the default
 * `GITHUB_TOKEN`) plus an explicit `comment-author` when one is configured
 * (needed for GitHub App installation tokens, which post as `<slug>[bot]`
 * and can't call `GET /user` to self-identify).
 */
export async function resolveTrustedCommentAuthors(
  api: GithubApi,
  commentAuthor: string | undefined,
): Promise<string[]> {
  const login = await api.getAuthenticatedLogin();
  if (login !== undefined) return [login];
  return commentAuthor ? ['github-actions[bot]', commentAuthor] : ['github-actions[bot]'];
}
