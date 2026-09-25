# AGENTS.md

This file is the always-loaded entry point for agents (Copilot coding agent,
Copilot CLI, or anyone else automating changes here). Read it before making
changes. Path-scoped detail lives in `.github/instructions/*.instructions.md`;
just-in-time task playbooks live in `.github/skills/*/SKILL.md`.

## What this is

A GitHub Action (`runs.using: node24`) that measures per-route client JS
bundle size for Next.js apps (App Router and Pages Router, webpack and
Turbopack, Next 15-16), compares it against a baseline artifact from a prior
run on the base branch, evaluates size budgets, and posts a PR report.

## Architecture map

```
src/collectors/   Pure: reads a built .next/ dir, returns a schema-v1 BundleReport
                  (per-route file sets, firstLoad/own/shared/total, gzip/brotli/none).
                  Auto-detects Next/bundler combo from manifest shape; throws
                  UnsupportedAppRouterError / NoRoutesFoundError rather than
                  silently returning an empty/wrong report.
src/thresholds/   Pure: byte/percent parsing, budgets-file glob matching,
                  warn/fail evaluation -> Finding[] (one per route per check).
src/report/       Pure: compare.ts (baseline vs. head -> Comparison),
                  render.ts (Comparison + Finding[] -> Markdown, with
                  truncation and escaping), escape.ts (all repo-derived
                  strings must go through this).
src/github/       Thin @actions/*+Octokit adapters behind small interfaces:
                  build (build-command via a scrubbed-env shell), artifact
                  (upload/download), baseline (trusted cross-run lookup),
                  comment (marker-based upsert), summary, annotate, api.
src/main.ts       Orchestrates the above for the Actions runtime. The only
                  file that should import both a pure module and @actions/*.
src/cli.ts        Local-only CLI (`measure`, `report`) wrapping the pure core
                  for humans, tests, and skills. Never imports @actions/*.
src/inputs.ts     action.yml input parsing/validation, shared by main.ts.
```

Data flow: `measure -> baseline lookup -> compare -> evaluate -> render ->
publish (artifact, comment, job summary, annotations, outputs)`. See
`docs/architecture.md` for a longer walkthrough and `docs/manifests.md` for
the per-combo manifest research this is built on.

## Commands

```
pnpm install --frozen-lockfile   # always use --frozen-lockfile; never let it re-resolve
pnpm test                        # vitest run, with coverage thresholds enforced
pnpm run test:watch              # vitest watch mode
pnpm run lint                    # eslint .
pnpm run format                  # prettier --write .
pnpm run format:check            # prettier --check .
pnpm run typecheck               # tsc --noEmit
pnpm run build                   # esbuild -> dist/index.js; MUST be committed
pnpm run fixtures                # regenerates fixtures/next/** (see refresh-fixtures skill)
pnpm cli measure --next-dir <path> [--compression gzip|brotli|none]
pnpm cli report --head <sizes.json> [--base <sizes.json>] [threshold flags]
```

Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`
before opening or updating a PR. If any `src/**` file changes, rebuild
`dist/` and commit it in the same PR; `check-dist` in CI fails otherwise.

## Invariants

- Route normalization is injective: two distinct build-output paths must
  never collapse to the same reported route. A collision is a bug, not a
  case to silently pick one side of.
- A referenced-but-missing chunk file is a hard error, not a skipped file.
- `build-command` never receives `INPUT_*`, `ACTIONS_RUNTIME_TOKEN`,
  `ACTIONS_RESULTS_URL`, `ACTIONS_RUNTIME_URL`, or
  `ACTIONS_ID_TOKEN_REQUEST_*`; see `src/github/env-scrub.ts`. Don't add an
  input or env passthrough that could leak the token to a build script.
- Every repo-derived string (route names, branch names, PR titles, etc.)
  rendered into Markdown goes through `src/report/escape.ts`. Don't
  string-interpolate untrusted values directly into `render.ts` output.
- The baseline only ever comes from a trusted push run: same repository ID,
  same workflow file, `event=push`, `status=success`, non-expired artifact.
  Never widen this to accept a fork's artifact.
- `dist/` and `CHANGELOG.md` are generated. Never hand-edit them; `dist/` is
  rebuilt by `pnpm run build` and `CHANGELOG.md` by release-please.
- `src/cli.ts` and everything under `src/collectors`, `src/thresholds`, and
  `src/report` stay free of `@actions/*` imports, so they run outside the
  Actions runtime (tests, the CLI, agent skills).

## Commit and PR conventions

- Conventional-commit PR titles (`feat:`, `fix:`, `docs:`, etc.); `!` or a
  `BREAKING CHANGE` footer for a breaking change. The repo squash-merges, so
  the PR title becomes the commit release-please reads.
- Branch names are prefixed `garnertb/`.
- If you change an `action.yml` input or output, update `src/inputs.ts`, the
  README's Usage block (inputs) and Outputs table, and any affected README example in the same
  PR.
- If you change the report format, update the snapshot tests in
  `src/report/` and the README's sample report.
