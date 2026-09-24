import { readJsonManifest } from './manifest-io.js';
import { collectAppManifestRoutes } from './app-manifest.js';
import { collectAppTurbopackRoutes } from './app-turbopack.js';
import { UnsupportedAppRouterError } from './unsupported-error.js';

interface BuildManifest {
  rootMainFiles?: string[];
}

/**
 * Auto-detects the App Router manifest shape from what's present under
 * `.next` and dispatches to the matching collector. Returns `undefined` when
 * there's no App Router in this build at all (an empty/absent
 * `rootMainFiles` and no usable `app-build-manifest.json`).
 */
export function collectAppRoutes(nextDir: string): Map<string, string[]> | undefined {
  const webpackRoutes = collectAppManifestRoutes(nextDir);
  if (webpackRoutes) return webpackRoutes;

  const buildManifest = readJsonManifest<BuildManifest>(nextDir, 'build-manifest.json');
  const rootMainFiles = buildManifest?.rootMainFiles ?? [];
  if (rootMainFiles.length === 0) return undefined;

  const turbopackRoutes = collectAppTurbopackRoutes(nextDir, rootMainFiles);
  if (turbopackRoutes) return turbopackRoutes;

  throw new UnsupportedAppRouterError(nextDir);
}
