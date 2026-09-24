import { parseByteSize, parseSizeOrPercent } from './size-value.js';
import type { RouteBudgetOverride } from './types.js';

const BUDGET_KEYS = [
  'warn-route-size',
  'fail-route-size',
  'warn-route-increase',
  'fail-route-increase',
] as const;
type BudgetKey = (typeof BUDGET_KEYS)[number];

function isBudgetKey(key: string): key is BudgetKey {
  return (BUDGET_KEYS as readonly string[]).includes(key);
}

/**
 * Parses a `budgets-file` JSON document: `{ "routes": { "<glob>": { "<key>":
 * "<size-or-percent>", ... } } }`. Only the four per-route threshold keys
 * are supported here; `warn/fail-total-increase` and `warn/fail-shared-size`
 * aren't per-route concepts, so they can't be overridden this way.
 */
export function parseBudgetsFile(
  raw: string,
  sourcePath: string,
): Map<string, RouteBudgetOverride> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Invalid budgets file "${sourcePath}": not valid JSON.`, {
      cause: cause as Error,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid budgets file "${sourcePath}": expected a top-level JSON object.`);
  }
  const routes = (parsed as { routes?: unknown }).routes;
  if (typeof routes !== 'object' || routes === null || Array.isArray(routes)) {
    throw new Error(`Invalid budgets file "${sourcePath}": expected a "routes" object.`);
  }

  const result = new Map<string, RouteBudgetOverride>();
  for (const [glob, rawOverride] of Object.entries(routes)) {
    if (typeof rawOverride !== 'object' || rawOverride === null || Array.isArray(rawOverride)) {
      throw new Error(
        `Invalid budgets file "${sourcePath}": override for "${glob}" must be an object.`,
      );
    }
    const override: RouteBudgetOverride = {};
    for (const [key, value] of Object.entries(rawOverride as Record<string, unknown>)) {
      if (!isBudgetKey(key)) {
        throw new Error(
          `Invalid budgets file "${sourcePath}": unknown override key "${key}" for "${glob}".`,
        );
      }
      if (typeof value !== 'string') {
        throw new Error(`Invalid budgets file "${sourcePath}": "${glob}".${key} must be a string.`);
      }
      switch (key) {
        case 'warn-route-size':
          override.warnRouteSize = parseByteSize(value);
          break;
        case 'fail-route-size':
          override.failRouteSize = parseByteSize(value);
          break;
        case 'warn-route-increase':
          override.warnRouteIncrease = parseSizeOrPercent(value);
          break;
        case 'fail-route-increase':
          override.failRouteIncrease = parseSizeOrPercent(value);
          break;
      }
    }
    result.set(glob, override);
  }
  return result;
}

/** Translates a budgets-file glob (`**`, `*`, literals) to an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      pattern += '.*';
      i++;
    } else if (glob[i] === '*') {
      pattern += '[^/]*';
    } else {
      pattern += glob[i]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * Specificity score used to pick the winning glob when several match:
 * `**` is penalized far more than a single `*`, and literal length breaks
 * remaining ties. Comparisons use strict `>` so the first-declared entry
 * (iteration order of `budgets`) wins an exact score tie.
 */
function specificity(glob: string): number {
  const doubleStarCount = (glob.match(/\*\*/g) ?? []).length;
  const withoutDoubleStars = glob.replace(/\*\*/g, '');
  const singleStarCount = (withoutDoubleStars.match(/\*/g) ?? []).length;
  const literalLength = withoutDoubleStars.replace(/\*/g, '').length;
  return literalLength - singleStarCount * 1000 - doubleStarCount * 1_000_000;
}

export function resolveRouteBudget(
  route: string,
  budgets: Map<string, RouteBudgetOverride> | undefined,
): RouteBudgetOverride | undefined {
  if (!budgets) return undefined;
  let best: { score: number; override: RouteBudgetOverride } | undefined;
  for (const [glob, override] of budgets) {
    if (!globToRegExp(glob).test(route)) continue;
    const score = specificity(glob);
    if (!best || score > best.score) {
      best = { score, override };
    }
  }
  return best?.override;
}
