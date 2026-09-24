import type { ArtifactClient } from '@actions/artifact';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BundleReport } from '../collectors/types.js';
import { isBundleReport } from './baseline.js';

/** Fixed filename used inside the sizes artifact, on both upload and download. */
export const ARTIFACT_SIZES_FILENAME = 'bundle-sizes.json';

export interface UploadSizesArtifactOptions {
  client: ArtifactClient;
  name: string;
  /** Path to the already-written sizes JSON file to upload. */
  sizesFilePath: string;
}

export async function uploadSizesArtifact(options: UploadSizesArtifactOptions): Promise<void> {
  const rootDirectory = join(options.sizesFilePath, '..');
  await options.client.uploadArtifact(options.name, [options.sizesFilePath], rootDirectory);
}

export interface DownloadBaselineReportOptions {
  client: ArtifactClient;
  artifactId: number;
  workflowRunId: number;
  token: string;
  repositoryOwner: string;
  repositoryName: string;
  /** Directory to download into; a temp/scratch directory unique to this run. */
  destinationDirectory: string;
}

export type DownloadBaselineReportResult =
  { status: 'found'; report: BundleReport } | { status: 'incompatible'; reason: string };

/**
 * Downloads the baseline sizes artifact and parses/validates its JSON. A
 * download failure, malformed JSON, or a schema mismatch all resolve to
 * `incompatible` rather than throwing, matching the plan's "invalid JSON
 * means baseline-status: incompatible, not a crash" requirement.
 */
export async function downloadBaselineReport(
  options: DownloadBaselineReportOptions,
): Promise<DownloadBaselineReportResult> {
  let downloadPath: string | undefined;
  try {
    const result = await options.client.downloadArtifact(options.artifactId, {
      path: options.destinationDirectory,
      findBy: {
        token: options.token,
        workflowRunId: options.workflowRunId,
        repositoryOwner: options.repositoryOwner,
        repositoryName: options.repositoryName,
      },
    });
    downloadPath = result.downloadPath;
  } catch (error) {
    return {
      status: 'incompatible',
      reason: `Failed to download the baseline artifact: ${(error as Error).message}`,
    };
  }
  if (!downloadPath) {
    return { status: 'incompatible', reason: 'The baseline artifact download returned no path.' };
  }

  let raw: string;
  try {
    raw = await readFile(join(downloadPath, ARTIFACT_SIZES_FILENAME), 'utf8');
  } catch (error) {
    return {
      status: 'incompatible',
      reason: `The baseline artifact didn't contain ${ARTIFACT_SIZES_FILENAME}: ${(error as Error).message}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: 'incompatible',
      reason: `The baseline artifact's ${ARTIFACT_SIZES_FILENAME} wasn't valid JSON: ${(error as Error).message}`,
    };
  }

  if (!isBundleReport(parsed)) {
    return {
      status: 'incompatible',
      reason: `The baseline artifact's ${ARTIFACT_SIZES_FILENAME} didn't match the expected schema.`,
    };
  }

  return { status: 'found', report: parsed };
}
