import { parseBudgetsFile, resolveRouteBudget } from './budgets-file.js';

describe('parseBudgetsFile', () => {
  it('parses the plan.md example verbatim', () => {
    const raw = JSON.stringify({
      routes: {
        '/map/**': { 'warn-route-size': '600kB', 'fail-route-size': '900kB' },
        '/admin/*': { 'warn-route-increase': '15%' },
      },
    });
    const budgets = parseBudgetsFile(raw, 'bundle-budgets.json');
    expect(budgets.get('/map/**')).toEqual({ warnRouteSize: 600_000, failRouteSize: 900_000 });
    expect(budgets.get('/admin/*')).toEqual({
      warnRouteIncrease: { kind: 'percent', fraction: 0.15 },
    });
  });

  it('throws for invalid JSON', () => {
    expect(() => parseBudgetsFile('{not json', 'bundle-budgets.json')).toThrow(/not valid JSON/);
  });

  it('throws when the top level is not an object', () => {
    expect(() => parseBudgetsFile('[]', 'bundle-budgets.json')).toThrow(
      /expected a top-level JSON object/,
    );
  });

  it('throws when "routes" is missing', () => {
    expect(() => parseBudgetsFile('{}', 'bundle-budgets.json')).toThrow(
      /expected a "routes" object/,
    );
  });

  it('throws for a non-object route override', () => {
    const raw = JSON.stringify({ routes: { '/about': 'not-an-object' } });
    expect(() => parseBudgetsFile(raw, 'bundle-budgets.json')).toThrow(/must be an object/);
  });

  it('throws for an unknown override key', () => {
    const raw = JSON.stringify({ routes: { '/about': { 'warn-total-increase': '10kB' } } });
    expect(() => parseBudgetsFile(raw, 'bundle-budgets.json')).toThrow(/unknown override key/);
  });

  it('throws for a non-string override value', () => {
    const raw = JSON.stringify({ routes: { '/about': { 'warn-route-size': 600_000 } } });
    expect(() => parseBudgetsFile(raw, 'bundle-budgets.json')).toThrow(/must be a string/);
  });
});

describe('resolveRouteBudget', () => {
  it('returns undefined when there are no budgets', () => {
    expect(resolveRouteBudget('/about', undefined)).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    const budgets = new Map([['/map/**', { warnRouteSize: 600_000 }]]);
    expect(resolveRouteBudget('/about', budgets)).toBeUndefined();
  });

  it('picks the more specific single-* glob over a ** glob', () => {
    const budgets = new Map([
      ['/admin/**', { warnRouteSize: 100 }],
      ['/admin/*', { warnRouteSize: 200 }],
    ]);
    expect(resolveRouteBudget('/admin/users', budgets)).toEqual({ warnRouteSize: 200 });
  });

  it('picks the longer literal match when both are single-*', () => {
    const budgets = new Map([
      ['/admin/*', { warnRouteSize: 100 }],
      ['/admin/users/*', { warnRouteSize: 200 }],
    ]);
    expect(resolveRouteBudget('/admin/users/42', budgets)).toEqual({ warnRouteSize: 200 });
  });

  it('breaks an exact specificity tie by first declared entry', () => {
    const budgets = new Map([
      ['/a*', { warnRouteSize: 1 }],
      ['/*b', { warnRouteSize: 2 }],
    ]);
    // Both patterns match "/ab" with identical specificity (1 literal char + 1 single-star).
    expect(resolveRouteBudget('/ab', budgets)).toEqual({ warnRouteSize: 1 });
  });

  it('matches ** across multiple path segments', () => {
    const budgets = new Map([['/map/**', { warnRouteSize: 600_000 }]]);
    expect(resolveRouteBudget('/map/region/[id]', budgets)).toEqual({ warnRouteSize: 600_000 });
  });

  it('does not let a single * cross a path segment boundary', () => {
    const budgets = new Map([['/admin/*', { warnRouteSize: 100 }]]);
    expect(resolveRouteBudget('/admin/users/42', budgets)).toBeUndefined();
  });
});
