import fs from 'node:fs';
import path from 'node:path';
import { collectBundleReport } from './index.js';
import { collectPagesRoutes } from './pages.js';
import { FileSizeCache } from './compression.js';
import { walkFiles } from './manifest-io.js';
import { UnsupportedAppRouterError } from './unsupported-error.js';
import { EXPECTED_ROUTE_SIZES } from './__fixtures-expected.js';
import type { RouteMeasurement } from './types.js';

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

/** The `<script src>` files a prerendered page loads, minus the `nomodule` polyfills. */
function scriptsLoadedBy(htmlFile: string, polyfillFiles: ReadonlySet<string>): string[] {
  const html = fs.readFileSync(htmlFile, 'utf8');
  return Array.from(html.matchAll(/<script[^>]*\ssrc="\/_next\/([^"]+)"/g), (match) =>
    decodeURIComponent(match[1]!),
  ).filter((file) => !polyfillFiles.has(file));
}

/**
 * The App Router routes that render at `url`: a parallel-route slot is a
 * route of its own, so a URL with slots renders one route per slot.
 */
function routesRenderedAt(routes: RouteMeasurement[], url: string): RouteMeasurement[] {
  const urlSegments = url.split('/').filter(Boolean);
  return routes.filter((route) => {
    const segments = route.route.split('/').filter((s) => s.length > 0 && !s.startsWith('@'));
    return (
      segments.length === urlSegments.length &&
      segments.every((segment, i) => /^\[[^.\]]+\]$/.test(segment) || segment === urlSegments[i])
    );
  });
}

describe('App Router first-load files against prerendered HTML', () => {
  for (const [combo, apps] of Object.entries(EXPECTED_ROUTE_SIZES)) {
    for (const app of Object.keys(apps)) {
      const comboKey = `${combo}/${app}`;
      const nextDir = `fixtures/next/${comboKey}/.next`;
      const appDir = path.join(nextDir, 'server', 'app');
      const htmlFiles = walkFiles(appDir, (name) => name.endsWith('.html'));
      if (UNSUPPORTED_COMBOS.has(comboKey) || htmlFiles.length === 0) continue;

      it(`${comboKey}: every script a prerendered page loads is in its routes' files`, () => {
        const report = collectBundleReport(nextDir, { compression: 'gzip' });
        const appRoutes = report.routes.filter((route) => route.router === 'app');
        const buildManifest = JSON.parse(
          fs.readFileSync(path.join(nextDir, 'build-manifest.json'), 'utf8'),
        ) as { polyfillFiles?: string[] };
        const polyfillFiles = new Set(buildManifest.polyfillFiles ?? []);

        for (const htmlFile of htmlFiles) {
          const page = path
            .relative(appDir, htmlFile)
            .replace(/\.html$/, '')
            .split(path.sep);
          const url = page.join('/') === 'index' ? '/' : `/${page.join('/')}`;
          const routes = routesRenderedAt(appRoutes, url);
          expect(routes.length, `routes rendered at ${url}`).toBeGreaterThan(0);
          const files = new Set(routes.flatMap((route) => route.files));
          const missing = scriptsLoadedBy(htmlFile, polyfillFiles).filter((f) => !files.has(f));
          expect(missing, `${comboKey} ${url}`).toEqual([]);
        }
      });
    }
  }
});
