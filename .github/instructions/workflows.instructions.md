---
applyTo: '.github/workflows/**,action.yml'
---

# Workflow and action.yml instructions

- Every third-party action must be pinned to a full commit SHA with a
  version comment (`# v1.2.3`), verified with
  `gh api repos/<owner>/<repo>/commits/<sha>` returning 200 — not just a
  tag's own object SHA, which for an annotated tag is the tag object, not
  the commit. Dereference annotated tags first.
- Workflows declare the minimum `permissions` they need, at the workflow
  level and narrowed further per-job where jobs need different scopes
  (e.g. a `contents: read` verification job alongside a `contents: write`
  tagging job).
- `action.yml` input/output changes must land together with matching
  updates to `src/inputs.ts` (or `src/main.ts`'s `INPUT_NAMES`/output list)
  and the README's input/output table in the same PR; they're required to
  match exactly.
- `dist/index.js` must be rebuilt (`pnpm run build`) and committed whenever
  `src/**` changes; `check-dist` fails a PR where it's stale. It must not
  embed installation-path-dependent strings (see the assertion in
  `esbuild.config.mjs`) or the action version (read from
  `GITHUB_ACTION_REF` at runtime instead).
- New workflows that build fixture apps (like `integration.yml`) should
  reuse the pinned per-combo `pnpm-lock.yaml` under
  `fixtures/next/<combo>/<app>/` rather than letting pnpm re-resolve
  versions, and should cache the pnpm store (`cache: pnpm` plus a
  `cache-dependency-path` covering both the root and fixture lockfiles).
