import { readJsonManifest } from './manifest-io.js';
import { buildRouteFileMap } from './route-path.js';

interface AppBuildManifest {
  pages?: Record<string, string[]>;
}

/**
 * The files a segment renders around everything below it, outermost first.
 * Next 15 webpack gives each its own manifest entry (e.g. `/blog/layout`);
 * Next 15 Turbopack lists none of them and folds their chunks into every
 * page entry instead.
 */
const SEGMENT_ENTRY_NAMES = ['layout', 'template', 'error', 'loading', 'not-found'] as const;

/** `app/global-error`: when an app defines it, every first visit loads its chunk. */
const GLOBAL_ERROR_KEY = '/global-error';

/**
 * Manifest keys whose chunks a first visit to `pageKey` loads besides the
 * page's own: the global error boundary, then each segment's layout and
 * boundaries from the root down to the page's own segment. A parallel-route
 * slot's page stays a route of its own, so a page doesn't pull in its sibling
 * slots, and slots' `default` entries aren't added.
 */
function enclosingEntryKeys(pageKey: string): string[] {
  const segments = pageKey.split('/').filter(Boolean).slice(0, -1);
  const keys = [GLOBAL_ERROR_KEY];
  for (let depth = 0; depth <= segments.length; depth += 1) {
    const dir = segments
      .slice(0, depth)
      .map((segment) => `/${segment}`)
      .join('');
    keys.push(...SEGMENT_ENTRY_NAMES.map((name) => `${dir}/${name}`));
  }
  return keys;
}

/**
 * App Router routes on webpack (Next 15) and on Next 15 Turbopack are
 * listed in `app-build-manifest.json.pages`, keyed by manifest path (e.g.
 * `/blog/[slug]/page`). On webpack a page's entry leaves out the layouts and
 * boundaries above it, so a route's files are its page entry's plus those of
 * {@link enclosingEntryKeys}. Route Handlers (`/route` keys) are excluded:
 * research found none of the studied builds ship client JS for them.
 */
export function collectAppManifestRoutes(nextDir: string): Map<string, string[]> | undefined {
  const pages = readJsonManifest<AppBuildManifest>(nextDir, 'app-build-manifest.json')?.pages;
  if (!pages) return undefined;
  const entryFiles = (key: string): string[] =>
    Object.hasOwn(pages, key) ? (pages[key] ?? []) : [];
  const entries = Object.entries(pages).map(([key, files]): [string, string[]] => [
    key,
    key.endsWith('/page') ? [...enclosingEntryKeys(key).flatMap(entryFiles), ...files] : files,
  ]);
  const routes = buildRouteFileMap(entries, { includePage: true, includeRoute: false });
  return routes.size === 0 ? undefined : routes;
}
