import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectBundleReport } from './collectors/index.js';
import { buildThresholdConfigFromInputs } from './config.js';
import { annotateFindings } from './github/annotate.js';
import {
  ARTIFACT_SIZES_FILENAME,
  downloadBaselineReport,
  uploadSizesArtifact,
} from './github/artifact.js';
import { createGithubApi } from './github/api.js';
import { buildUnreadableBaselineComparison, findBaselineArtifact } from './github/baseline.js';
import { runBuildCommand } from './github/build.js';
import { resolveTrustedCommentAuthors, upsertComment } from './github/comment.js';
import { buildJobSummaryUrl, writeJobSummary } from './github/summary.js';
import type { GithubApi } from './github/types.js';
import { parseWorkflowFileFromRef } from './github/workflow-ref.js';
import { parseInputs, type ActionInputs, type RawInputs } from './inputs.js';
import { buildActionUrl } from './report/action-url.js';
import { compareBundleReports, toThresholdInput, type Comparison } from './report/compare.js';
import { renderFullReport, renderReport, type ReportMeta } from './report/render.js';
import { slugify } from './slug.js';
import { evaluateThresholds } from './thresholds/evaluate.js';
import { parseByteSize } from './thresholds/size-value.js';
import type { Finding, ThresholdConfig } from './thresholds/types.js';

const INPUT_NAMES = [
  'working-directory',
  'next-dir',
  'build-command',
  'name',
  'base-branch',
  'baseline-workflow',
  'artifact-name',
  'upload-artifact',
  'github-token',
  'comment',
  'comment-author',
  'job-summary',
  'compression',
  'significant-change',
  'warn-route-size',
  'fail-route-size',
  'warn-route-increase',
  'fail-route-increase',
  'warn-total-increase',
  'fail-total-increase',
  'warn-shared-size',
  'fail-shared-size',
  'budgets-file',
] as const;

function readRawInputs(): RawInputs {
  const raw: RawInputs = {};
  for (const name of INPUT_NAMES) {
    raw[name] = core.getInput(name);
  }
  return raw;
}

function readPackageName(workingDirectory: string): string | undefined {
  const path = join(workingDirectory, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/** A run-scoped scratch directory under `RUNNER_TEMP` (or the OS temp dir when run locally). */
function scratchDirectory(...parts: string[]): string {
  const base = process.env['RUNNER_TEMP'] ?? tmpdir();
  const dir = join(base, 'nextjs-bundle-analysis', ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function findingCounts(findings: Finding[]): { warningCount: number; failureCount: number } {
  return {
    warningCount: findings.filter((f) => f.level === 'warn').length,
    failureCount: findings.filter((f) => f.level === 'fail').length,
  };
}

interface FinalizeParams {
  sizesPath: string;
  reportPath: string;
  comparison: Comparison;
  findings: Finding[];
  meta: ReportMeta;
  jobSummary: boolean;
}

/** Renders, writes the report file, writes the job summary, annotates, and sets outputs/setFailed. Shared by every event path. */
async function finalizeReport(params: FinalizeParams): Promise<void> {
  const { comparison, findings, meta } = params;
  const { markdown } = renderReport(comparison, findings, meta);
  writeFileSync(params.reportPath, markdown);

  if (params.jobSummary) {
    await writeJobSummary({ markdown: renderFullReport(comparison, findings, meta) });
  }

  annotateFindings({ findings });

  const { warningCount, failureCount } = findingCounts(findings);
  const status = failureCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass';
  core.setOutput('sizes-path', params.sizesPath);
  core.setOutput('report-path', params.reportPath);
  core.setOutput('status', status);
  core.setOutput('baseline-status', comparison.baselineStatus);
  core.setOutput('total-size', String(comparison.totalAfter));
  core.setOutput(
    'total-delta',
    comparison.totalDeltaBytes === undefined ? '' : String(comparison.totalDeltaBytes),
  );
  core.setOutput('warning-count', String(warningCount));
  core.setOutput('failure-count', String(failureCount));

  if (failureCount > 0) {
    core.setFailed(
      `${failureCount} bundle-size ${failureCount === 1 ? 'check' : 'checks'} failed.`,
    );
  }
}

interface BuildMetaParams {
  inputs: ActionInputs;
  name: string;
  slug: string;
  baseBranch: string;
  baseShortSha: string | undefined;
  head: { nextVersion: string | undefined; bundler: string | undefined };
  thresholds: ThresholdConfig;
  actionVersion: string;
  actionUrl: string | undefined;
  repoUrl: string;
  jobSummaryUrl: string | undefined;
  baselineWarning: string | undefined;
}

function buildReportMeta(params: BuildMetaParams): ReportMeta {
  return {
    name: params.name,
    slug: params.slug,
    baseBranch: params.baseBranch,
    baseShortSha: params.baseShortSha,
    compression: params.inputs.compression,
    significantChangeBytes: parseByteSize(params.inputs.significantChange),
    thresholds: params.thresholds,
    budgetsFilePath: params.inputs.budgetsFile,
    nextVersion: params.head.nextVersion,
    bundler: params.head.bundler,
    actionVersion: params.actionVersion,
    actionUrl: params.actionUrl,
    jobSummaryUrl: params.jobSummaryUrl,
    repoUrl: params.repoUrl,
    baselineWarning: params.baselineWarning,
  };
}

interface ResolveBaselineParams {
  api: GithubApi;
  inputs: ActionInputs;
  owner: string;
  repo: string;
  artifactName: string;
  head: Parameters<typeof compareBundleReports>[0];
  pullRequestBaseRef: string | undefined;
  repositoryId: number | undefined;
  slug: string;
}

interface ResolvedBaseline {
  comparison: Comparison;
  baseBranch: string;
  baseShortSha: string | undefined;
  /** Set when the lookup itself errored, so the caller can surface it in the report. */
  warning: string | undefined;
}

/** Baseline lookup + download for the `pull_request` path; degrades to a warning + "missing"/"incompatible" status rather than throwing. */
async function resolveBaseline(params: ResolveBaselineParams): Promise<ResolvedBaseline> {
  const workflowFile =
    params.inputs.baselineWorkflow ?? parseWorkflowFileFromRef(process.env['GITHUB_WORKFLOW_REF']);
  let baseBranch = params.inputs.baseBranch ?? params.pullRequestBaseRef;

  try {
    baseBranch ??= await params.api.getDefaultBranch(params);

    if (workflowFile === undefined) {
      core.warning('Could not determine the baseline workflow file; skipping the baseline lookup.');
      return {
        comparison: compareBundleReports(params.head, undefined),
        baseBranch,
        baseShortSha: undefined,
        warning: undefined,
      };
    }
    if (params.repositoryId === undefined) {
      core.warning(
        "Could not determine this repository's ID; skipping the trusted baseline lookup.",
      );
      return {
        comparison: compareBundleReports(params.head, undefined),
        baseBranch,
        baseShortSha: undefined,
        warning: undefined,
      };
    }

    const match = await findBaselineArtifact({
      api: params.api,
      owner: params.owner,
      repo: params.repo,
      workflowFile,
      branch: baseBranch,
      artifactName: params.artifactName,
      repositoryId: params.repositoryId,
    });
    if (!match) {
      return {
        comparison: compareBundleReports(params.head, undefined),
        baseBranch,
        baseShortSha: undefined,
        warning: undefined,
      };
    }

    const result = await downloadBaselineReport({
      client: new DefaultArtifactClient(),
      artifactId: match.artifactId,
      workflowRunId: match.runId,
      token: params.inputs.githubToken,
      repositoryOwner: params.owner,
      repositoryName: params.repo,
      destinationDirectory: scratchDirectory(params.slug, 'baseline'),
    });
    const baseShortSha = match.headSha.slice(0, 7);
    if (result.status === 'found') {
      return {
        comparison: compareBundleReports(params.head, result.report),
        baseBranch,
        baseShortSha,
        warning: undefined,
      };
    }
    core.warning(result.reason);
    return {
      comparison: buildUnreadableBaselineComparison(params.head),
      baseBranch,
      baseShortSha,
      warning: undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const warning =
      `Baseline lookup failed, so this run is compared against no baseline: ${message} ` +
      'If this is a 403, add "permissions: actions: read" to the workflow so it can list workflow runs.';
    core.warning(warning);
    return {
      comparison: compareBundleReports(params.head, undefined),
      baseBranch: baseBranch ?? params.pullRequestBaseRef ?? 'unknown',
      baseShortSha: undefined,
      warning,
    };
  }
}

export async function run(): Promise<void> {
  try {
    const inputs = parseInputs(readRawInputs());
    const workingDirectory = resolve(inputs.workingDirectory);
    const name = inputs.name ?? readPackageName(workingDirectory) ?? 'app';
    const slug = slugify(name);
    const context = github.context;
    const eventName = context.eventName;

    if (inputs.buildCommand) {
      core.info(`Running build-command in "${workingDirectory}".`);
      await runBuildCommand({ command: inputs.buildCommand, workingDirectory, eventName });
    }

    const nextDir = join(workingDirectory, inputs.nextDir);
    core.info(`Measuring bundle sizes in "${nextDir}".`);
    const head = collectBundleReport(nextDir, {
      compression: inputs.compression,
      workingDirectory,
    });

    const outDir = scratchDirectory(slug);
    const sizesPath = join(outDir, ARTIFACT_SIZES_FILENAME);
    const reportPath = join(outDir, 'report.md');
    writeFileSync(sizesPath, JSON.stringify(head, null, 2));

    const artifactName = inputs.artifactName ?? `next-bundle-sizes-${slug}`;
    if (inputs.uploadArtifact) {
      core.info(`Uploading artifact "${artifactName}".`);
      await uploadSizesArtifact({
        client: new DefaultArtifactClient(),
        name: artifactName,
        sizesFilePath: sizesPath,
      });
    } else {
      core.info('Skipping artifact upload (upload-artifact: false).');
    }

    const thresholds = buildThresholdConfigFromInputs(inputs);
    const actionRef = process.env['GITHUB_ACTION_REF'] || undefined;
    const actionVersion = actionRef ?? 'dev';
    const actionUrl = buildActionUrl({
      serverUrl: context.serverUrl,
      repository: process.env['GITHUB_ACTION_REPOSITORY'],
      ref: actionRef,
    });
    const repoUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
    const jobSummaryUrl = inputs.jobSummary
      ? buildJobSummaryUrl({
          serverUrl: context.serverUrl,
          owner: context.repo.owner,
          repo: context.repo.repo,
          runId: context.runId,
        })
      : undefined;

    if (eventName === 'pull_request') {
      const pullRequest = context.payload.pull_request as { base?: { ref?: string } } | undefined;
      const repositoryId = (context.payload.repository as { id?: number } | undefined)?.id;
      const api = createGithubApi(github.getOctokit(inputs.githubToken));

      const { comparison, baseBranch, baseShortSha, warning } = await resolveBaseline({
        api,
        inputs,
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifactName,
        head,
        pullRequestBaseRef: pullRequest?.base?.ref,
        repositoryId,
        slug,
      });

      const findings = evaluateThresholds(toThresholdInput(comparison), thresholds);
      const meta = buildReportMeta({
        inputs,
        name,
        slug,
        baseBranch,
        baseShortSha,
        head,
        thresholds,
        actionVersion,
        actionUrl,
        repoUrl,
        jobSummaryUrl,
        baselineWarning: warning,
      });

      // Write the summary/outputs/annotations before the comment, so a comment API error
      // (handled as a warning below) can never cost the run its outputs.
      await finalizeReport({
        sizesPath,
        reportPath,
        comparison,
        findings,
        meta,
        jobSummary: inputs.jobSummary,
      });

      if (inputs.comment) {
        const { markdown } = renderReport(comparison, findings, meta);
        const marker = `<!-- nextjs-bundle-analysis:${slug} -->`;
        const trustedLogins = await resolveTrustedCommentAuthors(api, inputs.commentAuthor);
        const commentResult = await upsertComment({
          api,
          owner: context.repo.owner,
          repo: context.repo.repo,
          issueNumber: context.issue.number,
          marker,
          body: markdown,
          trustedLogins,
        });
        if (commentResult.status === 'skipped') core.warning(commentResult.reason);
      }
    } else {
      // push / workflow_dispatch / other events: this run IS the future baseline, so only
      // absolute budgets apply (no baseline to diff against).
      const comparison = compareBundleReports(head, undefined);
      const findings = evaluateThresholds(toThresholdInput(comparison), thresholds);
      const baseBranch = inputs.baseBranch ?? context.ref.replace(/^refs\/heads\//, '');
      const meta = buildReportMeta({
        inputs,
        name,
        slug,
        baseBranch,
        baseShortSha: undefined,
        head,
        thresholds,
        actionVersion,
        actionUrl,
        repoUrl,
        jobSummaryUrl: undefined,
        baselineWarning: undefined,
      });

      await finalizeReport({
        sizesPath,
        reportPath,
        comparison,
        findings,
        meta,
        jobSummary: inputs.jobSummary,
      });
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Not run under Vitest, where `main.ts` is imported only for its exports.
if (process.env['VITEST'] === undefined) {
  void run();
}
