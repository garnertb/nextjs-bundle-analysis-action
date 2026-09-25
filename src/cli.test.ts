import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildThresholdConfig, parseFlags } from './cli.js';
import { COLLECTOR_VERSION, SCHEMA_VERSION, type BundleReport } from './collectors/types.js';

const TSX_BIN = join(process.cwd(), 'node_modules', '.bin', 'tsx');

describe('parseFlags', () => {
  it('pairs a flag with its following value', () => {
    expect(parseFlags(['--next-dir', '.next', '--compression', 'gzip'])).toEqual({
      'next-dir': '.next',
      compression: 'gzip',
    });
  });

  it('treats a flag followed by another flag (or nothing) as a boolean true', () => {
    expect(parseFlags(['--verbose', '--next-dir', '.next'])).toEqual({
      verbose: true,
      'next-dir': '.next',
    });
    expect(parseFlags(['--verbose'])).toEqual({ verbose: true });
  });

  it('ignores bare positional arguments', () => {
    expect(parseFlags(['positional', '--next-dir', '.next'])).toEqual({ 'next-dir': '.next' });
  });
});

describe('buildThresholdConfig', () => {
  it('parses every threshold flag into its typed form', () => {
    const config = buildThresholdConfig({
      'warn-route-size': '250kB',
      'fail-route-size': '400kB',
      'warn-route-increase': '5%',
      'fail-route-increase': '20kB',
      'warn-total-increase': '10kB',
      'fail-total-increase': '15%',
      'warn-shared-size': '150kB',
      'fail-shared-size': '200kB',
    });
    expect(config).toEqual({
      warnRouteSize: 250_000,
      failRouteSize: 400_000,
      warnRouteIncrease: { kind: 'percent', fraction: 0.05 },
      failRouteIncrease: { kind: 'bytes', bytes: 20_000 },
      warnTotalIncrease: { kind: 'bytes', bytes: 10_000 },
      failTotalIncrease: { kind: 'percent', fraction: 0.15 },
      warnSharedSize: 150_000,
      failSharedSize: 200_000,
    });
  });

  it('returns an empty config when no threshold flags are set', () => {
    expect(buildThresholdConfig({})).toEqual({});
  });

  it('reads and parses a budgets-file when --budgets-file is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-budgets-'));
    const path = join(dir, 'budgets.json');
    writeFileSync(path, JSON.stringify({ routes: { '/admin/*': { 'warn-route-size': '100kB' } } }));
    try {
      const config = buildThresholdConfig({ 'budgets-file': path });
      expect(config.budgets?.get('/admin/*')).toEqual({ warnRouteSize: 100_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cli end-to-end (subprocess)', () => {
  function bundleReport(overrides: Partial<BundleReport>): BundleReport {
    return {
      fingerprint: {
        schemaVersion: SCHEMA_VERSION,
        collectorVersion: COLLECTOR_VERSION,
        compression: 'gzip',
      },
      nextVersion: '15.5.4',
      bundler: 'webpack',
      total: 100_000,
      routers: { app: { shared: 50_000 } },
      routes: [{ route: '/', router: 'app', firstLoad: 100_000, own: 50_000, files: [] }],
      ...overrides,
    };
  }

  it('measure reads a real fixture and reports non-zero client JS', () => {
    const out = execFileSync(
      TSX_BIN,
      ['src/cli.ts', 'measure', '--next-dir', 'fixtures/next/15-webpack/mixed/.next'],
      { encoding: 'utf-8', cwd: process.cwd(), env: { ...process.env, VITEST: undefined } },
    );
    const result = JSON.parse(out) as BundleReport;
    expect(result.total).toBeGreaterThan(0);
    expect(result.routes.length).toBeGreaterThan(0);
  });

  it('measure exits non-zero against a Next 14 install', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-next14-'));
    cpSync('fixtures/next/15-webpack/mixed/.next', join(dir, '.next'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', 'next'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'next', 'package.json'),
      JSON.stringify({ version: '14.2.35' }),
    );
    try {
      const result = spawnSync(
        TSX_BIN,
        ['src/cli.ts', 'measure', '--next-dir', join(dir, '.next')],
        {
          encoding: 'utf-8',
          cwd: process.cwd(),
          env: { ...process.env, VITEST: undefined },
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        'Next.js 14.2.35 is not supported: this action requires Next.js 15 or newer.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('report exits non-zero when a fail threshold is breached', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-report-'));
    const headPath = join(dir, 'head.json');
    writeFileSync(headPath, JSON.stringify(bundleReport({})));
    try {
      expect(() =>
        execFileSync(
          TSX_BIN,
          ['src/cli.ts', 'report', '--head', headPath, '--fail-route-size', '1B'],
          {
            encoding: 'utf-8',
            cwd: process.cwd(),
            env: { ...process.env, VITEST: undefined },
          },
        ),
      ).toThrowError(/Command failed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('report exits zero and renders markdown when nothing breaches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-report-'));
    const headPath = join(dir, 'head.json');
    writeFileSync(headPath, JSON.stringify(bundleReport({})));
    try {
      const out = execFileSync(TSX_BIN, ['src/cli.ts', 'report', '--head', headPath], {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: { ...process.env, VITEST: undefined },
      });
      expect(out).toContain('Bundle sizes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('report links the action version when --action-repository and --action-version are set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-report-'));
    const headPath = join(dir, 'head.json');
    writeFileSync(headPath, JSON.stringify(bundleReport({})));
    try {
      const out = execFileSync(
        TSX_BIN,
        [
          'src/cli.ts',
          'report',
          '--head',
          headPath,
          '--action-repository',
          'garnertb/nextjs-bundle-analysis-action',
          '--action-version',
          'v1.2.3',
        ],
        { encoding: 'utf-8', cwd: process.cwd(), env: { ...process.env, VITEST: undefined } },
      );
      expect(out).toContain(
        'nextjs-bundle-analysis-action [v1.2.3](https://github.com/garnertb/nextjs-bundle-analysis-action/tree/v1.2.3)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('report with --base but no --base-sha omits the SHA instead of an empty code span', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-report-'));
    const headPath = join(dir, 'head.json');
    const basePath = join(dir, 'base.json');
    writeFileSync(headPath, JSON.stringify(bundleReport({})));
    writeFileSync(basePath, JSON.stringify(bundleReport({ total: 90_000 })));
    try {
      const out = execFileSync(
        TSX_BIN,
        ['src/cli.ts', 'report', '--head', headPath, '--base', basePath],
        {
          encoding: 'utf-8',
          cwd: process.cwd(),
          env: { ...process.env, VITEST: undefined },
        },
      );
      expect(out).toContain('vs `main`');
      expect(out).not.toContain('`  `');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
