---
name: debug-bundle-measurement
description: Reproduce and root-cause a reported wrong bundle size for a specific route, using the CLI against a real .next build, then add a regression fixture.
---

# Debug a wrong bundle-size measurement

Use this when a route's reported `firstLoad`/`own`/`shared` size looks wrong.

1. **Reproduce with the CLI** against the real (or a copy of the) `.next`
   directory that showed the wrong number:

   ```
   pnpm cli measure --next-dir <path-to-.next> --compression gzip --out /tmp/actual.json
   ```

   Inspect `/tmp/actual.json`'s `routes[]` for the affected route: its
   `files` array is the exact file set the collector attributed to it.

2. **Diff against `next build`'s own output.** Re-run (or find the log of)
   `next build` for that app; compare its printed per-route "First Load JS"
   against your computed number. A mismatch usually means either a manifest
   entry was mis-attributed to the wrong route, or a shared/root chunk
   wasn't deduplicated correctly.

3. **Find the offending manifest entry.** Look at the specific manifest file
   for that Next/bundler combo (see `docs/manifests.md` for which file and
   shape apply) and locate the entry for the affected route. Common causes:
   a route-group or intercept-route path wasn't normalized as expected (see
   `src/collectors/normalize-route.ts`), or a chunk was double-counted /
   missing from `shared` vs. `own`.

4. **Add a regression fixture.** If no existing committed fixture reproduces
   the bug, add one (see the `refresh-fixtures` skill) rather than only
   fixing the code — the fixture tests in
   `src/collectors/collect-bundle-report.fixtures.test.ts` are what prevent
   the regression from coming back.

5. Run `pnpm test` to confirm the fix, then `pnpm run typecheck`,
   `pnpm run lint`, and `pnpm run build` before opening a PR.
