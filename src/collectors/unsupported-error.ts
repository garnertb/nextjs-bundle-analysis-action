export class UnsupportedAppRouterError extends Error {
  constructor(nextDir: string) {
    super(
      `App Router bundle measurement is not supported for this Next.js/bundler combination ` +
        `(build output at "${nextDir}"): no reliable per-route client chunk manifest was found. ` +
        'This is a known limitation of Next 16 webpack builds, where the root App Router chunk ' +
        "leaks into every route's client-reference manifest. Pages Router routes in the same " +
        'build are unaffected. See docs/manifests.md for details.',
    );
    this.name = 'UnsupportedAppRouterError';
  }
}

/**
 * Thrown when the resolved `next` install is older than the minimum supported
 * major. Only raised when the version is actually resolvable.
 */
export class UnsupportedNextVersionError extends Error {
  constructor(version: string, minimumMajor: number) {
    super(
      `Next.js ${version} is not supported: this action requires Next.js ${minimumMajor} or ` +
        'newer. See the support matrix in the README.',
    );
    this.name = 'UnsupportedNextVersionError';
  }
}

/**
 * Thrown when `nextDir` doesn't exist, or exists but yields zero measured
 * routes (e.g. a typo'd `next-dir`, or a build that never ran). A silent
 * empty report would pass every threshold and get uploaded as the next
 * baseline, masking the real problem.
 */
export class NoRoutesFoundError extends Error {
  constructor(nextDir: string, reason: string) {
    super(
      `No routes were found in "${nextDir}": ${reason} Check that next-dir points at a built ` +
        "Next.js app's .next directory (the build must have already run), and see " +
        'docs/manifests.md if this combination might be unsupported.',
    );
    this.name = 'NoRoutesFoundError';
  }
}
