import type { SizeOrPercent } from './size-value.js';

export type FindingLevel = 'warn' | 'fail';

export type ThresholdCheck = 'Route size' | 'Route increase' | 'Total increase' | 'Shared size';

/**
 * A single threshold breach, pre-formatted for the report's Findings table
 * (`value`/`limit` match plan.md's rendered examples exactly) and carrying a
 * full-sentence `message` for workflow annotations.
 */
export interface Finding {
  level: FindingLevel;
  route: string;
  check: ThresholdCheck;
  value: string;
  limit: string;
  message: string;
}

/** Per-route override parsed from a `budgets-file` glob entry. */
export interface RouteBudgetOverride {
  warnRouteSize?: number;
  failRouteSize?: number;
  warnRouteIncrease?: SizeOrPercent;
  failRouteIncrease?: SizeOrPercent;
}

export interface ThresholdConfig {
  warnRouteSize?: number;
  failRouteSize?: number;
  warnRouteIncrease?: SizeOrPercent;
  failRouteIncrease?: SizeOrPercent;
  warnTotalIncrease?: SizeOrPercent;
  failTotalIncrease?: SizeOrPercent;
  warnSharedSize?: number;
  failSharedSize?: number;
  /** Glob (insertion order preserved) -> override, from a parsed budgets-file. */
  budgets?: Map<string, RouteBudgetOverride>;
}

/** One route's evaluation input. `base` is `undefined` for an added route. */
export interface RouteThresholdInput {
  route: string;
  router: string;
  head: number;
  base: number | undefined;
}

export interface ThresholdEvaluationInput {
  routes: RouteThresholdInput[];
  totalHead: number;
  totalBase: number | undefined;
  /** Router name -> that router's shared-chunk bytes in the head build. */
  sharedHead: Record<string, number>;
  /**
   * `false` when there's no baseline, or its fingerprint is incompatible.
   * Delta-based checks (route/total increase) are skipped either way;
   * absolute budgets (route/shared size) are still evaluated.
   */
  baselineComparable: boolean;
}
