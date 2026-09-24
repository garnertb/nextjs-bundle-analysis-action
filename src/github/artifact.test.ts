import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BundleReport } from '../collectors/types.js';
import {
  ARTIFACT_SIZES_FILENAME,
  downloadBaselineReport,
  uploadSizesArtifact,
} from './artifact.js';

const validReport: BundleReport = {
  fingerprint: { schemaVersion: 1, collectorVersion: '1', compression: 'gzip' },
  nextVersion: '15.0.0',
  bundler: 'webpack',
  total: 100,
  routers: { app: { shared: 10 } },
  routes: [],
};

describe('uploadSizesArtifact', () => {
  it('uploads the sizes file under the given artifact name', async () => {
    const calls: unknown[] = [];
    await uploadSizesArtifact({
      client: {
        uploadArtifact: async (...args: unknown[]) => {
          calls.push(args);
          return {};
        },
      } as never,
      name: 'next-bundle-sizes-web',
      sizesFilePath: '/tmp/run/bundle-sizes.json',
    });
    expect(calls).toEqual([['next-bundle-sizes-web', ['/tmp/run/bundle-sizes.json'], '/tmp/run']]);
  });
});

describe('downloadBaselineReport', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nba-artifact-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns found for a valid, well-formed report', async () => {
    await writeFile(join(dir, ARTIFACT_SIZES_FILENAME), JSON.stringify(validReport));
    const result = await downloadBaselineReport({
      client: { downloadArtifact: async () => ({ downloadPath: dir }) } as never,
      artifactId: 1,
      workflowRunId: 2,
      token: 't',
      repositoryOwner: 'o',
      repositoryName: 'r',
      destinationDirectory: dir,
    });
    expect(result).toEqual({ status: 'found', report: validReport });
  });

  it('returns incompatible when the artifact JSON is malformed', async () => {
    await writeFile(join(dir, ARTIFACT_SIZES_FILENAME), '{ not json');
    const result = await downloadBaselineReport({
      client: { downloadArtifact: async () => ({ downloadPath: dir }) } as never,
      artifactId: 1,
      workflowRunId: 2,
      token: 't',
      repositoryOwner: 'o',
      repositoryName: 'r',
      destinationDirectory: dir,
    });
    expect(result.status).toBe('incompatible');
  });

  it('returns incompatible when the JSON is valid but not a bundle report', async () => {
    await writeFile(join(dir, ARTIFACT_SIZES_FILENAME), JSON.stringify({ hello: 'world' }));
    const result = await downloadBaselineReport({
      client: { downloadArtifact: async () => ({ downloadPath: dir }) } as never,
      artifactId: 1,
      workflowRunId: 2,
      token: 't',
      repositoryOwner: 'o',
      repositoryName: 'r',
      destinationDirectory: dir,
    });
    expect(result.status).toBe('incompatible');
  });

  it('returns incompatible when the download itself fails', async () => {
    const result = await downloadBaselineReport({
      client: {
        downloadArtifact: async () => {
          throw new Error('boom');
        },
      } as never,
      artifactId: 1,
      workflowRunId: 2,
      token: 't',
      repositoryOwner: 'o',
      repositoryName: 'r',
      destinationDirectory: dir,
    });
    expect(result).toEqual({ status: 'incompatible', reason: expect.stringContaining('boom') });
  });

  it('returns incompatible when the expected file is missing', async () => {
    const result = await downloadBaselineReport({
      client: { downloadArtifact: async () => ({ downloadPath: dir }) } as never,
      artifactId: 1,
      workflowRunId: 2,
      token: 't',
      repositoryOwner: 'o',
      repositoryName: 'r',
      destinationDirectory: dir,
    });
    expect(result.status).toBe('incompatible');
  });
});
