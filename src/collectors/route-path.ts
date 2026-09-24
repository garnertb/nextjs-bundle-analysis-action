/**
 * Normalizes an App Router manifest key (e.g. `/(marketing)/blog/[slug]/page`)
 * to a route path, matching the reference implementation this project was
 * extracted from: strip the trailing `/page` or `/route`, drop route-group
 * segments (`(name)`), and keep parallel-route slots (`@slot`) and
 * intercepting-route markers (`(.)`, `(..)`, `(...)`) unchanged, since those
 * identify distinct bundles rather than URL segments.
 */
export interface NormalizedManifestKey {
  route: string;
  kind: 'page' | 'route';
}

const KIND_SUFFIX = /\/(page|route)$/;
const ROUTE_GROUP = /^\(.+\)$/;

export function normalizeManifestKey(manifestKey: string): NormalizedManifestKey | undefined {
  const match = KIND_SUFFIX.exec(manifestKey);
  if (!match) return undefined;
  const kind = match[1] as 'page' | 'route';
  const withoutKind = manifestKey.slice(0, -(kind.length + 1));
  const segments = withoutKind
    .split('/')
    .filter((segment) => segment.length > 0)
    .filter((segment) => !ROUTE_GROUP.test(segment));
  return { route: `/${segments.join('/')}`, kind };
}

export class RouteCollisionError extends Error {
  constructor(
    public readonly route: string,
    public readonly firstKey: string,
    public readonly secondKey: string,
  ) {
    super(
      `Two manifest entries normalized to the same route "${route}" (${firstKey} and ${secondKey}). ` +
        'Reporting one would silently hide the other, so refusing to guess.',
    );
    this.name = 'RouteCollisionError';
  }
}

/**
 * Builds a route -> files map from normalized manifest keys, throwing if two
 * distinct keys normalize to the same route.
 */
export function buildRouteFileMap(
  entries: Iterable<readonly [key: string, files: readonly string[]]>,
  options: { includeRoute: boolean; includePage: boolean },
): Map<string, string[]> {
  const routes = new Map<string, { key: string; files: string[] }>();
  for (const [key, files] of entries) {
    const normalized = normalizeManifestKey(key);
    if (!normalized) continue;
    if (normalized.kind === 'route' && !options.includeRoute) continue;
    if (normalized.kind === 'page' && !options.includePage) continue;
    const existing = routes.get(normalized.route);
    if (existing) {
      throw new RouteCollisionError(normalized.route, existing.key, key);
    }
    routes.set(normalized.route, { key, files: Array.from(new Set(files)) });
  }
  return new Map(Array.from(routes, ([route, value]) => [route, value.files]));
}

/**
 * When the same route path is produced by both routers (e.g. a Pages Router
 * migration in progress), suffix each with its router so neither is hidden.
 */
export function disambiguateAcrossRouters(
  pages: Map<string, string[]> | undefined,
  app: Map<string, string[]> | undefined,
): { pages: Map<string, string[]> | undefined; app: Map<string, string[]> | undefined } {
  if (!pages || !app) return { pages, app };
  const collisions = new Set(Array.from(pages.keys()).filter((route) => app.has(route)));
  if (collisions.size === 0) return { pages, app };
  const renamedPages = new Map(
    Array.from(pages, ([route, files]) => [
      collisions.has(route) ? `${route} (pages)` : route,
      files,
    ]),
  );
  const renamedApp = new Map(
    Array.from(app, ([route, files]) => [collisions.has(route) ? `${route} (app)` : route, files]),
  );
  return { pages: renamedPages, app: renamedApp };
}
