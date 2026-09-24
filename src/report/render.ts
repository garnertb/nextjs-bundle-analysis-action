import type { CompressionAlgorithm, RouterName } from '../collectors/types.js';
import {
  formatBytes,
  formatConfiguredBytes,
  formatConfiguredPercent,
  formatSignedBytes,
  formatSignedPercent,
} from '../format.js';
import { resolveRouteBudget } from '../thresholds/budgets-file.js';
import type { Finding, FindingLevel, ThresholdConfig } from '../thresholds/types.js';
import type { SizeOrPercent } from '../thresholds/size-value.js';
import { codeSpan, escapeCell } from './escape.js';
import type { Comparison, RouteRow } from './compare.js';

export interface ReportMeta {
  /** Display label, e.g. `web` (unslugged; the slug is only used for the hidden marker). */
  name: string;
  slug: string;
  baseBranch: string;
  /** Short SHA of the baseline commit; `undefined` when there's no baseline at all. */
  baseShortSha: string | undefined;
  compression: CompressionAlgorithm;
  significantChangeBytes: number;
  thresholds: ThresholdConfig;
  budgetsFilePath: string | undefined;
  nextVersion: string | undefined;
  bundler: string | undefined;
  actionVersion: string;
  /** Linked in the truncation notice when the report had to be shortened to fit. */
  jobSummaryUrl: string | undefined;
}

export interface RenderResult {
  markdown: string;
  /** `true` when the markdown was shortened to fit the size budget; the caller should link to a job summary. */
  truncated: boolean;
}

/** Comment body size budget; GitHub's hard limit is 65,536 characters. */
const MAX_MARKDOWN_LENGTH = 60_000;

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** `_total_`/`_shared_ (router)`-style pseudo-routes render as plain text; real routes get an inline code span. */
function routeCell(route: string): string {
  return route.startsWith('_') ? escapeCell(route) : codeSpan(route);
}

function statusIcon(findings: Finding[], baselineStatus: Comparison['baselineStatus']): string {
  if (findings.some((f) => f.level === 'fail')) return '❌';
  if (findings.some((f) => f.level === 'warn') || baselineStatus === 'incompatible') return '⚠️';
  if (baselineStatus === 'missing' && findings.length === 0) return 'ℹ️';
  return '✅';
}

/** Renders the `{F} failure(s) · {W} warning(s)` phrase, omitting a zero category unless both are zero. */
function findingCountsPhrase(failureCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (failureCount > 0) parts.push(plural(failureCount, 'failure'));
  if (warningCount > 0 || failureCount === 0) parts.push(plural(warningCount, 'warning'));
  return parts.join(' · ');
}

function formatSizeOrPercent(value: SizeOrPercent): string {
  return value.kind === 'bytes'
    ? formatConfiguredBytes(value.bytes)
    : formatConfiguredPercent(value.fraction);
}

function thresholdPairSegment(
  label: string,
  warn: string | undefined,
  fail: string | undefined,
): string | undefined {
  const parts: string[] = [];
  if (warn !== undefined) parts.push(`warn ${warn}`);
  if (fail !== undefined) parts.push(`fail ${fail}`);
  return parts.length > 0 ? `${label} ${parts.join(' / ')}` : undefined;
}

function renderFooter(meta: ReportMeta): string {
  const config = meta.thresholds;
  const segments = [
    thresholdPairSegment(
      'route size',
      config.warnRouteSize !== undefined ? formatConfiguredBytes(config.warnRouteSize) : undefined,
      config.failRouteSize !== undefined ? formatConfiguredBytes(config.failRouteSize) : undefined,
    ),
    thresholdPairSegment(
      'route increase',
      config.warnRouteIncrease && formatSizeOrPercent(config.warnRouteIncrease),
      config.failRouteIncrease && formatSizeOrPercent(config.failRouteIncrease),
    ),
    thresholdPairSegment(
      'total increase',
      config.warnTotalIncrease && formatSizeOrPercent(config.warnTotalIncrease),
      config.failTotalIncrease && formatSizeOrPercent(config.failTotalIncrease),
    ),
  ].filter((s): s is string => s !== undefined);
  if (meta.budgetsFilePath) {
    segments.push(
      `overrides: ${codeSpan(meta.budgetsFilePath)} (${plural(config.budgets?.size ?? 0, 'rule')})`,
    );
  }

  const line1 = segments.length > 0 ? `Thresholds: ${segments.join(' · ')}` : undefined;
  const nextSegment = meta.nextVersion
    ? `Next ${escapeCell(meta.nextVersion)}${meta.bundler ? ` (${escapeCell(meta.bundler)})` : ''}`
    : undefined;
  const line2 = [nextSegment, `nextjs-bundle-analysis-action ${escapeCell(meta.actionVersion)}`]
    .filter((s): s is string => s !== undefined)
    .join(' · ');

  return `<sub>${[line1, line2].filter((s): s is string => s !== undefined).join('<br>\n')}</sub>`;
}

function renderFindingsTable(findings: Finding[]): string {
  const icon: Record<FindingLevel, string> = { fail: '❌', warn: '⚠️' };
  const rows = findings.map(
    (f) =>
      `| ${icon[f.level]} | ${routeCell(f.route)} | ${escapeCell(f.check)} | ${escapeCell(f.value)} | ${escapeCell(f.limit)} |`,
  );
  return [
    '#### Findings',
    '| | Route | Check | Value | Limit |',
    '| :-: | --- | --- | ---: | ---: |',
    ...rows,
  ].join('\n');
}

/**
 * Orders findings for display: failures before warnings, and within a
 * severity tier, grouped by the route's position in the "changed routes"
 * table (largest |Δ| first), with pseudo-routes (`_total_`, `_shared_ (…)`)
 * and any route outside that table (e.g. an added route) placed last.
 */
function sortFindingsForDisplay(findings: Finding[], routeOrder: readonly string[]): Finding[] {
  const rank = new Map(routeOrder.map((r, i) => [r, i]));
  const severityRank: Record<FindingLevel, number> = { fail: 0, warn: 1 };
  return findings
    .map((finding, originalIndex) => ({ finding, originalIndex }))
    .sort((a, b) => {
      const severityDiff = severityRank[a.finding.level] - severityRank[b.finding.level];
      if (severityDiff !== 0) return severityDiff;
      const rankDiff =
        (rank.get(a.finding.route) ?? Infinity) - (rank.get(b.finding.route) ?? Infinity);
      if (rankDiff !== 0) return rankDiff;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ finding }) => finding);
}

function budgetColumnEnabled(config: ThresholdConfig): boolean {
  if (config.warnRouteSize !== undefined) return true;
  for (const override of config.budgets?.values() ?? []) {
    if (override.warnRouteSize !== undefined) return true;
  }
  return false;
}

function renderBudgetCell(route: RouteRow, config: ThresholdConfig): string {
  const override = resolveRouteBudget(route.route, config.budgets);
  const warnBytes = override?.warnRouteSize ?? config.warnRouteSize;
  if (warnBytes === undefined) return '—';
  const pct = Math.round((route.after / warnBytes) * 100);
  return pct >= 100 ? `⚠️ ${pct}%` : `${pct}%`;
}

function renderAllRoutesDetails(comparison: Comparison, config: ThresholdConfig): string {
  const showBudget = budgetColumnEnabled(config);
  const headerCells = showBudget
    ? '| Route | First load | Own | Budget |'
    : '| Route | First load | Own |';
  const alignCells = showBudget ? '| --- | ---: | ---: | ---: |' : '| --- | ---: | ---: |';
  const routerLabel: Record<RouterName, string> = { app: 'App Router', pages: 'Pages Router' };
  const order: RouterName[] = ['app', 'pages'];

  const sections = order
    .map((router) => {
      const routes = comparison.routes
        .filter((r) => r.router === router)
        .sort((a, b) => a.route.localeCompare(b.route));
      if (routes.length === 0) return undefined;
      const shared = comparison.routers.find((r) => r.router === router)?.sharedAfter ?? 0;
      const rows = routes.map((route) => {
        const cells = [routeCell(route.route), formatBytes(route.after), formatBytes(route.own)];
        if (showBudget) cells.push(renderBudgetCell(route, config));
        return `| ${cells.join(' | ')} |`;
      });
      return [
        `**${routerLabel[router]}** (shared ${formatBytes(shared)})`,
        headerCells,
        alignCells,
        ...rows,
      ].join('\n');
    })
    .filter((s): s is string => s !== undefined);

  return `<details><summary>All routes (${comparison.routes.length})</summary>\n\n${sections.join('\n\n')}\n</details>`;
}

export function renderReport(
  comparison: Comparison,
  findings: Finding[],
  meta: ReportMeta,
): RenderResult {
  const full = buildBlocks(comparison, findings, meta, {
    includeAllRoutes: true,
    maxChangedRoutes: undefined,
  });
  if (joinBlocks(full).length <= MAX_MARKDOWN_LENGTH) {
    return { markdown: joinBlocks(full), truncated: false };
  }

  const withoutAllRoutes = buildBlocks(comparison, findings, meta, {
    includeAllRoutes: false,
    maxChangedRoutes: undefined,
  });
  if (joinBlocks(withoutAllRoutes).length <= MAX_MARKDOWN_LENGTH) {
    return {
      markdown: joinBlocks(appendTruncationNotice(withoutAllRoutes, meta)),
      truncated: true,
    };
  }

  const significantCount = comparison.routes.filter(
    (r) =>
      !r.added &&
      r.deltaBytes !== undefined &&
      Math.abs(r.deltaBytes) >= meta.significantChangeBytes,
  ).length;

  // Length is monotonically non-decreasing in `cap`, so binary search for the largest cap that fits.
  let low = 0;
  let high = Math.max(significantCount - 1, 0);
  let best: string[] | undefined;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildBlocks(comparison, findings, meta, {
      includeAllRoutes: false,
      maxChangedRoutes: mid,
    });
    if (joinBlocks(candidate).length <= MAX_MARKDOWN_LENGTH) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Even a fully-capped (0 changed routes shown) report doesn't fit; return it anyway rather than emit nothing.
  const fallback =
    best ??
    buildBlocks(comparison, findings, meta, { includeAllRoutes: false, maxChangedRoutes: 0 });
  return { markdown: joinBlocks(appendTruncationNotice(fallback, meta)), truncated: true };
}

function joinBlocks(blocks: string[]): string {
  return blocks.join('\n\n');
}

function appendTruncationNotice(blocks: string[], meta: ReportMeta): string[] {
  const link = meta.jobSummaryUrl
    ? ` See the [job summary](${meta.jobSummaryUrl}) for full details.`
    : ' See the job summary for full details.';
  return [...blocks, `<sub>Report truncated to fit the comment size limit.${link}</sub>`];
}

interface BuildOptions {
  includeAllRoutes: boolean;
  /** Caps the "Changed routes" table to the top-N rows by `|Δ|`; `undefined` means unlimited. */
  maxChangedRoutes: number | undefined;
}

function buildBlocks(
  comparison: Comparison,
  findings: Finding[],
  meta: ReportMeta,
  options: BuildOptions,
): string[] {
  const comparable = comparison.baselineStatus === 'found';
  const failureCount = findings.filter((f) => f.level === 'fail').length;
  const warningCount = findings.filter((f) => f.level === 'warn').length;

  const significant = comparable
    ? comparison.routes
        .filter(
          (r) =>
            !r.added &&
            r.deltaBytes !== undefined &&
            Math.abs(r.deltaBytes) >= meta.significantChangeBytes,
        )
        .sort((a, b) => Math.abs(b.deltaBytes ?? 0) - Math.abs(a.deltaBytes ?? 0))
    : [];

  const marker = `<!-- nextjs-bundle-analysis:${meta.slug} -->`;
  const title = `### ${statusIcon(findings, comparison.baselineStatus)} Bundle sizes · ${escapeCell(meta.name)}`;
  const blocks: string[] = [`${marker}\n${title}`];

  const totalLine = `**${formatBytes(comparison.totalAfter)}** total client JS (${meta.compression})`;
  if (comparable) {
    const lineA = `${totalLine} · **${formatSignedBytes(comparison.totalDeltaBytes ?? 0)} (${formatSignedPercent(comparison.totalDeltaPercent ?? 0)})** vs ${codeSpan(meta.baseShortSha ?? '')} on ${codeSpan(meta.baseBranch)}`;

    const addedRoutes = comparison.routes.filter((r) => r.added);
    const changedSegment =
      significant.length === 0 && addedRoutes.length === 0 && comparison.removed.length === 0
        ? `no route changed by ≥ ${formatConfiguredBytes(meta.significantChangeBytes)}`
        : `${significant.length} changed · ${addedRoutes.length} added · ${comparison.removed.length} removed`;
    const findingsPhrase = findingCountsPhrase(failureCount, warningCount);
    const lineB = `${comparison.routes.length} routes · ${changedSegment} · ${failureCount + warningCount > 0 ? `**${findingsPhrase}**` : findingsPhrase}`;
    blocks.push(`${lineA}\n${lineB}`);
  } else {
    const lineA = `${totalLine} · ${comparison.routes.length} routes · ${findingCountsPhrase(failureCount, warningCount)}`;
    const statusLine =
      comparison.baselineStatus === 'missing'
        ? `No baseline from ${codeSpan(meta.baseBranch)} yet. One is created on the next successful push to ${codeSpan(meta.baseBranch)}. Absolute budgets were still checked.`
        : `Baseline ${codeSpan(meta.baseShortSha ?? '')} was measured with ${comparison.incompatibility?.baseCompression} / collector v${comparison.incompatibility?.baseCollectorVersion} (now ${comparison.incompatibility?.headCompression} / collector v${comparison.incompatibility?.headCollectorVersion}), so deltas are skipped this run. Absolute budgets were still checked.`;
    blocks.push(`${lineA}\n${statusLine}`);
  }

  const visibleSignificant =
    options.maxChangedRoutes !== undefined
      ? significant.slice(0, options.maxChangedRoutes)
      : significant;

  if (findings.length > 0) {
    const visibleRouteSet =
      options.maxChangedRoutes !== undefined
        ? new Set(visibleSignificant.map((r) => r.route))
        : undefined;
    const findingsForTable = visibleRouteSet
      ? findings.filter((f) => f.route === '_total_' || visibleRouteSet.has(f.route))
      : findings;
    const ordered = sortFindingsForDisplay(
      findingsForTable,
      significant.map((r) => r.route),
    );
    const omittedFindings = findings.length - findingsForTable.length;
    blocks.push(renderFindingsTable(ordered));
    if (omittedFindings > 0)
      blocks.push(
        `<sub>${plural(omittedFindings, 'more finding')} omitted to fit the size limit.</sub>`,
      );
  }

  if (comparable) {
    const findingByRoute = new Map<string, FindingLevel>();
    for (const finding of findings) {
      const existing = findingByRoute.get(finding.route);
      if (!existing || (existing === 'warn' && finding.level === 'fail'))
        findingByRoute.set(finding.route, finding.level);
    }

    if (significant.length > 0) {
      const rows = visibleSignificant.map((route) => {
        const level = findingByRoute.get(route.route);
        const icon =
          level === 'fail'
            ? '❌'
            : level === 'warn'
              ? '⚠️'
              : (route.deltaBytes ?? 0) < 0
                ? '🟢'
                : '';
        return `| ${routeCell(route.route)} | ${escapeCell(route.router)} | ${formatBytes(route.before ?? 0)} | ${formatBytes(route.after)} | ${formatSignedBytes(route.deltaBytes ?? 0)} | ${formatSignedPercent(route.deltaPercent ?? 0)} | ${icon} |`;
      });
      const significantSharedRouters =
        options.maxChangedRoutes === undefined
          ? comparison.routers.filter(
              (r) =>
                r.sharedDeltaBytes !== undefined &&
                Math.abs(r.sharedDeltaBytes) >= meta.significantChangeBytes,
            )
          : [];
      const sharedRows = significantSharedRouters.map((r) => {
        const label = significantSharedRouters.length > 1 ? `_shared_ (${r.router})` : '_shared_';
        return `| ${routeCell(label)} | ${escapeCell(r.router)} | ${formatBytes(r.sharedBefore ?? 0)} | ${formatBytes(r.sharedAfter)} | ${formatSignedBytes(r.sharedDeltaBytes ?? 0)} | ${formatSignedPercent(r.sharedDeltaPercent ?? 0)} | |`;
      });
      const omittedCount = significant.length - visibleSignificant.length;
      const omittedNote =
        omittedCount > 0
          ? [
              `<sub>${plural(omittedCount, 'more changed route')} omitted to fit the size limit.</sub>`,
            ]
          : [];
      blocks.push(
        [
          '#### Changed routes',
          '| Route | Router | Before | After | Δ | Δ% | |',
          '| --- | --- | ---: | ---: | ---: | ---: | :-: |',
          ...rows,
          ...sharedRows,
          ...omittedNote,
        ].join('\n'),
      );
    }

    const addedLine = addedRoutesLine(comparison);
    const removedLine = removedRoutesLine(comparison);
    if (addedLine || removedLine)
      blocks.push([addedLine, removedLine].filter((s): s is string => s !== undefined).join('\n'));

    const hiddenCount = comparison.routes.filter(
      (r) =>
        !r.added &&
        r.deltaBytes !== undefined &&
        r.deltaBytes !== 0 &&
        Math.abs(r.deltaBytes) < meta.significantChangeBytes,
    ).length;
    if (hiddenCount > 0) {
      blocks.push(
        `<sub>${plural(hiddenCount, 'route')} changed by less than ${formatConfiguredBytes(meta.significantChangeBytes)} and are hidden.</sub>`,
      );
    }
  }

  if (options.includeAllRoutes) blocks.push(renderAllRoutesDetails(comparison, meta.thresholds));
  blocks.push(renderFooter(meta));

  return blocks;
}

function addedRoutesLine(comparison: Comparison): string | undefined {
  const added = comparison.routes.filter((r) => r.added);
  if (added.length === 0) return undefined;
  const items = added.map(
    (r) => `${routeCell(r.route)} (${escapeCell(r.router)}) ${formatBytes(r.after)}`,
  );
  return `**Added:** ${items.join(', ')}`;
}

function removedRoutesLine(comparison: Comparison): string | undefined {
  if (comparison.removed.length === 0) return undefined;
  const items = comparison.removed.map(
    (r) => `${routeCell(r.route)} (${escapeCell(r.router)}) was ${formatBytes(r.before)}`,
  );
  return `**Removed:** ${items.join(', ')}`;
}
