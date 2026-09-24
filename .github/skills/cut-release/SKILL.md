---
name: cut-release
description: Check and merge the open release-please PR, verify the published release and the floating v1/v1.x tags, and roll back a bad release by re-pointing the floating tag.
---

# Cut a release

This repo releases via release-please (`.github/workflows/release.yml`);
day-to-day this is "merge the release PR", but verify it first.

1. **Find the open release PR** (release-please keeps at most one open,
   titled like `chore(main): release X.Y.Z`). Check:
   - The version bump matches the merged commits since the last release
     (`feat` -> minor, `fix`/`perf` -> patch, `!`/`BREAKING CHANGE` ->
     major; pre-1.0 this is `bump-minor-pre-major`-controlled).
   - `CHANGELOG.md`'s new entry looks sensible (no missing/miscategorized
     entries — check `release-please-config.json`'s `changelog-sections`
     if something is hidden that shouldn't be).
   - `dist/` in the PR is fresh: `check-dist` must be green on it.
   - `package.json`'s `version` matches the PR title.

2. **Merge the release PR** (squash, as usual). This triggers
   `release.yml` again with `release_created=true`, which: checks out the
   new tag, rebuilds `dist/` and fails the workflow if it differs from
   what's committed (a real bug if it does — `check-dist` on the PR should
   have already caught this), then force-moves `v<major>` and
   `v<major>.<minor>` to the release commit.

3. **Verify:** the GitHub Release exists at the new tag, and
   `git ls-remote --tags origin | grep -E 'refs/tags/v[0-9]+(\.[0-9]+)?$'`
   shows `v<major>` and `v<major>.<minor>` pointing at the new commit.

4. **Rollback:** if a release is bad, don't delete the GitHub Release/tag.
   Re-point the floating tag(s) at the previous good release commit:

   ```
   git tag -fa v<major> <previous-good-tag> -m "Release v<major>"
   git push origin refs/tags/v<major> --force
   # and the same for v<major>.<minor> if needed
   ```

   Then open a `fix:` PR (and, once merged and released, this will move the
   floating tags forward again).

5. After the first-ever `1.0.0` release, remove `release-as: 1.0.0` from
   `release-please-config.json` (it's a one-time bootstrap value) in a
   follow-up `chore:` PR.
