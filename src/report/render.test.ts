import { describe, expect, it } from 'vitest';
import type { BundleReport, RouteMeasurement } from '../collectors/types.js';
import { COLLECTOR_VERSION, SCHEMA_VERSION } from '../collectors/types.js';
import { evaluateThresholds } from '../thresholds/evaluate.js';
import type { ThresholdConfig } from '../thresholds/types.js';
import { compareBundleReports, toThresholdInput } from './compare.js';
import { buildActionUrl } from './action-url.js';
import { renderReport, type ReportMeta } from './render.js';

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

/** 34 identical (0-delta) filler routes plus 4 small (<512B) filler routes, so totals reconcile to 42 head routes. */
function fillerRoutes(): { head: RouteMeasurement[]; base: RouteMeasurement[] } {
  const head: RouteMeasurement[] = [];
  const base: RouteMeasurement[] = [];
  for (let i = 0; i < 32; i++) {
    head.push(route(`/filler-zero-${i}`, 'app', 50_000, 40_000));
    base.push(route(`/filler-zero-${i}`, 'app', 50_000, 40_000));
  }
  for (let i = 0; i < 4; i++) {
    head.push(route(`/filler-small-${i}`, 'app', 50_100, 40_000));
    base.push(route(`/filler-small-${i}`, 'app', 50_000, 40_000));
  }
  return { head, base };
}

const budgets = new Map([
  ['/map/**', {}],
  ['/admin/*', { warnRouteIncrease: { kind: 'percent' as const, fraction: 0.15 } }],
]);

const config: ThresholdConfig = {
  warnRouteSize: 250_000,
  failRouteSize: 400_000,
  warnRouteIncrease: { kind: 'percent', fraction: 0.05 },
  failRouteIncrease: { kind: 'bytes', bytes: 20_000 },
  warnTotalIncrease: { kind: 'bytes', bytes: 10_000 },
  warnSharedSize: 150_000,
  budgets,
};

const meta: ReportMeta = {
  name: 'web',
  slug: 'web',
  baseBranch: 'main',
  baseShortSha: 'a1b2c3d',
  compression: 'gzip',
  significantChangeBytes: 512,
  thresholds: config,
  budgetsFilePath: '.github/bundle-budgets.json',
  nextVersion: '15.5.4',
  bundler: 'webpack',
  actionVersion: 'v1.2.0',
  actionUrl: undefined,
  jobSummaryUrl: undefined,
  repoUrl: undefined,
  baselineWarning: undefined,
};

describe('renderReport', () => {
  it('reproduces plan.md example 1 (PR with findings)', () => {
    const filler = fillerRoutes();

    const headReport = report({
      total: 612_400,
      routers: { app: { shared: 143_100 }, pages: { shared: 88_600 } },
      routes: [
        route('/', 'app', 158_300, 15_200),
        route('/dashboard', 'app', 213_400, 70_300),
        route('/editor', 'app', 312_800, 169_700),
        route('/settings', 'app', 176_900, 33_800),
        route('/reports/[id]', 'app', 198_400, 55_300),
        route('/api-docs', 'pages', 101_200, 12_600),
        ...filler.head,
      ],
    });
    const baseReport = report({
      total: 594_100,
      routers: { app: { shared: 142_000 }, pages: { shared: 88_600 } },
      routes: [
        route('/', 'app', 158_300, 15_200),
        route('/dashboard', 'app', 200_900, 57_800),
        route('/editor', 'app', 288_700, 145_600),
        route('/settings', 'app', 180_200, 37_100),
        route('/api-docs', 'pages', 101_200, 12_600),
        route('/legacy-export', 'pages', 95_200, 20_000),
        ...filler.base,
      ],
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const { markdown } = renderReport(comparison, findings, meta);

    const [head, tail] = splitBeforeAllRoutes(markdown);

    expect(head).toBe(
      [
        '<!-- nextjs-bundle-analysis:web -->',
        '### ❌ Bundle sizes · web',
        '',
        '**612.4 kB** total client JS (gzip) · **+18.3 kB (+3.1%)** vs `a1b2c3d` on `main`',
        '42 routes · 3 changed · 1 added · 1 removed · **1 failure · 3 warnings**',
        '',
        '#### Findings',
        '| | Route | Check | Value | Limit |',
        '| :-: | --- | --- | ---: | ---: |',
        '| ❌ | `/editor` | Route increase | +24.1 kB | fail &gt; 20 kB |',
        '| ⚠️ | `/editor` | Route size | 312.8 kB | warn &gt; 250 kB |',
        '| ⚠️ | `/dashboard` | Route increase | +6.2% | warn &gt; 5% |',
        '| ⚠️ | _total_ | Total increase | +18.3 kB | warn &gt; 10 kB |',
        '',
        '#### Changed routes',
        '| Route | Router | Before | After | Δ | Δ% | |',
        '| --- | --- | ---: | ---: | ---: | ---: | :-: |',
        '| `/editor` | app | 288.7 kB | 312.8 kB | +24.1 kB | +8.3% | ❌ |',
        '| `/dashboard` | app | 200.9 kB | 213.4 kB | +12.5 kB | +6.2% | ⚠️ |',
        '| `/settings` | app | 180.2 kB | 176.9 kB | −3.3 kB | −1.8% | 🟢 |',
        '| _shared_ | app | 142.0 kB | 143.1 kB | +1.1 kB | +0.8% | |',
        '',
        '**Added:** `/reports/[id]` (app) 198.4 kB',
        '**Removed:** `/legacy-export` (pages) was 95.2 kB',
        '',
        '<sub>4 routes changed by less than 512 B and are hidden.</sub>',
        '',
        '',
      ].join('\n'),
    );

    expect(tail).toContain('<details><summary>All routes (42)</summary>');
    expect(tail).toContain('**App Router** (shared 143.1 kB)');
    expect(tail).toContain('| `/` | 158.3 kB | 15.2 kB | 63% |');
    expect(tail).toContain('| `/dashboard` | 213.4 kB | 70.3 kB | 85% |');
    expect(tail).toContain('| `/editor` | 312.8 kB | 169.7 kB | ⚠️ 125% |');
    expect(tail).toContain('**Pages Router** (shared 88.6 kB)');
    expect(tail).toContain('| `/api-docs` | 101.2 kB | 12.6 kB | 40% |');
    expect(tail).toContain(
      '<sub>Thresholds: route size warn 250 kB / fail 400 kB · route increase warn 5% / fail 20 kB · total increase warn 10 kB · overrides: `.github/bundle-budgets.json` (2 rules)<br>\nNext 15.5.4 (webpack) · nextjs-bundle-analysis-action v1.2.0</sub>',
    );
  });

  it('reproduces plan.md example 2 (no significant changes)', () => {
    const routes = Array.from({ length: 42 }, (_, i) =>
      route(`/route-${i}`, 'app', 14_145, 10_000),
    );
    const headReport = report({ total: 594_100, routers: { app: { shared: 88_600 } }, routes });
    const baseReport = report({ total: 596_600, routers: { app: { shared: 88_600 } }, routes });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), {});
    const { markdown } = renderReport(comparison, findings, {
      ...meta,
      thresholds: {},
      budgetsFilePath: undefined,
    });

    const [head] = splitBeforeAllRoutes(markdown);
    expect(head).toBe(
      [
        '<!-- nextjs-bundle-analysis:web -->',
        '### ✅ Bundle sizes · web',
        '',
        '**594.1 kB** total client JS (gzip) · **−2.5 kB (−0.4%)** vs `a1b2c3d` on `main`',
        '42 routes · no route changed by ≥ 512 B · 0 warnings',
        '',
        '',
      ].join('\n'),
    );
  });

  it('reproduces plan.md example 3 (no baseline yet)', () => {
    const routes = Array.from({ length: 42 }, (_, i) =>
      route(`/route-${i}`, 'app', 14_145, 10_000),
    );
    const headReport = report({ total: 594_100, routers: { app: { shared: 88_600 } }, routes });

    const comparison = compareBundleReports(headReport, undefined);
    const findings = evaluateThresholds(toThresholdInput(comparison), {});
    const { markdown } = renderReport(comparison, findings, {
      ...meta,
      baseShortSha: undefined,
      thresholds: {},
      budgetsFilePath: undefined,
    });

    const [head] = splitBeforeAllRoutes(markdown);
    expect(head).toBe(
      [
        '<!-- nextjs-bundle-analysis:web -->',
        '### ℹ️ Bundle sizes · web',
        '',
        '**594.1 kB** total client JS (gzip) · 42 routes · 0 warnings',
        'No baseline from `main` yet. One is created on the next successful push to `main`. Absolute budgets were still checked.',
        '',
        '',
      ].join('\n'),
    );
  });

  it('reproduces plan.md example 4 (incompatible baseline)', () => {
    const editor = route('/editor', 'app', 312_800, 169_700);
    const routes = [
      editor,
      ...Array.from({ length: 41 }, (_, i) => route(`/route-${i}`, 'app', 14_145, 10_000)),
    ];
    const headReport = report({ total: 594_100, routers: { app: { shared: 88_600 } }, routes });
    const baseReport = report({
      total: 594_100,
      routers: { app: { shared: 88_600 } },
      routes,
      fingerprint: {
        schemaVersion: SCHEMA_VERSION,
        collectorVersion: COLLECTOR_VERSION,
        compression: 'brotli',
      },
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const singleRouteConfig: ThresholdConfig = { warnRouteSize: 250_000 };
    const findings = evaluateThresholds(toThresholdInput(comparison), singleRouteConfig);
    const { markdown } = renderReport(comparison, findings, {
      ...meta,
      thresholds: singleRouteConfig,
      budgetsFilePath: undefined,
    });

    const [head] = splitBeforeAllRoutes(markdown);
    expect(head).toBe(
      [
        '<!-- nextjs-bundle-analysis:web -->',
        '### ⚠️ Bundle sizes · web',
        '',
        '**594.1 kB** total client JS (gzip) · 42 routes · 1 warning',
        'Baseline `a1b2c3d` was measured with brotli / collector v1 (now gzip / collector v1), so deltas are skipped this run. Absolute budgets were still checked.',
        '',
        '#### Findings',
        '| | Route | Check | Value | Limit |',
        '| :-: | --- | --- | ---: | ---: |',
        '| ⚠️ | `/editor` | Route size | 312.8 kB | warn &gt; 250 kB |',
        '',
        '',
      ].join('\n'),
    );
  });
});

describe('renderReport truncation', () => {
  it('drops the All routes section, then caps changed routes, to fit the size budget', () => {
    const headRoutes: RouteMeasurement[] = [];
    const baseRoutes: RouteMeasurement[] = [];
    for (let i = 0; i < 1500; i++) {
      headRoutes.push(
        route(`/route-with-a-fairly-long-name-${i}`, 'app', 200_000 + i * 100, 50_000),
      );
      baseRoutes.push(route(`/route-with-a-fairly-long-name-${i}`, 'app', 100_000, 50_000));
    }

    const headReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 150_000_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(60_000);
    expect(result.markdown).not.toContain('<details>');
    expect(result.markdown).toContain('Report truncated to fit the comment size limit.');
  });

  it('drops only the All routes section when that alone is enough to fit', () => {
    const headRoutes: RouteMeasurement[] = [
      route('/a', 'app', 200_000, 50_000),
      route('/b', 'app', 100_500, 50_000),
    ];
    const baseRoutes: RouteMeasurement[] = [
      route('/a', 'app', 100_000, 50_000),
      route('/b', 'app', 100_000, 50_000),
    ];
    for (let i = 0; i < 3000; i++) {
      headRoutes.push(route(`/all-routes-filler-${i}`, 'app', 50_000, 40_000));
      baseRoutes.push(route(`/all-routes-filler-${i}`, 'app', 50_000, 40_000));
    }

    const headReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(true);
    expect(result.markdown).not.toContain('<details>');
    expect(result.markdown).toContain('#### Changed routes');
    expect(result.markdown).toContain('| `/a` |');
  });

  it('bounds the Added list when thousands of routes are added', () => {
    const headRoutes: RouteMeasurement[] = [route('/kept', 'app', 100_000, 50_000)];
    const baseRoutes: RouteMeasurement[] = [route('/kept', 'app', 100_000, 50_000)];
    for (let i = 0; i < 3001; i++) {
      headRoutes.push(route(`/added-route-with-a-fairly-long-name-${i}`, 'app', 50_000, 40_000));
    }

    const headReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 100_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(60_000);
    expect(result.markdown).toContain('and');
    expect(result.markdown).toContain('more');
  });

  it('bounds the Removed list when thousands of routes are removed', () => {
    const headRoutes: RouteMeasurement[] = [route('/kept', 'app', 100_000, 50_000)];
    const baseRoutes: RouteMeasurement[] = [route('/kept', 'app', 100_000, 50_000)];
    for (let i = 0; i < 3001; i++) {
      baseRoutes.push(route(`/removed-route-with-a-fairly-long-name-${i}`, 'app', 50_000, 40_000));
    }

    const headReport = report({
      total: 100_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(60_000);
    expect(result.markdown).toContain('and');
    expect(result.markdown).toContain('more');
  });

  it('preserves a failing added route in Findings even among thousands of changed routes', () => {
    const headRoutes: RouteMeasurement[] = [];
    const baseRoutes: RouteMeasurement[] = [];
    for (let i = 0; i < 3000; i++) {
      // A constant, finding-free 600 B delta (above the 512 B significance threshold, but well
      // under every warn/fail budget) — these routes are "changed" but never generate a finding.
      headRoutes.push(route(`/route-with-a-fairly-long-name-${i}`, 'app', 100_600, 50_000));
      baseRoutes.push(route(`/route-with-a-fairly-long-name-${i}`, 'app', 100_000, 50_000));
    }
    headRoutes.push(route('/added-and-over-budget', 'app', 500_000, 500_000));

    const headReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 150_000_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(60_000);
    expect(result.markdown).toContain('#### Findings');
    expect(result.markdown).toContain('| ❌ | `/added-and-over-budget` | Route size |');
  });

  it('shows a route as changed when it has a Route increase finding even below the significance threshold', () => {
    // A low bytes-based warnRouteIncrease override lets a small (100 B) delta still breach the
    // increase check, while remaining below the 512 B significance threshold used elsewhere.
    const lowIncreaseThresholdConfig: ThresholdConfig = {
      ...config,
      warnRouteIncrease: { kind: 'bytes', bytes: 50 },
    };
    const headRoutes: RouteMeasurement[] = [
      route('/small-increase', 'app', 100_100, 50_000),
      route('/unchanged', 'app', 100_000, 50_000),
    ];
    const baseRoutes: RouteMeasurement[] = [
      route('/small-increase', 'app', 100_000, 50_000),
      route('/unchanged', 'app', 100_000, 50_000),
    ];

    const headReport = report({
      total: 200_100,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 200_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), lowIncreaseThresholdConfig);
    const result = renderReport(comparison, findings, meta);

    expect(result.truncated).toBe(false);
    expect(result.markdown).toContain('#### Changed routes');
    expect(result.markdown).toContain('| `/small-increase` |');
    expect(result.markdown).not.toMatch(/route changed by less than .* and are hidden/);
  });

  it('does not list an unchanged, over-budget route as a changed route', () => {
    const headRoutes: RouteMeasurement[] = [
      route('/over', 'app', 300_000, 50_000),
      route('/unchanged', 'app', 100_000, 50_000),
    ];
    const baseRoutes: RouteMeasurement[] = [
      route('/over', 'app', 300_000, 50_000),
      route('/unchanged', 'app', 100_000, 50_000),
    ];
    for (let i = 0; i < 20; i++) {
      headRoutes.push(route(`/over-${i}`, 'app', 300_000, 50_000));
      baseRoutes.push(route(`/over-${i}`, 'app', 300_000, 50_000));
    }

    const headReport = report({
      total: 400_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 400_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, meta);

    expect(result.markdown).not.toContain('#### Changed routes');
    expect(result.markdown).toContain('no route changed by');
    expect(result.markdown).toContain('#### Findings');
    expect(result.markdown).toContain('| `/over` | Route size |');
  });

  it('links to the job summary in the truncation notice when one is provided', () => {
    const headRoutes: RouteMeasurement[] = [];
    const baseRoutes: RouteMeasurement[] = [];
    for (let i = 0; i < 1500; i++) {
      headRoutes.push(
        route(`/route-with-a-fairly-long-name-${i}`, 'app', 200_000 + i * 100, 50_000),
      );
      baseRoutes.push(route(`/route-with-a-fairly-long-name-${i}`, 'app', 100_000, 50_000));
    }
    const headReport = report({
      total: 300_000_000,
      routers: { app: { shared: 143_100 } },
      routes: headRoutes,
    });
    const baseReport = report({
      total: 150_000_000,
      routers: { app: { shared: 143_100 } },
      routes: baseRoutes,
    });

    const comparison = compareBundleReports(headReport, baseReport);
    const findings = evaluateThresholds(toThresholdInput(comparison), config);
    const result = renderReport(comparison, findings, {
      ...meta,
      jobSummaryUrl: 'https://example.com/summary',
    });

    expect(result.markdown).toContain('[job summary](https://example.com/summary)');
  });
});

describe('renderReport footer action version', () => {
  const SHA = '0562a1d3f76ac459586a5b4c40a4113452500ca7';
  const BASE = 'https://github.com/garnertb/nextjs-bundle-analysis-action/tree';

  function footerLine(partial: Partial<ReportMeta>): string {
    const headReport = report({ total: 1000, routers: { app: { shared: 500 } }, routes: [] });
    const comparison = compareBundleReports(headReport, headReport);
    const { markdown } = renderReport(comparison, [], {
      ...meta,
      thresholds: {},
      budgetsFilePath: undefined,
      ...partial,
    });
    const line = markdown.split('\n').find((l) => l.includes('nextjs-bundle-analysis-action'));
    if (line === undefined) throw new Error('footer line not found');
    return line;
  }

  it('links a tag ref with the tag as the text', () => {
    expect(footerLine({ actionVersion: 'v1.2.0', actionUrl: `${BASE}/v1.2.0` })).toBe(
      `<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action [v1.2.0](${BASE}/v1.2.0)</sub>`,
    );
  });

  it('links a full SHA ref with the full SHA in the URL and 7 characters as the text', () => {
    expect(footerLine({ actionVersion: SHA, actionUrl: `${BASE}/${SHA}` })).toBe(
      `<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action [0562a1d](${BASE}/${SHA})</sub>`,
    );
  });

  it('shortens a full SHA even when there is no link', () => {
    expect(footerLine({ actionVersion: SHA, actionUrl: undefined })).toBe(
      '<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action 0562a1d</sub>',
    );
  });

  it('renders dev as plain text without a link', () => {
    expect(footerLine({ actionVersion: 'dev', actionUrl: undefined })).toBe(
      '<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action dev</sub>',
    );
  });

  it.each([
    ['v1)](/evil', 'v1)\\](/evil', 'v1%29%5D%28/evil'],
    ['release/<script>/x', 'release/&lt;script&gt;/x', 'release/%3Cscript%3E/x'],
    ['a|b', 'a\\|b', 'a%7Cb'],
    ['a`b', 'a\\`b', 'a%60b'],
    ['a\\]b', 'a\\\\\\]b', 'a%5C%5Db'],
    ['/evil-->route', '/evil--&gt;route', '/evil--%3Eroute'],
    [
      '<!<!---- nextjs-bundle-analysis:web ---->>',
      '&lt;!&lt;!---- nextjs-bundle-analysis:web ----&gt;&gt;',
      '%3C%21%3C%21----%20nextjs-bundle-analysis%3Aweb%20----%3E%3E',
    ],
  ])('keeps the hostile ref %j inside a single link', (ref, text, encoded) => {
    const url = buildActionUrl({ serverUrl: 'https://github.com', repository: 'o/r', ref });
    expect(url).toBeDefined();
    expect(url).toContain(encoded);
    const line = footerLine({ actionVersion: ref, actionUrl: url });
    expect(line).toBe(
      `<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action [${text}](${url ?? ''})</sub>`,
    );
    expect(line).not.toContain('<!--');
    expect(line).not.toContain('-->');
    expect(line.match(/(?<!\\)(?:\\\\)*\]\(/g)).toHaveLength(1);
  });

  it.each([
    'https://github.com/o/r/tree/x) [spoof](https://example.test',
    'https://github.com/o/r/tree/<x>',
    'https://github.com/o/r/tree/a b',
    'javascript:alert(1)',
    'https://example.test/o/r/tree/v1',
  ])('falls back to plain text for the unsafe actionUrl %j', (actionUrl) => {
    expect(footerLine({ actionVersion: 'v1.2.0', actionUrl })).toBe(
      '<sub>Next 15.5.4 (webpack) · nextjs-bundle-analysis-action v1.2.0</sub>',
    );
  });
});

function splitBeforeAllRoutes(markdown: string): [string, string] {
  const marker = '<details>';
  const index = markdown.indexOf(marker);
  return [markdown.slice(0, index), markdown.slice(index)];
}
