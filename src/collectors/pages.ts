import { readJsonManifest } from './manifest-io.js';

interface BuildManifest {
  pages?: Record<string, string[]>;
}

const EXCLUDED_ROUTES = new Set(['/_app', '/_error', '/_document']);

/**
 * Pages Router first-load JS is `pages['/_app'] ∪ pages[route]`:
 * `build-manifest.json.pages[route]` never includes the `/_app` files on its
 * own, but `next build`'s own First Load JS total always counts them.
 */
export function collectPagesRoutes(nextDir: string): Map<string, string[]> | undefined {
  const manifest = readJsonManifest<BuildManifest>(nextDir, 'build-manifest.json');
  if (!manifest?.pages) return undefined;
  const appFiles = manifest.pages['/_app'] ?? [];
  const routeKeys = Object.keys(manifest.pages).filter((key) => !EXCLUDED_ROUTES.has(key));
  if (routeKeys.length === 0) return undefined;
  const routes = new Map<string, string[]>();
  for (const route of routeKeys) {
    const files = new Set([...appFiles, ...(manifest.pages[route] ?? [])]);
    routes.set(route, Array.from(files));
  }
  return routes;
}
