import { describe, expect, it } from 'vitest';
import { evaluateThresholds } from './evaluate.js';
import type { ThresholdConfig, ThresholdEvaluationInput } from './types.js';

function input(overrides: Partial<ThresholdEvaluationInput> = {}): ThresholdEvaluationInput {
  return {
    routes: [],
    totalHead: 0,
    totalBase: undefined,
    sharedHead: {},
    baselineComparable: false,
    ...overrides,
  };
}

describe('evaluateThresholds', () => {
  it('reproduces plan.md example 1 (PR with findings)', () => {
    const config: ThresholdConfig = {
      warnRouteSize: 250_000,
      failRouteSize: 400_000,
      warnRouteIncrease: { kind: 'percent', fraction: 0.05 },
      failRouteIncrease: { kind: 'bytes', bytes: 20_000 },
      warnTotalIncrease: { kind: 'bytes', bytes: 10_000 },
    };
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        totalHead: 612_400,
        totalBase: 594_100,
        routes: [
          { route: '/editor', router: 'app', head: 312_800, base: 288_700 },
          { route: '/dashboard', router: 'app', head: 213_400, base: 200_900 },
        ],
      }),
      config,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        {
          level: 'warn',
          route: '/dashboard',
          check: 'Route increase',
          value: '+6.2%',
          limit: 'warn > 5%',
          message: 'Route "/dashboard" increased by +6.2%, exceeding the warn threshold of 5%.',
        },
        {
          level: 'fail',
          route: '/editor',
          check: 'Route increase',
          value: '+24.1 kB',
          limit: 'fail > 20 kB',
          message: 'Route "/editor" increased by +24.1 kB, exceeding the fail threshold of 20 kB.',
        },
        {
          level: 'warn',
          route: '/editor',
          check: 'Route size',
          value: '312.8 kB',
          limit: 'warn > 250 kB',
          message: 'Route "/editor" first load is 312.8 kB, exceeding the warn budget of 250 kB.',
        },
        {
          level: 'warn',
          route: '_total_',
          check: 'Total increase',
          value: '+18.3 kB',
          limit: 'warn > 10 kB',
          message: 'Total client JS increased by +18.3 kB, exceeding the warn threshold of 10 kB.',
        },
      ]),
    );
    expect(result).toHaveLength(4);
  });

  it("doesn't add a route-increase warning when the fail threshold already breached (more severe wins)", () => {
    const config: ThresholdConfig = {
      warnRouteIncrease: { kind: 'percent', fraction: 0.05 },
      failRouteIncrease: { kind: 'bytes', bytes: 20_000 },
    };
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        routes: [{ route: '/editor', router: 'app', head: 312_800, base: 288_700 }],
      }),
      config,
    );
    expect(result).toEqual([
      expect.objectContaining({
        level: 'fail',
        route: '/editor',
        check: 'Route increase',
        value: '+24.1 kB',
      }),
    ]);
  });

  it('does not evaluate route-increase for an added route', () => {
    const config: ThresholdConfig = { failRouteIncrease: { kind: 'bytes', bytes: 1 } };
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        routes: [{ route: '/new', router: 'app', head: 100_000, base: undefined }],
      }),
      config,
    );
    expect(result).toEqual([]);
  });

  it('still evaluates absolute route-size for an added route', () => {
    const config: ThresholdConfig = { failRouteSize: 50_000 };
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        routes: [{ route: '/new', router: 'app', head: 100_000, base: undefined }],
      }),
      config,
    );
    expect(result).toEqual([
      expect.objectContaining({ level: 'fail', route: '/new', check: 'Route size' }),
    ]);
  });

  it('skips percent-based delta checks against a zero-byte baseline, but still checks byte-based ones', () => {
    const config: ThresholdConfig = {
      warnRouteIncrease: { kind: 'percent', fraction: 0.05 },
      failRouteIncrease: { kind: 'bytes', bytes: 100 },
    };
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        routes: [{ route: '/about', router: 'app', head: 500, base: 0 }],
      }),
      config,
    );
    expect(result).toEqual([
      expect.objectContaining({
        level: 'fail',
        route: '/about',
        check: 'Route increase',
        value: '+500 B',
      }),
    ]);
  });

  it('skips all delta checks when the baseline is incompatible, but still checks absolute budgets', () => {
    const config: ThresholdConfig = {
      failRouteSize: 50_000,
      failRouteIncrease: { kind: 'bytes', bytes: 1 },
      failTotalIncrease: { kind: 'bytes', bytes: 1 },
      failSharedSize: 1,
    };
    const result = evaluateThresholds(
      input({
        baselineComparable: false,
        totalHead: 100_000,
        totalBase: 1,
        sharedHead: { app: 100 },
        routes: [{ route: '/about', router: 'app', head: 100_000, base: 1 }],
      }),
      config,
    );
    expect(result.map((f) => f.check).sort()).toEqual(['Route size', 'Shared size']);
  });

  it('applies a budgets-file override for a matching route', () => {
    const config: ThresholdConfig = {
      warnRouteSize: 250_000,
      budgets: new Map([['/map/**', { warnRouteSize: 600_000 }]]),
    };
    const result = evaluateThresholds(
      input({ routes: [{ route: '/map/region', router: 'app', head: 300_000, base: undefined }] }),
      config,
    );
    expect(result).toEqual([]);
  });

  it('evaluates shared-size per router', () => {
    const config: ThresholdConfig = { warnSharedSize: 140_000 };
    const result = evaluateThresholds(
      input({ sharedHead: { app: 143_100, pages: 88_600 } }),
      config,
    );
    expect(result).toEqual([
      expect.objectContaining({
        level: 'warn',
        route: '_shared_ (app)',
        check: 'Shared size',
        value: '143.1 kB',
      }),
    ]);
  });

  it('treats a removed route as informational (no findings emitted for it)', () => {
    // Removed routes aren't in `routes` at all by construction (only head-side
    // routes are evaluated), so an empty routes list plus a shrinking total
    // shouldn't produce a route-level finding.
    const config: ThresholdConfig = { failRouteSize: 1 };
    const result = evaluateThresholds(input({ routes: [] }), config);
    expect(result).toEqual([]);
  });

  it('returns no findings when nothing is configured', () => {
    const result = evaluateThresholds(
      input({
        baselineComparable: true,
        totalHead: 100,
        totalBase: 50,
        sharedHead: { app: 100 },
        routes: [{ route: '/about', router: 'app', head: 100, base: 50 }],
      }),
      {},
    );
    expect(result).toEqual([]);
  });
});
