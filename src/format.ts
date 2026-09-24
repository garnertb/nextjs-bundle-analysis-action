/**
 * Byte/percent display formatting shared by `src/thresholds` and
 * `src/report`, matching the report examples in plan.md: unsigned values use
 * a plain sign-less form, deltas use `+`/`−` (U+2212 MINUS SIGN, not a
 * hyphen), and sizes below 1000 B are shown as whole bytes rather than kB.
 */

const MINUS_SIGN = '\u2212';

export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1000) return `${bytes} B`;
  return `${(bytes / 1000).toFixed(1)} kB`;
}

export function formatSignedBytes(deltaBytes: number): string {
  const sign = deltaBytes < 0 ? MINUS_SIGN : '+';
  return `${sign}${formatBytes(Math.abs(deltaBytes))}`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatSignedPercent(fraction: number): string {
  const sign = fraction < 0 ? MINUS_SIGN : '+';
  return `${sign}${formatPercent(Math.abs(fraction))}`;
}

/**
 * Trims a number to at most 4 decimal places and drops trailing zeros
 * (`20.0000` -> `20`, `12.5000` -> `12.5`), avoiding both floating-point
 * noise and forced decimals.
 */
function trimmed(value: number): string {
  return String(parseFloat(value.toFixed(4)));
}

/**
 * Formats a *configured* threshold's byte value for display (e.g. in a
 * finding's `limit` column or the footer), echoing back the precision the
 * user typed (`"250kB"` -> `250 kB`) rather than {@link formatBytes}'s
 * always-one-decimal measured-value convention (`"312.8 kB"`).
 */
export function formatConfiguredBytes(bytes: number): string {
  if (Math.abs(bytes) < 1000) return `${bytes} B`;
  return `${trimmed(bytes / 1000)} kB`;
}

/** Same idea as {@link formatConfiguredBytes}, for a configured percent (`"5%"`, not `"5.0%"`). */
export function formatConfiguredPercent(fraction: number): string {
  return `${trimmed(fraction * 100)}%`;
}
