import { describe, expect, it } from 'vitest';
import type { BundleReport, RouteMeasurement } from '../collectors/types.js';
import { COLLECTOR_VERSION, SCHEMA_VERSION } from '../collectors/types.js';
import { compareBundleReports, toThresholdInput } from './compare.js';

function route(
  route: string,
  router: 'app' | 'pages',
  firstLoad: number,
  own: number,
): RouteMeasurement {
  return { route, router, firstLoad, own, files: [] };
}

function report(
  partial: Partial<BundleReport> & Pick<BundleReport, 'total' | 'routers' | 'routes'>,
): BundleReport {
  return {
    fingerprint: {
      schemaVersion: SCHEMA_VERSION,
      collectorVersion: COLLECTOR_VERSION,
      compression: 'gzip',
    },
    nextVersion: '15.5.4',
    bundler: 'webpack',
    ...partial,
  };
}

describe('compareBundleReports', () => {
  it('marks the baseline missing when none is provided', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 } },
      routes: [route('/', 'app', 500, 400)],
    });
    const comparison = compareBundleReports(head, undefined);
    expect(comparison.baselineStatus).toBe('missing');
    expect(comparison.totalBefore).toBeUndefined();
    expect(comparison.routes[0]!.before).toBeUndefined();
    expect(comparison.routes[0]!.added).toBe(false);
    expect(comparison.removed).toEqual([]);
  });

  it('marks the baseline incompatible when the fingerprint differs, and skips deltas', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 } },
      routes: [route('/', 'app', 500, 400)],
    });
    const base = report({
      total: 900,
      routers: { app: { shared: 90 } },
      routes: [route('/', 'app', 450, 350)],
      fingerprint: {
        schemaVersion: SCHEMA_VERSION,
        collectorVersion: COLLECTOR_VERSION,
        compression: 'brotli',
      },
    });
    const comparison = compareBundleReports(head, base);
    expect(comparison.baselineStatus).toBe('incompatible');
    expect(comparison.incompatibility).toEqual({
      baseCompression: 'brotli',
      baseCollectorVersion: COLLECTOR_VERSION,
      headCompression: 'gzip',
      headCollectorVersion: COLLECTOR_VERSION,
    });
    expect(comparison.totalBefore).toBeUndefined();
    expect(comparison.routes[0]!.deltaBytes).toBeUndefined();
  });

  it('matches routes by (router, route) and computes deltas when comparable', () => {
    const head = report({
      total: 1200,
      routers: { app: { shared: 110 } },
      routes: [route('/a', 'app', 600, 500)],
    });
    const base = report({
      total: 1000,
      routers: { app: { shared: 100 } },
      routes: [route('/a', 'app', 500, 400)],
    });
    const comparison = compareBundleReports(head, base);
    expect(comparison.baselineStatus).toBe('found');
    expect(comparison.routes[0]).toMatchObject({
      before: 500,
      after: 600,
      deltaBytes: 100,
      deltaPercent: 0.2,
      added: false,
    });
    expect(comparison.totalDeltaBytes).toBe(200);
    expect(comparison.totalDeltaPercent).toBe(0.2);
  });

  it('flags a head-only route as added, and a base-only route as removed', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 } },
      routes: [route('/kept', 'app', 500, 400), route('/new', 'app', 300, 200)],
    });
    const base = report({
      total: 900,
      routers: { app: { shared: 100 } },
      routes: [route('/kept', 'app', 500, 400), route('/gone', 'app', 250, 200)],
    });
    const comparison = compareBundleReports(head, base);
    const added = comparison.routes.find((r) => r.route === '/new')!;
    expect(added.added).toBe(true);
    expect(added.before).toBeUndefined();
    expect(added.deltaBytes).toBeUndefined();
    expect(comparison.removed).toEqual([{ route: '/gone', router: 'app', before: 250 }]);
  });

  it('leaves deltaPercent undefined against a zero-byte baseline', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 } },
      routes: [route('/a', 'app', 500, 400)],
    });
    const base = report({
      total: 900,
      routers: { app: { shared: 100 } },
      routes: [route('/a', 'app', 0, 0)],
    });
    const comparison = compareBundleReports(head, base);
    expect(comparison.routes[0]!.deltaBytes).toBe(500);
    expect(comparison.routes[0]!.deltaPercent).toBeUndefined();
  });

  it('disambiguates the same route path across different routers', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 }, pages: { shared: 50 } },
      routes: [route('/shared-path', 'app', 500, 400), route('/shared-path', 'pages', 200, 150)],
    });
    const base = report({
      total: 900,
      routers: { app: { shared: 90 }, pages: { shared: 50 } },
      routes: [route('/shared-path', 'app', 450, 350), route('/shared-path', 'pages', 200, 150)],
    });
    const comparison = compareBundleReports(head, base);
    const appRoute = comparison.routes.find((r) => r.router === 'app')!;
    const pagesRoute = comparison.routes.find((r) => r.router === 'pages')!;
    expect(appRoute.deltaBytes).toBe(50);
    expect(pagesRoute.deltaBytes).toBe(0);
  });
});

describe('toThresholdInput', () => {
  it('maps an added route to base=undefined and reflects sharedHead per router', () => {
    const head = report({
      total: 1000,
      routers: { app: { shared: 100 }, pages: { shared: 40 } },
      routes: [route('/a', 'app', 500, 400), route('/b', 'pages', 200, 160)],
    });
    const comparison = compareBundleReports(head, undefined);
    const input = toThresholdInput(comparison);
    expect(input.baselineComparable).toBe(false);
    expect(input.sharedHead).toEqual({ app: 100, pages: 40 });
    expect(input.routes).toEqual([
      { route: '/a', router: 'app', head: 500, base: undefined },
      { route: '/b', router: 'pages', head: 200, base: undefined },
    ]);
  });
});
