/** Minimal per-run data the baseline lookup needs. */
export interface WorkflowRunSummary {
  id: number;
  headSha: string;
  /** `undefined` when the API omits `head_repository` (older/forked-run edge cases). */
  headRepositoryId: number | undefined;
}

/** Minimal per-artifact data the baseline lookup needs. */
export interface ArtifactSummary {
  id: number;
  name: string;
  expired: boolean;
}

export interface CommentSummary {
  id: number;
  body: string;
  /** `undefined` for a deleted/ghost author. */
  login: string | undefined;
}

export interface ListWorkflowRunsParams {
  owner: string;
  repo: string;
  workflowFile: string;
  branch: string;
}

export interface RunScopedParams {
  owner: string;
  repo: string;
  runId: number;
}

export interface IssueScopedParams {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface CreateCommentParams extends IssueScopedParams {
  body: string;
}

export interface UpdateCommentParams {
  owner: string;
  repo: string;
  commentId: number;
  body: string;
}

/**
 * A small, purpose-built surface over the Octokit REST calls this action
 * needs, so tests can supply a plain object instead of mocking Octokit's
 * deeply nested shape. `listWorkflowRuns` is an async iterable so callers
 * can stop paging as soon as they find a trusted, non-expired artifact.
 */
export interface GithubApi {
  listWorkflowRuns(params: ListWorkflowRunsParams): AsyncIterable<WorkflowRunSummary>;
  listWorkflowRunArtifacts(params: RunScopedParams): Promise<ArtifactSummary[]>;
  listIssueComments(params: IssueScopedParams): Promise<CommentSummary[]>;
  createIssueComment(params: CreateCommentParams): Promise<void>;
  updateIssueComment(params: UpdateCommentParams): Promise<void>;
  /** `undefined` when the token can't call `GET /user` (e.g. the default `GITHUB_TOKEN`). */
  getAuthenticatedLogin(): Promise<string | undefined>;
  getDefaultBranch(params: { owner: string; repo: string }): Promise<string>;
}
