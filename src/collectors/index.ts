import path from 'node:path';
import { FileSizeCache } from './compression.js';
import { collectPagesRoutes, collectPagesSharedFiles } from './pages.js';
import { collectAppRoutes } from './detect.js';
import { disambiguateAcrossRouters } from './route-path.js';
import { detectBundler, detectNextVersion } from './environment.js';
import { COLLECTOR_VERSION, SCHEMA_VERSION } from './types.js';
import type { BundleReport, CompressionAlgorithm, RouteMeasurement, RouterName } from './types.js';

export interface CollectOptions {
  compression: CompressionAlgorithm;
  /** Defaults to `nextDir`'s parent directory. */
  workingDirectory?: string;
}

function intersectionOf(fileSets: readonly string[][]): Set<string> {
  if (fileSets.length === 0) return new Set();
  const [first, ...rest] = fileSets;
  const intersection = new Set(first);
  for (const files of rest) {
    const other = new Set(files);
    for (const file of intersection) {
      if (!other.has(file)) intersection.delete(file);
    }
  }
  return intersection;
}

function buildRouterMeasurements(
  filesByRoute: Map<string, string[]>,
  router: RouterName,
  sizeCache: FileSizeCache,
  /** Explicit shared-file set (Pages: `/_app`); omitted for App Router, which uses the intersection. */
  explicitSharedFiles?: string[],
): { routes: RouteMeasurement[]; sharedBytes: number } {
  const sharedFiles = explicitSharedFiles
    ? new Set(explicitSharedFiles)
    : intersectionOf(Array.from(filesByRoute.values()));
  const sharedBytes = sizeCache.sizeOfSet(sharedFiles);
  const routes = Array.from(filesByRoute, ([route, files]) => {
    const firstLoad = sizeCache.sizeOfSet(files);
    return { route, router, firstLoad, own: firstLoad - sharedBytes, files };
  });
  return { routes, sharedBytes };
}

/**
 * Collects per-route client JS measurements from a built `.next` directory.
 * Auto-detects Pages Router and App Router manifest shapes; throws
 * {@link UnsupportedAppRouterError} if App Router routes exist but no
 * reliable per-route chunk manifest could be found (see docs/manifests.md).
 */
export function collectBundleReport(nextDir: string, options: CollectOptions): BundleReport {
  const sizeCache = new FileSizeCache(nextDir, options.compression);

  const rawPages = collectPagesRoutes(nextDir);
  const rawApp = collectAppRoutes(nextDir);
  const { pages: pagesFiles, app: appFiles } = disambiguateAcrossRouters(rawPages, rawApp);

  const routers: BundleReport['routers'] = {};
  const routes: RouteMeasurement[] = [];
  const allFiles = new Set<string>();

  if (pagesFiles) {
    const { routes: pagesRoutes, sharedBytes } = buildRouterMeasurements(
      pagesFiles,
      'pages',
      sizeCache,
      collectPagesSharedFiles(nextDir),
    );
    routers.pages = { shared: sharedBytes };
    routes.push(...pagesRoutes);
    for (const files of pagesFiles.values()) for (const file of files) allFiles.add(file);
  }
  if (appFiles) {
    // App Router `shared` is the intersection across every route in `appFiles`, unlike Pages
    // (which has an explicit `/_app` chunk list). This only degenerates to `own: 0` for a
    // single-route app, and every supported combo (14/15/16 webpack and Turbopack) always
    // renders an implicit `/_not-found` route alongside any real route, per docs/manifests.md.
    const { routes: appRoutes, sharedBytes } = buildRouterMeasurements(appFiles, 'app', sizeCache);
    routers.app = { shared: sharedBytes };
    routes.push(...appRoutes);
    for (const files of appFiles.values()) for (const file of files) allFiles.add(file);
  }

  routes.sort((a, b) => a.route.localeCompare(b.route));

  return {
    fingerprint: {
      schemaVersion: SCHEMA_VERSION,
      collectorVersion: COLLECTOR_VERSION,
      compression: options.compression,
    },
    nextVersion: detectNextVersion(options.workingDirectory ?? path.dirname(nextDir)),
    bundler: detectBundler(nextDir),
    total: sizeCache.sizeOfSet(allFiles),
    routers,
    routes,
  };
}

export * from './types.js';
export { UnsupportedAppRouterError } from './unsupported-error.js';
export { RouteCollisionError } from './route-path.js';
