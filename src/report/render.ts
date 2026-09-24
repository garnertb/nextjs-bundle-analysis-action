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
  /** Repository URL (no trailing slash), used to link the baseline SHA as `<repoUrl>/commit/<sha>`. */
  repoUrl: string | undefined;
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

/** The baseline short SHA as a code span, linked to its commit when a repo URL is available. */
function baseShaSegment(meta: ReportMeta): string {
  const sha = meta.baseShortSha;
  const code = codeSpan(sha ?? '');
  if (!sha || !meta.repoUrl) return code;
  const base = escapeCell(meta.repoUrl).replace(/\/+$/, '');
  return `[${code}](${base}/commit/${encodeURIComponent(sha)})`;
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

function renderBudgetCell(
  route: RouteRow,
  config: ThresholdConfig,
  hasRouteSizeFinding: boolean,
): string {
  const override = resolveRouteBudget(route.route, config.budgets);
  const warnBytes = override?.warnRouteSize ?? config.warnRouteSize;
  if (warnBytes === undefined) return '—';
  // Floor (not round) so a route just under budget never displays as "100%": the finding
  // itself, not a recomputed/rounded percentage, is the source of truth for the icon.
  const pct = Math.floor((route.after / warnBytes) * 100);
  return hasRouteSizeFinding ? `⚠️ ${pct}%` : `${pct}%`;
}

function renderAllRoutesDetails(
  comparison: Comparison,
  config: ThresholdConfig,
  findings: Finding[],
): string {
  const routesWithSizeFinding = new Set(
    findings.filter((f) => f.check === 'Route size').map((f) => f.route),
  );
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
        if (showBudget)
          cells.push(renderBudgetCell(route, config, routesWithSizeFinding.has(route.route)));
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
  const fullOptions: BuildOptions = {
    includeAllRoutes: true,
    maxChangedRoutes: undefined,
    maxAddedRoutes: undefined,
    maxRemovedRoutes: undefined,
    maxFindings: undefined,
  };
  const full = buildBlocks(comparison, findings, meta, fullOptions);
  if (fits(full)) return { markdown: render(full), truncated: false };

  const withoutAllRoutes = appendTruncationNotice(
    buildBlocks(comparison, findings, meta, { ...fullOptions, includeAllRoutes: false }),
    meta,
  );
  if (fits(withoutAllRoutes)) {
    return { markdown: render(withoutAllRoutes), truncated: true };
  }

  const routeIncreaseFindingRoutes = computeRouteIncreaseFindingRoutes(findings);
  const significantCount = computeSignificantRoutes(
    comparison,
    routeIncreaseFindingRoutes,
    meta,
  ).length;
  const addedCount = comparison.routes.filter((r) => r.added).length;
  const removedCount = comparison.removed.length;

  // Truncation proceeds in stages, each holding the later stages' dimensions uncapped: drop the
  // "All routes" table, then cap "Changed routes" (top-N by |Δ|), then cap Added/Removed, and
  // only as an absolute last resort cap Findings (failures first, then warnings) — findings are
  // never dropped merely because their route fell outside a capped table (see PR #4 review). Each
  // candidate is finalized (truncation notice appended) before its size is checked, so the notice
  // itself is always accounted for in the budget.
  const stage1 = capSearch(
    (cap) =>
      appendTruncationNotice(
        buildBlocks(comparison, findings, meta, {
          includeAllRoutes: false,
          maxChangedRoutes: cap,
          maxAddedRoutes: undefined,
          maxRemovedRoutes: undefined,
          maxFindings: undefined,
        }),
        meta,
      ),
    significantCount,
  );
  if (stage1.fits) return { markdown: render(stage1.blocks), truncated: true };

  const stage2 = capSearch(
    (cap) =>
      appendTruncationNotice(
        buildBlocks(comparison, findings, meta, {
          includeAllRoutes: false,
          maxChangedRoutes: 0,
          maxAddedRoutes: cap,
          maxRemovedRoutes: cap,
          maxFindings: undefined,
        }),
        meta,
      ),
    Math.max(addedCount, removedCount),
  );
  if (stage2.fits) return { markdown: render(stage2.blocks), truncated: true };

  const stage3 = capSearch(
    (cap) =>
      appendTruncationNotice(
        buildBlocks(comparison, findings, meta, {
          includeAllRoutes: false,
          maxChangedRoutes: 0,
          maxAddedRoutes: 0,
          maxRemovedRoutes: 0,
          maxFindings: cap,
        }),
        meta,
      ),
    findings.length,
  );
  // Even a fully-capped report (nothing shown in any table) doesn't fit; return it anyway rather
  // than emit nothing. This can only happen with pathologically long single field values (e.g. an
  // enormous route/branch name), which no amount of row-capping can fix.
  return { markdown: render(stage3.blocks), truncated: true };
}

function fits(blocks: string[]): boolean {
  return render(blocks).length <= MAX_MARKDOWN_LENGTH;
}

/** Joins blocks into the final markdown, always ending in a trailing newline. */
function render(blocks: string[]): string {
  const joined = blocks.join('\n\n');
  return joined.endsWith('\n') ? joined : `${joined}\n`;
}

/**
 * Binary searches for the largest `cap` in `[0, upperExclusive)` for which `build(cap)` fits the
 * size budget; length is monotonically non-decreasing in `cap`. Returns the best (possibly
 * non-fitting, at cap 0) result found so the caller can fall through to a further capping stage.
 */
function capSearch(
  build: (cap: number) => string[],
  upperExclusive: number,
): { blocks: string[]; fits: boolean } {
  let low = 0;
  let high = Math.max(upperExclusive - 1, 0);
  let best: string[] | undefined;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = build(mid);
    if (fits(candidate)) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best ? { blocks: best, fits: true } : { blocks: build(0), fits: false };
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
  /** Caps the Added list to the top-N by size; `undefined` means unlimited. */
  maxAddedRoutes: number | undefined;
  /** Caps the Removed list to the top-N by size; `undefined` means unlimited. */
  maxRemovedRoutes: number | undefined;
  /** Caps the Findings table to the top-N (failures first, then warnings); `undefined` means unlimited. */
  maxFindings: number | undefined;
}

/** The worst finding level per route, used both to widen "significant" and to icon the Changed routes table. */
function computeFindingLevelByRoute(findings: Finding[]): Map<string, FindingLevel> {
  const byRoute = new Map<string, FindingLevel>();
  for (const finding of findings) {
    const existing = byRoute.get(finding.route);
    if (!existing || (existing === 'warn' && finding.level === 'fail'))
      byRoute.set(finding.route, finding.level);
  }
  return byRoute;
}

/**
 * Routes carrying a "Route increase" finding — a delta-based check, unlike
 * "Route size" which is an absolute-size check that can fire on an unchanged
 * route. Used to widen "significant" without pulling in unchanged routes
 * that merely breach an absolute budget (those still show in Findings and
 * All routes, just not as a `+0 B` row in Changed routes).
 */
function computeRouteIncreaseFindingRoutes(findings: Finding[]): Set<string> {
  return new Set(findings.filter((f) => f.check === 'Route increase').map((f) => f.route));
}

/**
 * Routes shown in the "Changed routes" table: those whose |Δ| clears
 * `significantChangeBytes`, plus any route carrying a Route increase finding
 * regardless of its delta size (see PR #4 review item 3). An unchanged route
 * that only breaches an absolute Route size budget is not "changed" — it
 * still surfaces via Findings and All routes.
 */
function computeSignificantRoutes(
  comparison: Comparison,
  routeIncreaseFindingRoutes: Set<string>,
  meta: ReportMeta,
): RouteRow[] {
  if (comparison.baselineStatus !== 'found') return [];
  return comparison.routes
    .filter(
      (r) =>
        !r.added &&
        r.deltaBytes !== undefined &&
        (Math.abs(r.deltaBytes) >= meta.significantChangeBytes ||
          routeIncreaseFindingRoutes.has(r.route)),
    )
    .sort((a, b) => Math.abs(b.deltaBytes ?? 0) - Math.abs(a.deltaBytes ?? 0));
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
  const findingLevelByRoute = computeFindingLevelByRoute(findings);
  const routeIncreaseFindingRoutes = computeRouteIncreaseFindingRoutes(findings);
  const significant = computeSignificantRoutes(comparison, routeIncreaseFindingRoutes, meta);

  const marker = `<!-- nextjs-bundle-analysis:${meta.slug} -->`;
  const title = `### ${statusIcon(findings, comparison.baselineStatus)} Bundle sizes · ${escapeCell(meta.name)}`;
  const blocks: string[] = [`${marker}\n${title}`];

  const totalLine = `**${formatBytes(comparison.totalAfter)}** total client JS (${meta.compression})`;
  if (comparable) {
    const lineA = `${totalLine} · **${formatSignedBytes(comparison.totalDeltaBytes ?? 0)} (${formatSignedPercent(comparison.totalDeltaPercent ?? 0)})** vs ${baseShaSegment(meta)} on ${codeSpan(meta.baseBranch)}`;

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
        : `Baseline ${baseShaSegment(meta)} was measured with ${comparison.incompatibility?.baseCompression} / collector v${comparison.incompatibility?.baseCollectorVersion} (now ${comparison.incompatibility?.headCompression} / collector v${comparison.incompatibility?.headCollectorVersion}), so deltas are skipped this run. Absolute budgets were still checked.`;
    blocks.push(`${lineA}\n${statusLine}`);
  }

  const visibleSignificant =
    options.maxChangedRoutes !== undefined
      ? significant.slice(0, Math.max(options.maxChangedRoutes, 0))
      : significant;

  if (findings.length > 0) {
    const ordered = sortFindingsForDisplay(
      findings,
      significant.map((r) => r.route),
    );
    const visibleFindings =
      options.maxFindings !== undefined
        ? ordered.slice(0, Math.max(options.maxFindings, 0))
        : ordered;
    const omittedFindings = ordered.length - visibleFindings.length;
    if (visibleFindings.length > 0) blocks.push(renderFindingsTable(visibleFindings));
    else blocks.push('#### Findings');
    if (omittedFindings > 0)
      blocks.push(
        `<sub>${plural(omittedFindings, 'more finding')} omitted to fit the size limit.</sub>`,
      );
  }

  if (comparable) {
    if (significant.length > 0) {
      const rows = visibleSignificant.map((route) => {
        const level = findingLevelByRoute.get(route.route);
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

    const addedLine = addedRoutesLine(comparison, options.maxAddedRoutes);
    const removedLine = removedRoutesLine(comparison, options.maxRemovedRoutes);
    if (addedLine || removedLine)
      blocks.push([addedLine, removedLine].filter((s): s is string => s !== undefined).join('\n'));

    const hiddenCount = comparison.routes.filter(
      (r) =>
        !r.added &&
        r.deltaBytes !== undefined &&
        r.deltaBytes !== 0 &&
        Math.abs(r.deltaBytes) < meta.significantChangeBytes &&
        !routeIncreaseFindingRoutes.has(r.route),
    ).length;
    if (hiddenCount > 0) {
      blocks.push(
        `<sub>${plural(hiddenCount, 'route')} changed by less than ${formatConfiguredBytes(meta.significantChangeBytes)} and are hidden.</sub>`,
      );
    }
  }

  if (options.includeAllRoutes)
    blocks.push(renderAllRoutesDetails(comparison, meta.thresholds, findings));
  blocks.push(renderFooter(meta));

  return blocks;
}

/** Renders an Added/Removed summary line, capped to the top-`cap` items by size, largest first. */
function renderCappedRoutesLine(
  label: string,
  rows: { text: string; bytes: number }[],
  cap: number | undefined,
): string | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) => b.bytes - a.bytes);
  const visible = cap !== undefined ? sorted.slice(0, Math.max(cap, 0)) : sorted;
  if (visible.length === 0) {
    return `**${label}:** ${plural(rows.length, 'route')} omitted to fit the size limit.`;
  }
  const omitted = rows.length - visible.length;
  const suffix = omitted > 0 ? `, and ${omitted} more` : '';
  return `**${label}:** ${visible.map((r) => r.text).join(', ')}${suffix}`;
}

function addedRoutesLine(comparison: Comparison, cap: number | undefined): string | undefined {
  const rows = comparison.routes
    .filter((r) => r.added)
    .map((r) => ({
      text: `${routeCell(r.route)} (${escapeCell(r.router)}) ${formatBytes(r.after)}`,
      bytes: r.after,
    }));
  return renderCappedRoutesLine('Added', rows, cap);
}

function removedRoutesLine(comparison: Comparison, cap: number | undefined): string | undefined {
  const rows = comparison.removed.map((r) => ({
    text: `${routeCell(r.route)} (${escapeCell(r.router)}) was ${formatBytes(r.before)}`,
    bytes: r.before,
  }));
  return renderCappedRoutesLine('Removed', rows, cap);
}
