import { readJsonManifest } from './manifest-io.js';
import { buildRouteFileMap } from './route-path.js';

interface AppBuildManifest {
  pages?: Record<string, string[]>;
}

/**
 * App Router routes on webpack (Next 14/15) and on Next 15 Turbopack are
 * listed directly in `app-build-manifest.json.pages`, keyed by manifest path
 * (e.g. `/blog/[slug]/page`). Route Handlers (`/route` keys) are excluded:
 * research found none of the studied builds ship client JS for them.
 */
export function collectAppManifestRoutes(nextDir: string): Map<string, string[]> | undefined {
  const manifest = readJsonManifest<AppBuildManifest>(nextDir, 'app-build-manifest.json');
  if (!manifest?.pages) return undefined;
  const routes = buildRouteFileMap(Object.entries(manifest.pages), {
    includePage: true,
    includeRoute: false,
  });
  return routes.size === 0 ? undefined : routes;
}
