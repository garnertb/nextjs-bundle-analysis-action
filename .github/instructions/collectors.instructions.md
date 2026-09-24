---
applyTo: 'src/collectors/**'
---

# Collector instructions

- Manifest layouts, per-combo support status, and computed-vs-`next build`
  size comparisons are documented in `docs/manifests.md`. Read the relevant
  combo's section there before touching detection or parsing logic; don't
  guess at manifest shape.
- Size accounting, defined in `src/collectors/index.ts`:
  - `firstLoad` = the route's own unique file set union'd with its router's
    `shared` set.
  - Pages Router `shared` = the files referenced by `pages['/_app']` (plus
    whatever `_app` itself depends on), not an intersection across routes.
  - App Router `shared` = the intersection of files across every route in
    that router (App Router has no single always-loaded entry like
    `_app`).
  - `own` = `firstLoad` minus `shared`.
  - `total` = the union of every route's files, across both routers.
- A referenced chunk that doesn't exist on disk is a hard error
  (`NoRoutesFoundError`/thrown collector error), never a silently skipped
  file.
- Route Handlers (`app/**/route.ts`) are excluded from output, even though
  `docs/manifests.md` records their size for comparison purposes.
- Route normalization must stay injective: route groups (`(group)`) are
  dropped, `@slot` and intercept markers (`(.)`, `(..)`, `(...)`) are kept,
  and a normalization collision (two distinct build paths mapping to the
  same route) throws rather than silently overwriting one.
- The Next 16 webpack App Router combo has no reliable per-route client
  chunk manifest (the root `app/page` chunk leaks into every route's
  client-reference manifest); it must throw `UnsupportedAppRouterError`
  naming the combo and pointing at `docs/manifests.md`, not guess.
- Fixture-first workflow: every collector change should be provable against
  a committed fixture under `fixtures/next/<combo>/<app>/`. If no fixture
  covers the case, add one (see the `refresh-fixtures` and
  `add-nextjs-version` skills) before changing behavior.
