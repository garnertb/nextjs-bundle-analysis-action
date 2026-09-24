#!/usr/bin/env node
/**
 * Local-only CLI wrapping the pure core (`collectors`, `thresholds`,
 * `report`) for humans, tests, and agent skills to run outside the Actions
 * runtime. Not used by `src/main.ts`. See docs/manifests.md for background
 * on the manifest layouts `measure` reads.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { collectBundleReport } from './collectors/index.js';
import type { BundleReport, CompressionAlgorithm } from './collectors/types.js';
import { compareBundleReports, toThresholdInput } from './report/compare.js';
import { renderReport, type ReportMeta } from './report/render.js';
import { evaluateThresholds } from './thresholds/evaluate.js';
import { parseBudgetsFile } from './thresholds/budgets-file.js';
import { parseByteSize, parseSizeOrPercent } from './thresholds/size-value.js';
import type { ThresholdConfig } from './thresholds/types.js';
import { slugify } from './slug.js';

export interface Flags {
  [key: string]: string | boolean | undefined;
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function requireString(flags: Flags, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string') throw new Error(`Missing required --${key} flag.`);
  return value;
}

function optionalString(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

function parseCompression(flags: Flags): CompressionAlgorithm {
  const value = optionalString(flags, 'compression') ?? 'gzip';
  if (value === 'gzip' || value === 'brotli' || value === 'none') return value;
  throw new Error(`Invalid --compression "${value}". Expected gzip, brotli, or none.`);
}

export function buildThresholdConfig(flags: Flags): ThresholdConfig {
  const config: ThresholdConfig = {};
  const warnRouteSize = optionalString(flags, 'warn-route-size');
  if (warnRouteSize !== undefined) config.warnRouteSize = parseByteSize(warnRouteSize);
  const failRouteSize = optionalString(flags, 'fail-route-size');
  if (failRouteSize !== undefined) config.failRouteSize = parseByteSize(failRouteSize);
  const warnRouteIncrease = optionalString(flags, 'warn-route-increase');
  if (warnRouteIncrease !== undefined)
    config.warnRouteIncrease = parseSizeOrPercent(warnRouteIncrease);
  const failRouteIncrease = optionalString(flags, 'fail-route-increase');
  if (failRouteIncrease !== undefined)
    config.failRouteIncrease = parseSizeOrPercent(failRouteIncrease);
  const warnTotalIncrease = optionalString(flags, 'warn-total-increase');
  if (warnTotalIncrease !== undefined)
    config.warnTotalIncrease = parseSizeOrPercent(warnTotalIncrease);
  const failTotalIncrease = optionalString(flags, 'fail-total-increase');
  if (failTotalIncrease !== undefined)
    config.failTotalIncrease = parseSizeOrPercent(failTotalIncrease);
  const warnSharedSize = optionalString(flags, 'warn-shared-size');
  if (warnSharedSize !== undefined) config.warnSharedSize = parseByteSize(warnSharedSize);
  const failSharedSize = optionalString(flags, 'fail-shared-size');
  if (failSharedSize !== undefined) config.failSharedSize = parseByteSize(failSharedSize);
  const budgetsFilePath = optionalString(flags, 'budgets-file');
  if (budgetsFilePath !== undefined) {
    config.budgets = parseBudgetsFile(readFileSync(budgetsFilePath, 'utf-8'), budgetsFilePath);
  }
  return config;
}

function writeOutput(flags: Flags, text: string): void {
  const out = optionalString(flags, 'out');
  if (out !== undefined) {
    writeFileSync(out, text);
  } else {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }
}

function runMeasure(flags: Flags): void {
  const nextDir = requireString(flags, 'next-dir');
  const compression = parseCompression(flags);
  const bundleReport = collectBundleReport(nextDir, { compression });
  writeOutput(flags, JSON.stringify(bundleReport, null, 2));
}

function readBundleReport(path: string): BundleReport {
  return JSON.parse(readFileSync(path, 'utf-8')) as BundleReport;
}

function runReport(flags: Flags): void {
  const head = readBundleReport(requireString(flags, 'head'));
  const basePath = optionalString(flags, 'base');
  const base = basePath === undefined ? undefined : readBundleReport(basePath);

  const comparison = compareBundleReports(head, base);
  const config = buildThresholdConfig(flags);
  const findings = evaluateThresholds(toThresholdInput(comparison), config);

  const name = optionalString(flags, 'name') ?? 'app';
  const meta: ReportMeta = {
    name,
    slug: slugify(name),
    baseBranch: optionalString(flags, 'base-branch') ?? 'main',
    baseShortSha: optionalString(flags, 'base-sha'),
    compression: head.fingerprint.compression,
    significantChangeBytes: parseByteSize(optionalString(flags, 'significant-change') ?? '512B'),
    thresholds: config,
    budgetsFilePath: optionalString(flags, 'budgets-file'),
    nextVersion: head.nextVersion,
    bundler: head.bundler,
    actionVersion: optionalString(flags, 'action-version') ?? 'dev',
    jobSummaryUrl: optionalString(flags, 'job-summary-url'),
    repoUrl: optionalString(flags, 'repo-url'),
  };

  const { markdown } = renderReport(comparison, findings, meta);
  writeOutput(flags, markdown);

  const failureCount = findings.filter((f) => f.level === 'fail').length;
  if (failureCount > 0) process.exitCode = 1;
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  switch (command) {
    case 'measure':
      runMeasure(flags);
      break;
    case 'report':
      runReport(flags);
      break;
    default:
      process.stderr.write(
        'Usage: cli.ts measure --next-dir <path> [--compression gzip|brotli|none] [--out <path>]\n',
      );
      process.stderr.write(
        '       cli.ts report --head <path> [--base <path>] [threshold flags] [--out <path>]\n',
      );
      process.exitCode = 1;
  }
}

// Not run under Vitest, where `cli.ts` is imported only for its exports.
if (process.env['VITEST'] === undefined) {
  main();
}
