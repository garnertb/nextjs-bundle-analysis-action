const GITHUB_ORIGIN = 'https://github.com';
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface ActionUrlParams {
  /** The server running the workflow (`GITHUB_SERVER_URL`). */
  serverUrl: string | undefined;
  /** `owner/repo` of the action itself (`GITHUB_ACTION_REPOSITORY`), not the workflow's repo. */
  repository: string | undefined;
  /** The ref the action ran at (`GITHUB_ACTION_REF`): a tag, branch, or SHA. */
  ref: string | undefined;
}

function encodeRefSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[()'!*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Builds `https://github.com/<repository>/tree/<ref>` for linking the report
 * footer to the action's source, or `undefined` when it can't be trusted to
 * resolve: a missing ref/repository (`uses: ./`, the CLI), a malformed
 * repository, or a server other than github.com (on GHES the action may have
 * been fetched from github.com via GitHub Connect, and no env var says so).
 * Every ref segment is percent-encoded, so the result contains nothing that
 * can terminate a Markdown link destination.
 */
export function buildActionUrl(params: ActionUrlParams): string | undefined {
  const { serverUrl, repository, ref } = params;
  if (!ref || !repository || !serverUrl || !REPOSITORY_PATTERN.test(repository)) return undefined;
  let origin: string;
  try {
    origin = new URL(serverUrl).origin;
  } catch {
    return undefined;
  }
  if (origin !== GITHUB_ORIGIN) return undefined;
  return `${GITHUB_ORIGIN}/${repository}/tree/${ref.split('/').map(encodeRefSegment).join('/')}`;
}
