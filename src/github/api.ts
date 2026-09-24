import type { getOctokit } from '@actions/github';
import type {
  ArtifactSummary,
  CommentSummary,
  CreateCommentParams,
  GithubApi,
  IssueScopedParams,
  ListWorkflowRunsParams,
  RunScopedParams,
  UpdateCommentParams,
  WorkflowRunSummary,
} from './types.js';

export type Octokit = ReturnType<typeof getOctokit>;

/** Runs fetched per page while paginating `listWorkflowRuns`. */
const WORKFLOW_RUNS_PAGE_SIZE = 50;

async function* listWorkflowRuns(
  octokit: Octokit,
  params: ListWorkflowRunsParams,
): AsyncGenerator<WorkflowRunSummary> {
  const iterator = octokit.paginate.iterator(octokit.rest.actions.listWorkflowRuns, {
    owner: params.owner,
    repo: params.repo,
    workflow_id: params.workflowFile,
    branch: params.branch,
    event: 'push',
    status: 'success',
    per_page: WORKFLOW_RUNS_PAGE_SIZE,
  });
  for await (const { data: runs } of iterator) {
    for (const run of runs) {
      yield {
        id: run.id,
        headSha: run.head_sha,
        headRepositoryId: run.head_repository?.id,
      };
    }
  }
}

async function listWorkflowRunArtifacts(
  octokit: Octokit,
  params: RunScopedParams,
): Promise<ArtifactSummary[]> {
  const { data } = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner: params.owner,
    repo: params.repo,
    run_id: params.runId,
    per_page: 100,
  });
  return data.artifacts.map((artifact) => ({
    id: artifact.id,
    name: artifact.name,
    expired: artifact.expired,
  }));
}

async function listIssueComments(
  octokit: Octokit,
  params: IssueScopedParams,
): Promise<CommentSummary[]> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: params.owner,
    repo: params.repo,
    issue_number: params.issueNumber,
    per_page: 100,
  });
  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body ?? '',
    login: comment.user?.login,
  }));
}

async function createIssueComment(octokit: Octokit, params: CreateCommentParams): Promise<void> {
  await octokit.rest.issues.createComment({
    owner: params.owner,
    repo: params.repo,
    issue_number: params.issueNumber,
    body: params.body,
  });
}

async function updateIssueComment(octokit: Octokit, params: UpdateCommentParams): Promise<void> {
  await octokit.rest.issues.updateComment({
    owner: params.owner,
    repo: params.repo,
    comment_id: params.commentId,
    body: params.body,
  });
}

async function getAuthenticatedLogin(octokit: Octokit): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return data.login;
  } catch {
    // The default `GITHUB_TOKEN` (and most GitHub App installation tokens)
    // can't call `GET /user`; the caller falls back to `github-actions[bot]`.
    return undefined;
  }
}

async function getDefaultBranch(
  octokit: Octokit,
  params: { owner: string; repo: string },
): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner: params.owner, repo: params.repo });
  return data.default_branch;
}

/** Wraps a hydrated Octokit instance in the small {@link GithubApi} surface this action uses. */
export function createGithubApi(octokit: Octokit): GithubApi {
  return {
    listWorkflowRuns: (params) => listWorkflowRuns(octokit, params),
    listWorkflowRunArtifacts: (params) => listWorkflowRunArtifacts(octokit, params),
    listIssueComments: (params) => listIssueComments(octokit, params),
    createIssueComment: (params) => createIssueComment(octokit, params),
    updateIssueComment: (params) => updateIssueComment(octokit, params),
    getAuthenticatedLogin: () => getAuthenticatedLogin(octokit),
    getDefaultBranch: (params) => getDefaultBranch(octokit, params),
  };
}
