import type { BundleReport, RouterName } from '../collectors/types.js';
import type { RouteThresholdInput, ThresholdEvaluationInput } from '../thresholds/types.js';

export type BaselineStatus = 'found' | 'missing' | 'incompatible';

export interface IncompatibilityInfo {
  baseCompression: string;
  baseCollectorVersion: string;
  headCompression: string;
  headCollectorVersion: string;
}

export interface RouteRow {
  route: string;
  router: RouterName;
  /** Baseline first-load bytes; `undefined` when added, or the baseline isn't comparable. */
  before: number | undefined;
  after: number;
  own: number;
  /** `undefined` when added, or the baseline isn't comparable. */
  deltaBytes: number | undefined;
  /** `undefined` when added, the baseline isn't comparable, or `before` is 0. */
  deltaPercent: number | undefined;
  /** `true` only when the baseline is comparable and this route wasn't in it. */
  added: boolean;
}

export interface RemovedRow {
  route: string;
  router: RouterName;
  before: number;
}

export interface RouterRow {
  router: RouterName;
  sharedBefore: number | undefined;
  sharedAfter: number;
  sharedDeltaBytes: number | undefined;
  sharedDeltaPercent: number | undefined;
}

export interface Comparison {
  baselineStatus: BaselineStatus;
  incompatibility: IncompatibilityInfo | undefined;
  totalAfter: number;
  totalBefore: number | undefined;
  totalDeltaBytes: number | undefined;
  totalDeltaPercent: number | undefined;
  routes: RouteRow[];
  removed: RemovedRow[];
  routers: RouterRow[];
}

function routeKey(router: string, route: string): string {
  return `${router}:${route}`;
}

function percentDelta(before: number, deltaBytes: number): number | undefined {
  return before === 0 ? undefined : deltaBytes / before;
}

export function compareBundleReports(
  head: BundleReport,
  base: BundleReport | undefined,
): Comparison {
  const baselineStatus: BaselineStatus =
    base === undefined
      ? 'missing'
      : base.fingerprint.schemaVersion === head.fingerprint.schemaVersion &&
          base.fingerprint.collectorVersion === head.fingerprint.collectorVersion &&
          base.fingerprint.compression === head.fingerprint.compression
        ? 'found'
        : 'incompatible';
  const comparable = baselineStatus === 'found';

  const incompatibility: IncompatibilityInfo | undefined =
    baselineStatus === 'incompatible' && base
      ? {
          baseCompression: base.fingerprint.compression,
          baseCollectorVersion: base.fingerprint.collectorVersion,
          headCompression: head.fingerprint.compression,
          headCollectorVersion: head.fingerprint.collectorVersion,
        }
      : undefined;

  const baseByKey = new Map(
    (base?.routes ?? []).map((route) => [routeKey(route.router, route.route), route]),
  );
  const headKeys = new Set(head.routes.map((route) => routeKey(route.router, route.route)));

  const routes: RouteRow[] = head.routes.map((route) => {
    const key = routeKey(route.router, route.route);
    const matched = comparable ? baseByKey.get(key) : undefined;
    const before = matched?.firstLoad;
    const deltaBytes = before === undefined ? undefined : route.firstLoad - before;
    const deltaPercent =
      before === undefined || deltaBytes === undefined
        ? undefined
        : percentDelta(before, deltaBytes);
    return {
      route: route.route,
      router: route.router,
      before,
      after: route.firstLoad,
      own: route.own,
      deltaBytes,
      deltaPercent,
      added: comparable && matched === undefined,
    };
  });

  const removed: RemovedRow[] = comparable
    ? (base?.routes ?? [])
        .filter((route) => !headKeys.has(routeKey(route.router, route.route)))
        .map((route) => ({ route: route.route, router: route.router, before: route.firstLoad }))
    : [];

  const routerNames = new Set<RouterName>([
    ...(Object.keys(head.routers) as RouterName[]),
    ...(comparable ? (Object.keys(base?.routers ?? {}) as RouterName[]) : []),
  ]);
  const routers: RouterRow[] = Array.from(routerNames).map((router) => {
    const sharedAfter = head.routers[router]?.shared ?? 0;
    const sharedBefore = comparable ? base?.routers[router]?.shared : undefined;
    const sharedDeltaBytes = sharedBefore === undefined ? undefined : sharedAfter - sharedBefore;
    const sharedDeltaPercent =
      sharedBefore === undefined || sharedDeltaBytes === undefined
        ? undefined
        : percentDelta(sharedBefore, sharedDeltaBytes);
    return { router, sharedBefore, sharedAfter, sharedDeltaBytes, sharedDeltaPercent };
  });

  const totalBefore = comparable ? base?.total : undefined;
  const totalDeltaBytes = totalBefore === undefined ? undefined : head.total - totalBefore;
  const totalDeltaPercent =
    totalBefore === undefined || totalDeltaBytes === undefined
      ? undefined
      : percentDelta(totalBefore, totalDeltaBytes);

  return {
    baselineStatus,
    incompatibility,
    totalAfter: head.total,
    totalBefore,
    totalDeltaBytes,
    totalDeltaPercent,
    routes,
    removed,
    routers,
  };
}

/** Translates a {@link Comparison} into the shape {@link evaluateThresholds} expects. */
export function toThresholdInput(comparison: Comparison): ThresholdEvaluationInput {
  const routes: RouteThresholdInput[] = comparison.routes.map((route) => ({
    route: route.route,
    router: route.router,
    head: route.after,
    base: route.added ? undefined : route.before,
  }));
  const sharedHead: Record<string, number> = {};
  for (const router of comparison.routers) {
    sharedHead[router.router] = router.sharedAfter;
  }
  return {
    routes,
    totalHead: comparison.totalAfter,
    totalBase: comparison.totalBefore,
    sharedHead,
    baselineComparable: comparison.baselineStatus === 'found',
  };
}
