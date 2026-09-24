#!/usr/bin/env node
/**
 * Integration-CI assertion: compares a fresh-build's measured sizes against
 * the same combo/app's committed fixture, measured with the same collector
 * (via `pnpm cli measure`). Route sets must match exactly; per-route
 * firstLoad bytes must be within SIZE_TOLERANCE of the committed value,
 * which catches structural regressions while tolerating tiny cross-machine
 * build variance. See docs/manifests.md for the human-readable numbers this
 * indirectly re-verifies.
 */
import { readFileSync } from 'node:fs';

const SIZE_TOLERANCE = 0.05;

function usage() {
  console.error(
    'Usage: assert-integration-sizes.mjs <expected-sizes.json> <actual-sizes.json>',
  );
  process.exit(2);
}

const [expectedPath, actualPath] = process.argv.slice(2);
if (!expectedPath || !actualPath) usage();

function loadReport(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function byRouteKey(report) {
  return new Map(report.routes.map((r) => [`${r.router}:${r.route}`, r]));
}

const expected = loadReport(expectedPath);
const actual = loadReport(actualPath);
const expectedRoutes = byRouteKey(expected);
const actualRoutes = byRouteKey(actual);

const errors = [];

for (const key of expectedRoutes.keys()) {
  if (!actualRoutes.has(key)) errors.push(`missing route in fresh build: ${key}`);
}
for (const key of actualRoutes.keys()) {
  if (!expectedRoutes.has(key)) errors.push(`unexpected extra route in fresh build: ${key}`);
}

for (const [key, expectedRoute] of expectedRoutes) {
  const actualRoute = actualRoutes.get(key);
  if (!actualRoute) continue;
  const delta = Math.abs(actualRoute.firstLoad - expectedRoute.firstLoad);
  const tolerance = Math.max(1, expectedRoute.firstLoad * SIZE_TOLERANCE);
  if (delta > tolerance) {
    errors.push(
      `${key}: firstLoad ${actualRoute.firstLoad}B vs committed-fixture ${expectedRoute.firstLoad}B ` +
        `(delta ${delta}B exceeds ${tolerance.toFixed(0)}B tolerance)`,
    );
  }
}

if (errors.length > 0) {
  console.error('Integration size assertion failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `OK: ${expectedRoutes.size} route(s) match the committed fixture within ${SIZE_TOLERANCE * 100}% tolerance.`,
);
