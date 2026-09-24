---
name: add-nextjs-version
description: Add support for a new Next.js major version or bundler mode to the collector (scaffold a fixture, study its manifests, extend the collector, wire it into CI, update the support table).
---

# Add a new Next.js version / bundler mode

Use this when a new Next.js major (or a new bundler mode within an existing
major, e.g. a new default bundler) needs collector support.

1. **Scaffold a fixture app.** Reuse the existing source under
   `fixtures/apps/{app-router,pages-router,mixed}/`; you likely only need to
   add a new combo entry to the `combos` array in `scripts/build-fixtures.mjs`
   (id, `nextVersion`, `bundler`, `buildArgs`). Don't fork the fixture source
   unless the new version needs app-code changes to build at all.

2. **Build and inspect.**

   ```
   pnpm run fixtures
   ```

   This builds each app for every combo (including the new one) into
   `.fixture-scratch/` and trims a copy into `fixtures/next/<combo>/<app>/`.
   Inspect `.fixture-scratch/<combo>/<app>/.next` for the manifest files
   present, and compare the per-route chunk list against `next build`'s own
   printed "First Load JS" table.

3. **Document the combo** in `docs/manifests.md`: which manifest file(s)
   exist, their exact keys/shape, how shared/root chunks are listed, whether
   Route Handlers carry client JS, and your computed first-load numbers vs.
   `next build`'s printed numbers. Follow the existing per-combo section
   structure. If there's no reliable per-route client chunk list, say so
   plainly — the combo must fail explicitly as unsupported, matching the
   Next 16 webpack App Router precedent (`UnsupportedAppRouterError`).

4. **Extend or add a collector** under `src/collectors/`. Update
   `detect.ts` to recognize the new combo from the files present. Add
   fixture-backed unit tests in `collect-bundle-report.fixtures.test.ts`
   (or extend `EXPECTED_ROUTE_SIZES` in `__fixtures-expected.ts`, generated
   from `docs/manifests.md`'s computed gzip bytes).

5. **Add the CI matrix cell** in `.github/workflows/integration.yml`
   (`matrix.include`), and the support-matrix row in `README.md`.

6. Run `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`
   before opening a PR.
