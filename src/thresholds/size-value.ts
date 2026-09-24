/**
 * Size and percent string parsing for threshold inputs (`warn-route-size`,
 * `fail-route-increase`, budgets-file overrides, etc). Sizes use decimal
 * (1000-based) kB, matching `next build`'s own printed unit convention
 * (see docs/manifests.md), not binary KiB.
 */

export type SizeOrPercent =
  { kind: 'bytes'; bytes: number } | { kind: 'percent'; fraction: number };

const BYTE_SIZE = /^(\d+(?:\.\d+)?)\s*(k?b)$/i;
const PERCENT = /^(\d+(?:\.\d+)?)\s*%$/;

export function parseByteSize(raw: string): number {
  const match = BYTE_SIZE.exec(raw.trim());
  if (!match)
    throw new Error(`Invalid size "${raw}". Expected a byte size like "512B" or "250kB".`);
  const [, value, unit] = match;
  const multiplier = unit!.toLowerCase() === 'kb' ? 1000 : 1;
  return Math.round(Number(value) * multiplier);
}

export function parsePercent(raw: string): number {
  const match = PERCENT.exec(raw.trim());
  if (!match) throw new Error(`Invalid percent "${raw}". Expected a percent like "10%".`);
  return Number(match[1]) / 100;
}

/** Dispatches on a trailing `%` to parse either a byte size or a percent. */
export function parseSizeOrPercent(raw: string): SizeOrPercent {
  const trimmed = raw.trim();
  if (trimmed.endsWith('%')) return { kind: 'percent', fraction: parsePercent(trimmed) };
  return { kind: 'bytes', bytes: parseByteSize(trimmed) };
}
