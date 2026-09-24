/**
 * Environment variable names removed unconditionally before running
 * `build-command`, beyond the `INPUT_*` prefix. These carry credentials or
 * tokens the build shouldn't be able to reach: the Actions runtime token
 * (used to fetch/upload artifacts and logs), the results/runtime service
 * URLs, and the OIDC token-request endpoint.
 */
const SCRUBBED_EXACT_NAMES = new Set([
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_RESULTS_URL',
  'ACTIONS_RUNTIME_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
]);

const INPUT_PREFIX_PATTERN = /^INPUT_/i;

/**
 * Returns a copy of `env` with action-input variables (`INPUT_*`, which
 * include the `github-token` input) and Actions-runtime credentials removed.
 * Everything else — including caller-supplied build secrets — passes
 * through unchanged, so the value is safe to hand to `build-command`.
 */
export function scrubBuildEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const scrubbed: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (INPUT_PREFIX_PATTERN.test(key)) continue;
    if (SCRUBBED_EXACT_NAMES.has(key.toUpperCase())) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}
