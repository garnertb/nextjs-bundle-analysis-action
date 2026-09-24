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
