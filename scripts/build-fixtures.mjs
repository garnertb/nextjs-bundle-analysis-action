#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const fixturesAppsDir = path.join(repoRoot, 'fixtures', 'apps');
const fixturesNextDir = path.join(repoRoot, 'fixtures', 'next');
const scratchRoot =
  process.env.NBA_FIXTURE_SCRATCH ||
  path.join(process.env.HOME || repoRoot, '.copilot-nextjs-bundle-analysis-action-scratch');
const summaryPath = path.join(scratchRoot, 'summary.json');

const combos = [
  { id: '14-webpack', nextVersion: '14.2.35', bundler: 'webpack', buildArgs: ['next', 'build'] },
  { id: '15-webpack', nextVersion: '15.5.25', bundler: 'webpack', buildArgs: ['next', 'build'] },
  {
    id: '15-turbopack',
    nextVersion: '15.5.25',
    bundler: 'turbopack',
    buildArgs: ['next', 'build', '--turbopack'],
  },
  {
    id: '16-webpack',
    nextVersion: '16.3.5',
    bundler: 'webpack',
    buildArgs: ['next', 'build', '--webpack'],
  },
  { id: '16-turbopack', nextVersion: '16.3.5', bundler: 'turbopack', buildArgs: ['next', 'build'] },
];

const apps = ['app-router', 'pages-router', 'mixed'];
const installPackages = [
  'react@18.3.1',
  'react-dom@18.3.1',
  'typescript@5.9.2',
  '@types/node@24.5.2',
  '@types/react@18.3.12',
  '@types/react-dom@18.3.1',
];

function run(command, args, options = {}) {
  const { cwd = repoRoot, env = {}, allowFailure = false } = options;
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      ...env,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!allowFailure && result.status !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
    error.output = output;
    throw error;
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output,
  };
}

function rimraf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyDir(source, target) {
  const stat = fs.statSync(source);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${source}`);
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function walk(dir, predicate = () => true) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, predicate));
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeAppRoute(manifestKey) {
  const withoutKind = manifestKey.replace(/\/(page|route)$/, '');
  const segments = withoutKind
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join('/')}`;
}

function unique(values) {
  return Array.from(new Set(values));
}

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file)).byteLength;
}

function normalizeFilePath(value) {
  return value.replace(/^\//, '');
}

function bytesFromHumanSize(value) {
  const trimmed = value.trim();
  if (trimmed === 'N/A') return null;
  const match = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|kB|MB)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'b') return Math.round(amount);
  if (unit === 'kb') return Math.round(amount * 1000);
  if (unit === 'mb') return Math.round(amount * 1000 * 1000);
  return null;
}

function parseBuildTable(output) {
  // eslint-disable-next-line no-control-regex -- stripping ANSI color codes from `next build` output
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = clean.split(/\r?\n/);
  const routes = new Map();
  const routeLines = [];

  for (const line of lines) {
    if (!line.includes('/')) continue;
    const match = line.match(/^[├└┌│\s]*([^ ]+)\s+(\/\S*)(?:\s{2,}(.+?))?(?:\s{2,}(.+?))?\s*$/u);
    if (!match) continue;
    const [, symbol, route, sizeColumn, firstLoadColumn] = match;
    if (!route.startsWith('/')) continue;

    const size = sizeColumn ? bytesFromHumanSize(sizeColumn) : null;
    const firstLoad = firstLoadColumn
      ? bytesFromHumanSize(firstLoadColumn)
      : sizeColumn
        ? bytesFromHumanSize(sizeColumn)
        : null;

    routes.set(route, { symbol, sizeBytes: size, firstLoadBytes: firstLoad, rawLine: line });
    routeLines.push(line);
  }

  return { routes: Object.fromEntries(routes), routeLines, cleanOutput: clean };
}

function extractPagesRoutes(buildManifest) {
  const pages = buildManifest?.pages;
  if (!pages || typeof pages !== 'object') return [];
  return Object.entries(pages)
    .filter(
      ([route, files]) => route.startsWith('/') && !route.startsWith('/_') && Array.isArray(files),
    )
    .map(([route, files]) => ({
      router: 'pages',
      route,
      manifestKey: route,
      files: unique(files),
      manifestPath: 'build-manifest.json.pages',
    }))
    .sort((left, right) => left.route.localeCompare(right.route));
}

function extractAppRoutes(appBuildManifest) {
  const pages = appBuildManifest?.pages;
  if (!pages || typeof pages !== 'object') return [];
  const seen = new Map();
  const routes = [];

  for (const [manifestKey, files] of Object.entries(pages)) {
    if (!Array.isArray(files)) continue;
    if (!manifestKey.endsWith('/page') && !manifestKey.endsWith('/route')) continue;
    const route = normalizeAppRoute(manifestKey);
    if (seen.has(route)) {
      throw new Error(
        `Two App Router manifest keys normalised to ${route}: ${seen.get(route)} and ${manifestKey}`,
      );
    }
    seen.set(route, manifestKey);
    routes.push({
      router: manifestKey.endsWith('/route') ? 'app-route-handler' : 'app',
      route,
      manifestKey,
      files: unique(files),
      manifestPath: 'app-build-manifest.json.pages',
    });
  }

  return routes.sort((left, right) => left.route.localeCompare(right.route));
}

function parseClientReferenceManifest(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  const match = text.match(/__RSC_MANIFEST\["([^"]+)"\]\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) return null;
  return {
    manifestKey: match[1],
    manifest: JSON.parse(match[2]),
  };
}

function extractClientReferenceJsFiles(manifest) {
  const files = new Set();

  for (const values of Object.values(manifest.entryJSFiles || {})) {
    for (const value of values || []) {
      if (typeof value === 'string' && value.endsWith('.js')) {
        files.add(value.replace(/^\/_next\//, ''));
      }
    }
  }

  for (const value of Object.values(manifest.clientModules || {})) {
    for (const chunk of value?.chunks || []) {
      if (typeof chunk === 'string' && chunk.endsWith('.js')) {
        files.add(chunk.replace(/^\/_next\//, ''));
      }
    }
  }

  return Array.from(files).sort();
}

function extractAppRoutesFromClientReferenceManifests(nextDir, buildManifest) {
  const clientReferenceFiles = walk(path.join(nextDir, 'server', 'app'), (file) =>
    file.endsWith('_client-reference-manifest.js'),
  );
  if (clientReferenceFiles.length === 0) return [];

  const rootMainFiles = unique(buildManifest?.rootMainFiles || []).map((file) =>
    normalizeFilePath(file),
  );
  const seen = new Map();
  const routes = [];

  for (const file of clientReferenceFiles) {
    const parsed = parseClientReferenceManifest(file);
    if (!parsed) continue;
    const { manifestKey, manifest } = parsed;
    if (!manifestKey.endsWith('/page') && !manifestKey.endsWith('/route')) continue;
    const route = normalizeAppRoute(manifestKey);
    if (seen.has(route)) {
      throw new Error(
        `Two client reference manifests normalised to ${route}: ${seen.get(route)} and ${manifestKey}`,
      );
    }
    seen.set(route, manifestKey);

    const routeFiles = extractClientReferenceJsFiles(manifest);
    const files = manifestKey.endsWith('/route')
      ? routeFiles
      : unique([...rootMainFiles, ...routeFiles]);

    routes.push({
      router: manifestKey.endsWith('/route') ? 'app-route-handler' : 'app',
      route,
      manifestKey,
      files,
      manifestPath: path.relative(nextDir, file),
      sharedFiles: manifestKey.endsWith('/route') ? [] : rootMainFiles,
      routeOnlyFiles: routeFiles,
      hasEntryJsFiles: Object.prototype.hasOwnProperty.call(manifest, 'entryJSFiles'),
    });
  }

  return routes.sort((left, right) => left.route.localeCompare(right.route));
}

function intersectFileSets(routes) {
  const routeFileSets = routes
    .filter((route) => route.files.length > 0)
    .map((route) => new Set(route.files));
  if (routeFileSets.length === 0) return [];
  const [first, ...rest] = routeFileSets;
  return Array.from(first)
    .filter((file) => rest.every((set) => set.has(file)))
    .sort();
}

function previewManifest(manifest, keys) {
  if (!manifest || typeof manifest !== 'object') return null;
  const preview = {};
  for (const key of keys) {
    if (key in manifest) preview[key] = manifest[key];
  }
  return preview;
}

function collectJsonStringJsFiles(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStringJsFiles(item, output);
    return output;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectJsonStringJsFiles(nested, output);
    return output;
  }
  if (typeof value === 'string' && /\.js$/.test(value)) output.add(value);
  return output;
}

function analyzeNextBuild(nextDir, buildOutput, combo, appName) {
  const buildManifest = readJsonIfExists(path.join(nextDir, 'build-manifest.json'));
  const appBuildManifest = readJsonIfExists(path.join(nextDir, 'app-build-manifest.json'));
  const clientReferenceRoutes = extractAppRoutesFromClientReferenceManifests(
    nextDir,
    buildManifest,
  );
  const clientReferenceRoutesReliable =
    clientReferenceRoutes.length > 0 &&
    clientReferenceRoutes
      .filter((route) => route.router === 'app')
      .every((route) => route.hasEntryJsFiles);
  const allJsonFiles = walk(nextDir, (file) => file.endsWith('.json'))
    .map((file) => path.relative(nextDir, file))
    .sort();
  const depthTwoFiles = walk(nextDir)
    .map((file) => path.relative(nextDir, file))
    .filter((relative) => relative.split(path.sep).length <= 2)
    .sort();

  const appManifestRoutes = extractAppRoutes(appBuildManifest);
  const routeEntries = [
    ...extractPagesRoutes(buildManifest),
    ...(appManifestRoutes.length > 0
      ? appManifestRoutes
      : clientReferenceRoutesReliable
        ? clientReferenceRoutes
        : []),
  ];
  const fileSizeCache = new Map();
  const getFileSize = (relativeFile) => {
    const normalized = normalizeFilePath(relativeFile);
    if (!fileSizeCache.has(normalized)) {
      const file = path.join(nextDir, normalized);
      fileSizeCache.set(normalized, fs.existsSync(file) ? gzipSize(file) : null);
    }
    return fileSizeCache.get(normalized);
  };

  const computedRoutes = routeEntries.map((entry) => ({
    ...entry,
    gzippedBytes: entry.files.reduce((total, file) => total + (getFileSize(file) || 0), 0),
    missingFiles: entry.files.filter((file) => getFileSize(file) == null),
  }));

  const parsedTable = parseBuildTable(buildOutput);
  const comparedRoutes = computedRoutes.map((route) => ({
    ...route,
    buildOutput: parsedTable.routes[route.route] || null,
    deltaVsBuildFirstLoadBytes:
      parsedTable.routes[route.route]?.firstLoadBytes == null
        ? null
        : route.gzippedBytes - parsedTable.routes[route.route].firstLoadBytes,
  }));

  const supportedByRouter = [];
  if (computedRoutes.some((route) => route.router === 'pages'))
    supportedByRouter.push('build-manifest.json.pages');
  if (appManifestRoutes.length > 0) {
    if (
      computedRoutes.some((route) => route.router === 'app' || route.router === 'app-route-handler')
    ) {
      supportedByRouter.push('app-build-manifest.json.pages');
    }
  } else if (clientReferenceRoutesReliable) {
    supportedByRouter.push(
      'server/app/**/_client-reference-manifest.js + build-manifest.json.rootMainFiles',
    );
  }

  const keepChunks = new Set();
  for (const route of computedRoutes) {
    for (const file of route.files) {
      const normalized = normalizeFilePath(file);
      const resolved = path.join(nextDir, normalized);
      if (fs.existsSync(resolved)) keepChunks.add(normalized);
    }
  }

  const keepJsonFiles = new Set(allJsonFiles);
  const keepManifestFiles = new Set(
    [...routeEntries, ...clientReferenceRoutes]
      .map((route) => route.manifestPath)
      .filter(
        (manifestPath) =>
          manifestPath &&
          !manifestPath.endsWith('.json') &&
          fs.existsSync(path.join(nextDir, manifestPath)),
      ),
  );
  const extraManifestJsFiles = new Set();
  for (const relativeJson of allJsonFiles) {
    const manifest = readJsonIfExists(path.join(nextDir, relativeJson));
    collectJsonStringJsFiles(manifest, extraManifestJsFiles);
  }
  for (const file of extraManifestJsFiles) {
    const normalized = normalizeFilePath(file);
    const resolved = path.join(nextDir, normalized);
    if (fs.existsSync(resolved) && normalized.startsWith('static/')) keepChunks.add(normalized);
  }

  return {
    comboId: combo.id,
    nextVersion: combo.nextVersion,
    appName,
    bundler: combo.bundler,
    allJsonFiles,
    depthTwoFiles,
    buildManifestPreview: previewManifest(buildManifest, [
      'rootMainFiles',
      'polyfillFiles',
      'pages',
      'ampDevFiles',
      'lowPriorityFiles',
    ]),
    appBuildManifestPreview: previewManifest(appBuildManifest, ['pages']),
    clientReferenceRoutesReliable,
    computedRoutes: comparedRoutes,
    supported: supportedByRouter.length > 0,
    supportManifestPaths: supportedByRouter,
    sharedFiles: intersectFileSets(
      comparedRoutes.filter((route) => route.router !== 'app-route-handler'),
    ),
    buildTable: parsedTable,
    keepJsonFiles: Array.from(keepJsonFiles).sort(),
    keepManifestFiles: Array.from(keepManifestFiles).sort(),
    keepChunks: Array.from(keepChunks).sort(),
  };
}

function copyTrimmedNextDir(nextDir, analysis) {
  const destinationRoot = path.join(fixturesNextDir, analysis.comboId, analysis.appName, '.next');
  rimraf(destinationRoot);
  ensureDir(destinationRoot);

  for (const relativeJson of analysis.keepJsonFiles) {
    const from = path.join(nextDir, relativeJson);
    const to = path.join(destinationRoot, relativeJson);
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  }

  for (const relativeManifest of analysis.keepManifestFiles || []) {
    const from = path.join(nextDir, relativeManifest);
    const to = path.join(destinationRoot, relativeManifest);
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  }

  for (const relativeChunk of analysis.keepChunks) {
    const from = path.join(nextDir, relativeChunk);
    const to = path.join(destinationRoot, relativeChunk);
    ensureDir(path.dirname(to));
    fs.copyFileSync(from, to);
  }
}

function installAndBuild(combo, appName) {
  const sourceDir = path.join(fixturesAppsDir, appName);
  const workDir = path.join(scratchRoot, combo.id, appName);
  rimraf(workDir);
  ensureDir(path.dirname(workDir));
  copyDir(sourceDir, workDir);

  const installArgs = ['add', `next@${combo.nextVersion}`, ...installPackages];
  run('pnpm', installArgs, { cwd: workDir });

  const nextVersionOutput = run('pnpm', ['exec', 'next', '--version'], { cwd: workDir });
  const buildOutput = run('pnpm', ['exec', ...combo.buildArgs], {
    cwd: workDir,
    allowFailure: combo.id === '16-webpack',
  });

  const nextDir = path.join(workDir, '.next');
  const analysis = fs.existsSync(nextDir)
    ? analyzeNextBuild(nextDir, buildOutput.output, combo, appName)
    : {
        comboId: combo.id,
        nextVersion: combo.nextVersion,
        appName,
        bundler: combo.bundler,
        allJsonFiles: [],
        depthTwoFiles: [],
        buildManifestPreview: null,
        appBuildManifestPreview: null,
        computedRoutes: [],
        supported: false,
        supportManifestPaths: [],
        sharedFiles: [],
        buildTable: parseBuildTable(buildOutput.output),
        keepJsonFiles: [],
        keepChunks: [],
      };

  analysis.nextVersionOutput = nextVersionOutput.output.trim();
  analysis.buildCommand = `pnpm exec ${combo.buildArgs.join(' ')}`;
  analysis.buildExitCode = buildOutput.status;
  analysis.buildOutput = buildOutput.output;

  if (fs.existsSync(nextDir)) {
    copyTrimmedNextDir(nextDir, analysis);
  }

  rimraf(workDir);
  return analysis;
}

function main() {
  ensureDir(scratchRoot);
  ensureDir(fixturesNextDir);

  const summary = [];
  for (const combo of combos) {
    for (const appName of apps) {
      const analysis = installAndBuild(combo, appName);
      summary.push(analysis);
    }
  }

  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Wrote ${summary.length} fixture analyses to ${summaryPath}\n`);
}

main();
