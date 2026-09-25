import { collectBundleReport } from './index.js';
import { collectPagesRoutes } from './pages.js';
import { FileSizeCache } from './compression.js';
import { UnsupportedAppRouterError } from './unsupported-error.js';
import { EXPECTED_ROUTE_SIZES } from './__fixtures-expected.js';

/**
 * Route Handlers (App Router `route.ts`) are excluded from collector output
 * by design, even though docs/manifests.md lists their computed size for
 * comparison against `next build`'s own printed table. Filter them out of
 * the expectations rather than special-casing the assertions below.
 */
const ROUTE_HANDLER_ROUTES = new Set(['/api/hello']);

/** Mirrors docs/manifests.md's "N.N kB" / "N B" rounding convention. */
function formatLikeDoc(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  return `${(bytes / 1000).toFixed(1)} kB`;
}

const UNSUPPORTED_COMBOS = new Set(['16-webpack/app-router', '16-webpack/mixed']);

describe('collectBundleReport against committed fixtures', () => {
  for (const [combo, apps] of Object.entries(EXPECTED_ROUTE_SIZES)) {
    for (const [app, expectedRows] of Object.entries(apps)) {
      const nextDir = `fixtures/next/${combo}/${app}/.next`;
      const comboKey = `${combo}/${app}`;

      if (UNSUPPORTED_COMBOS.has(comboKey)) {
        it(`${comboKey} throws UnsupportedAppRouterError`, () => {
          expect(() => collectBundleReport(nextDir, { compression: 'gzip' })).toThrow(
            UnsupportedAppRouterError,
          );
        });
        continue;
      }

      it(`${comboKey} matches docs/manifests.md computed gzip bytes`, () => {
        const report = collectBundleReport(nextDir, { compression: 'gzip' });
        const actualByRoute = new Map(report.routes.map((r) => [r.route, r.firstLoad]));
        const expected = expectedRows.filter(([route]) => !ROUTE_HANDLER_ROUTES.has(route));

        expect(expected.length).toBeGreaterThan(0);
        for (const [route, computedGzip] of expected) {
          expect(actualByRoute.has(route), `expected route ${route} in ${comboKey}`).toBe(true);
          const actualBytes = actualByRoute.get(route)!;
          expect(formatLikeDoc(actualBytes), `${comboKey} ${route}`).toBe(computedGzip);
        }
        expect(actualByRoute.size).toBe(expected.length);
      });
    }
  }

  it('16-webpack/mixed: Pages Router routes are still collectible directly', () => {
    // The plan requires that a 16-webpack App Router failure doesn't imply
    // the Pages collector is broken; assert it independently since
    // collectBundleReport throws before returning anything for this combo.
    const nextDir = 'fixtures/next/16-webpack/mixed/.next';
    const filesByRoute = collectPagesRoutes(nextDir);
    expect(filesByRoute).toBeDefined();
    const sizeCache = new FileSizeCache(nextDir, 'gzip');
    const expected = EXPECTED_ROUTE_SIZES['16-webpack']?.mixed ?? [];
    expect(expected.length).toBeGreaterThan(0);
    for (const [route, computedGzip] of expected) {
      const files = filesByRoute?.get(route);
      expect(files, `expected route ${route}`).toBeDefined();
      const bytes = sizeCache.sizeOfSet(files!);
      expect(formatLikeDoc(bytes), route).toBe(computedGzip);
    }
  });
});
