import {
  formatBytes,
  formatConfiguredBytes,
  formatConfiguredPercent,
  formatSignedBytes,
  formatSignedPercent,
} from '../format.js';
import { resolveRouteBudget } from './budgets-file.js';
import type {
  Finding,
  FindingLevel,
  RouteThresholdInput,
  ThresholdConfig,
  ThresholdEvaluationInput,
} from './types.js';
import type { SizeOrPercent } from './size-value.js';

const SEVERITY: Record<FindingLevel, number> = { warn: 0, fail: 1 };

function worseLevel(a: FindingLevel, b: FindingLevel): FindingLevel {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/** Absolute-size budget check (route size, shared size): sign-less value/limit. */
function evaluateAbsolute(
  actualBytes: number,
  warnBytes: number | undefined,
  failBytes: number | undefined,
): { level: FindingLevel; limitBytes: number } | undefined {
  if (failBytes !== undefined && actualBytes > failBytes)
    return { level: 'fail', limitBytes: failBytes };
  if (warnBytes !== undefined && actualBytes > warnBytes)
    return { level: 'warn', limitBytes: warnBytes };
  return undefined;
}

/**
 * Delta check (route/total increase): each of warn/fail can be configured in
 * bytes or percent independently. Priority when several breach at once:
 * fail-bytes, then fail-percent, then warn-bytes, then warn-percent, so
 * "more severe wins" and ties prefer the byte-based reading.
 */
function evaluateDelta(
  deltaBytes: number,
  percent: number | undefined,
  warn: SizeOrPercent | undefined,
  fail: SizeOrPercent | undefined,
): { level: FindingLevel; valueText: string; limitDisplay: string } | undefined {
  const candidates: [FindingLevel, SizeOrPercent | undefined][] = [
    ['fail', fail],
    ['warn', warn],
  ];
  for (const [level, threshold] of candidates) {
    if (!threshold) continue;
    if (threshold.kind === 'bytes' && deltaBytes > threshold.bytes) {
      return {
        level,
        valueText: formatSignedBytes(deltaBytes),
        limitDisplay: formatConfiguredBytes(threshold.bytes),
      };
    }
    if (threshold.kind === 'percent' && percent !== undefined && percent > threshold.fraction) {
      return {
        level,
        valueText: formatSignedPercent(percent),
        limitDisplay: formatConfiguredPercent(threshold.fraction),
      };
    }
  }
  return undefined;
}

function evaluateRouteSize(
  route: RouteThresholdInput,
  config: ThresholdConfig,
): Finding | undefined {
  const override = resolveRouteBudget(route.route, config.budgets);
  const warnBytes = override?.warnRouteSize ?? config.warnRouteSize;
  const failBytes = override?.failRouteSize ?? config.failRouteSize;
  const breach = evaluateAbsolute(route.head, warnBytes, failBytes);
  if (!breach) return undefined;
  return {
    level: breach.level,
    route: route.route,
    check: 'Route size',
    value: formatBytes(route.head),
    limit: `${breach.level} > ${formatConfiguredBytes(breach.limitBytes)}`,
    message: `Route "${route.route}" first load is ${formatBytes(route.head)}, exceeding the ${breach.level} budget of ${formatConfiguredBytes(breach.limitBytes)}.`,
  };
}

function evaluateRouteIncrease(
  route: RouteThresholdInput,
  config: ThresholdConfig,
  baselineComparable: boolean,
): Finding | undefined {
  if (!baselineComparable || route.base === undefined) return undefined;
  const override = resolveRouteBudget(route.route, config.budgets);
  const warn = override?.warnRouteIncrease ?? config.warnRouteIncrease;
  const fail = override?.failRouteIncrease ?? config.failRouteIncrease;
  const deltaBytes = route.head - route.base;
  const percent = route.base === 0 ? undefined : deltaBytes / route.base;
  const breach = evaluateDelta(deltaBytes, percent, warn, fail);
  if (!breach) return undefined;
  return {
    level: breach.level,
    route: route.route,
    check: 'Route increase',
    value: breach.valueText,
    limit: `${breach.level} > ${breach.limitDisplay}`,
    message: `Route "${route.route}" increased by ${breach.valueText}, exceeding the ${breach.level} threshold of ${breach.limitDisplay}.`,
  };
}

function evaluateTotalIncrease(
  input: ThresholdEvaluationInput,
  config: ThresholdConfig,
): Finding | undefined {
  if (!input.baselineComparable || input.totalBase === undefined) return undefined;
  const deltaBytes = input.totalHead - input.totalBase;
  const percent = input.totalBase === 0 ? undefined : deltaBytes / input.totalBase;
  const breach = evaluateDelta(
    deltaBytes,
    percent,
    config.warnTotalIncrease,
    config.failTotalIncrease,
  );
  if (!breach) return undefined;
  return {
    level: breach.level,
    route: '_total_',
    check: 'Total increase',
    value: breach.valueText,
    limit: `${breach.level} > ${breach.limitDisplay}`,
    message: `Total client JS increased by ${breach.valueText}, exceeding the ${breach.level} threshold of ${breach.limitDisplay}.`,
  };
}

function evaluateSharedSize(
  router: string,
  sharedBytes: number,
  config: ThresholdConfig,
): Finding | undefined {
  const breach = evaluateAbsolute(sharedBytes, config.warnSharedSize, config.failSharedSize);
  if (!breach) return undefined;
  const route = `_shared_ (${router})`;
  return {
    level: breach.level,
    route,
    check: 'Shared size',
    value: formatBytes(sharedBytes),
    limit: `${breach.level} > ${formatConfiguredBytes(breach.limitBytes)}`,
    message: `"${router}" shared chunks are ${formatBytes(sharedBytes)}, exceeding the ${breach.level} budget of ${formatConfiguredBytes(breach.limitBytes)}.`,
  };
}

/**
 * Evaluates all configured thresholds, returning one finding per
 * route-per-check at most (the more severe of warn/fail wins; this can't
 * actually collide since {@link evaluateAbsolute}/{@link evaluateDelta}
 * already return only the single worst breach for their check).
 */
export function evaluateThresholds(
  input: ThresholdEvaluationInput,
  config: ThresholdConfig,
): Finding[] {
  const findings: Finding[] = [];

  for (const route of input.routes) {
    const sizeFinding = evaluateRouteSize(route, config);
    if (sizeFinding) findings.push(sizeFinding);
    const increaseFinding = evaluateRouteIncrease(route, config, input.baselineComparable);
    if (increaseFinding) findings.push(increaseFinding);
  }

  const totalFinding = evaluateTotalIncrease(input, config);
  if (totalFinding) findings.push(totalFinding);

  for (const [router, sharedBytes] of Object.entries(input.sharedHead)) {
    const sharedFinding = evaluateSharedSize(router, sharedBytes, config);
    if (sharedFinding) findings.push(sharedFinding);
  }

  findings.sort((a, b) => {
    if (a.route !== b.route) return a.route.localeCompare(b.route);
    return a.check.localeCompare(b.check);
  });

  // Dedup defensively: keep the worse of any (route, check) duplicates.
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.route}\u0000${finding.check}`;
    const existing = byKey.get(key);
    if (!existing || worseLevel(existing.level, finding.level) === finding.level) {
      byKey.set(key, finding);
    }
  }
  return Array.from(byKey.values());
}
