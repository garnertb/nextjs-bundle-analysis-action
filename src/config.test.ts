import { writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildThresholdConfigFromInputs } from './config.js';
import type { ActionInputs } from './inputs.js';

const baseInputs: ActionInputs = {
  workingDirectory: '.',
  nextDir: '.next',
  buildCommand: undefined,
  name: undefined,
  baseBranch: undefined,
  baselineWorkflow: undefined,
  artifactName: undefined,
  uploadArtifact: true,
  githubToken: 'token',
  comment: true,
  jobSummary: true,
  compression: 'gzip',
  significantChange: '512B',
  warnRouteSize: undefined,
  failRouteSize: undefined,
  warnRouteIncrease: undefined,
  failRouteIncrease: undefined,
  warnTotalIncrease: undefined,
  failTotalIncrease: undefined,
  warnSharedSize: undefined,
  failSharedSize: undefined,
  budgetsFile: undefined,
};

describe('buildThresholdConfigFromInputs', () => {
  it('parses absolute and percent thresholds', () => {
    const config = buildThresholdConfigFromInputs({
      ...baseInputs,
      warnRouteSize: '100kB',
      failRouteSize: '200kB',
      warnRouteIncrease: '5%',
      failRouteIncrease: '20kB',
      warnTotalIncrease: '2%',
      failTotalIncrease: '500kB',
      warnSharedSize: '80kB',
      failSharedSize: '150kB',
    });
    expect(config.warnRouteSize).toBe(100_000);
    expect(config.failRouteSize).toBe(200_000);
    expect(config.warnRouteIncrease).toEqual({ kind: 'percent', fraction: 0.05 });
    expect(config.failRouteIncrease).toEqual({ kind: 'bytes', bytes: 20_000 });
  });

  it('returns an empty config when no thresholds are set', () => {
    expect(buildThresholdConfigFromInputs(baseInputs)).toEqual({});
  });

  describe('budgets file', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'nba-config-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('parses a budgets file referenced by path', () => {
      const path = join(dir, 'budgets.json');
      writeFileSync(
        path,
        JSON.stringify({ routes: { '/blog/**': { 'warn-route-size': '50kB' } } }),
      );
      const config = buildThresholdConfigFromInputs({ ...baseInputs, budgetsFile: path });
      expect(config.budgets?.size).toBe(1);
    });
  });
});
