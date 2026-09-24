// eslint-disable-next-line no-control-regex -- intentionally strips ASCII control characters from repo-derived text
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Strips control characters and HTML-entity-encodes `<`/`>`, so a
 * repo-derived string (a route, branch name, error message, ...) can never
 * contain a literal `<!--`/`-->`. This can't be reconstructed by
 * concatenation the way stripping those substrings could (e.g. the input
 * `<!<!---- nextjs-bundle-analysis:web ---->>` would survive a naive
 * strip-and-rescan as a valid spoofed marker); encoding is a one-way,
 * single-pass transform with no such reassembly.
 */
function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, '').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Escapes a plain (non-code) string for use inside a Markdown table cell. */
export function escapeCell(text: string): string {
  return sanitize(text).replaceAll('|', '\\|');
}

/**
 * Wraps text in an inline code span, choosing a backtick-fence long enough
 * that any backticks already in the text can't prematurely close it (the
 * standard CommonMark technique: use one more backtick than the longest run
 * present, and pad with a space if the text starts/ends with a backtick).
 * The text is sanitized and pipe-escaped first since it still renders
 * inside a table cell.
 */
export function codeSpan(text: string): string {
  const safe = escapeCell(text);
  const longestRun = Math.max(0, ...[...safe.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longestRun + 1);
  const needsPadding = safe.startsWith('`') || safe.endsWith('`') || safe.length === 0;
  return needsPadding ? `${fence} ${safe} ${fence}` : `${fence}${safe}${fence}`;
}
