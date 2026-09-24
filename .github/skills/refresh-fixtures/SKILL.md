---
name: refresh-fixtures
description: Regenerate the trimmed .next fixtures under fixtures/next/ and any report snapshots, and tell real changes apart from noise before committing.
---

# Refresh committed fixtures

Use this after a Next.js patch bump in `scripts/build-fixtures.mjs`'s
`combos[]`, a change to what the fixture apps build, or when a fixture looks
stale.

1. Regenerate:

   ```
   pnpm run fixtures
   ```

   This rebuilds every app for every combo into `.fixture-scratch/`
   (gitignored) and overwrites the trimmed copies under
   `fixtures/next/<combo>/<app>/`.

2. **Review the diff carefully.** `git diff --stat fixtures/next` first for
   an overview, then inspect the actual manifest/chunk diffs. Expected
   "noise" from a fresh build: content-hash suffixes in chunk filenames
   changing, chunk byte sizes shifting by a few bytes from a dependency
   patch bump. NOT expected / investigate before committing: a route
   disappearing or appearing, a large size jump, a combo flipping from
   supported to unsupported (or vice versa) unexpectedly.

3. If route sizes changed, the committed "expected" numbers in
   `src/collectors/__fixtures-expected.ts` and the tables in
   `docs/manifests.md` are now stale — regenerate/update both by hand
   against the new committed fixtures (they're intentionally not
   auto-generated at test time, to keep the fixture tests honest about
   what's actually committed).

4. Re-run the report snapshot tests in `src/report/` — if a fixture pair's
   rendered sample changed meaningfully, update the README's sample report
   too.

5. Run `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`,
   and confirm `fixtures/next/**` stays small (this is unit-test fixture
   data, not full build output) before opening a PR.
