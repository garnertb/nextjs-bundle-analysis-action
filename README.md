# nextjs-bundle-analysis-action

Measures per-route client JS bundle size for Next.js apps (App Router and
Pages Router, webpack and Turbopack), compares it against a baseline from
your base branch, evaluates size budgets, and posts a PR comment and job
summary.

## Quick start

```yaml
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  actions: read
  pull-requests: write
jobs:
  bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci && npx next build
      - uses: garnertb/nextjs-bundle-analysis-action@v1
```

The same workflow must run on `push` to your base branch, which produces the
baseline, and on `pull_request`, which produces the comparison. On the very
first run there's no baseline yet; the report says so and still checks
absolute budgets (see [Sample report](#sample-report) below).

## Usage

Every input is optional. Sizes are decimal bytes (`512B`, `250kB` =
250,000 bytes, matching `next build`'s output); `*-increase` inputs also
accept a percent (`5%`). Leaving a `warn-*`/`fail-*` input unset disables
that check.

```yaml
- uses: garnertb/nextjs-bundle-analysis-action@v1
  with:
    # Directory containing the Next.js app, relative to the repository root.
    # Default: .
    working-directory: ''

    # Build output directory, relative to `working-directory`. Set this if your
    # next.config sets a custom `distDir`.
    # Default: .next
    next-dir: ''

    # Command to build the app before measuring. Runs in `working-directory`
    # through a shell with a scrubbed environment, and refuses to run on
    # `pull_request_target` and `workflow_run` events. Leave unset if an
    # earlier step already builds the app. See "build-command security".
    build-command: ''

    # Display label for this app, shown in the report. Slugged and used in the
    # artifact name, the PR comment's hidden marker, and output file paths, so
    # set a distinct value per app when measuring several apps in one repo.
    # Default: the `name` field of `working-directory`'s package.json
    name: ''

    # Branch whose push runs provide the baseline.
    # Default: the repository's default branch
    base-branch: ''

    # Workflow file to search for the baseline artifact. The baseline only ever
    # comes from a successful `push` run of this workflow in this repository.
    # Default: the current workflow file
    baseline-workflow: ''

    # Name of the uploaded sizes artifact, and of the baseline artifact to
    # download.
    # Default: next-bundle-sizes-<slug of name>
    artifact-name: ''

    # Whether to upload the sizes JSON as a workflow artifact. Push runs on the
    # base branch must upload it for later pull requests to have a baseline.
    # Default: true
    upload-artifact: ''

    # Token used to download baseline artifacts and upsert the PR comment.
    # Needs `actions: read` and `pull-requests: write`; a missing scope
    # downgrades that feature to a warning rather than failing the run.
    # Default: ${{ github.token }}
    github-token: ''

    # Whether to create or update a PR comment with the report.
    # Default: true
    comment: ''

    # Login to trust as the author of a prior comment to update, in addition to
    # `github-actions[bot]`. Set this when `github-token` is a GitHub App
    # installation token (which comments as `<app-slug>[bot]`), since that
    # can't be detected automatically via `GET /user`.
    comment-author: ''

    # Whether to write the report to the job summary.
    # Default: true
    job-summary: ''

    # Compression used to measure chunk sizes: `gzip`, `brotli`, or `none`.
    # Changing it makes an existing baseline `incompatible` (no deltas).
    # Default: gzip
    compression: ''

    # Minimum first-load delta for a route to be listed under "Changed routes".
    # Routes with a route-increase finding are listed regardless.
    # Default: 512B
    significant-change: ''

    # Warn/fail if a route's first-load size exceeds this size (e.g. `250kB`).
    warn-route-size: ''
    fail-route-size: ''

    # Warn/fail if a route's first-load size grows by more than this size or
    # percent versus the baseline (e.g. `20kB` or `5%`).
    warn-route-increase: ''
    fail-route-increase: ''

    # Warn/fail if total client JS (the union of every route's files) grows by
    # more than this size or percent versus the baseline.
    warn-total-increase: ''
    fail-total-increase: ''

    # Warn/fail if a router's shared chunk size exceeds this size.
    warn-shared-size: ''
    fail-shared-size: ''

    # Path, relative to the repository root, to a JSON file of per-route glob
    # overrides for the `warn-*`/`fail-*` inputs. See "Budgets file reference".
    budgets-file: ''
```

## Usage variants

### A. Minimal, caller builds

See [Quick start](#quick-start) above — build the app yourself before the
action runs, and it just measures `.next`.

### B. Monorepo, action runs the build

```yaml
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v5
  with: { node-version-file: package.json, cache: pnpm }
- run: pnpm install --frozen-lockfile
- uses: garnertb/nextjs-bundle-analysis-action@v1
  env:
    MY_BUILD_SECRET: ${{ secrets.MY_BUILD_SECRET }} # step env is passed to the build
  with:
    name: web
    working-directory: apps/web
    build-command: pnpm turbo build --filter web
```

`build-command` runs in `working-directory` through a shell (`sh -c` on
Linux/macOS, `cmd /d /s /c` on Windows) with a scrubbed environment — see
[`build-command` security](#build-command-security).

### C. Budgets and gating

```yaml
- id: bundle
  uses: garnertb/nextjs-bundle-analysis-action@v1
  with:
    working-directory: apps/web
    warn-route-size: 250kB
    fail-route-size: 400kB
    warn-route-increase: 5%
    fail-route-increase: 20kB
    warn-total-increase: 10kB
    warn-shared-size: 150kB
    budgets-file: .github/bundle-budgets.json
- if: steps.bundle.outputs.status == 'warn'
  run: echo "::notice::${{ steps.bundle.outputs.warning-count }} bundle warnings"
```

See [Budgets file reference](#budgets-file-reference) for
`.github/bundle-budgets.json`'s format.

### D. Several Next.js apps in one repo (matrix)

```yaml
strategy:
  matrix:
    app: [web, docs]
steps:
  # ...checkout/setup/install...
  - uses: garnertb/nextjs-bundle-analysis-action@v1
    with:
      name: ${{ matrix.app }} # separate artifact + comment per app
      working-directory: apps/${{ matrix.app }}
      build-command: pnpm turbo build --filter ${{ matrix.app }}
```

`name` is slugged and used in the artifact name, the comment's hidden
marker, and output file paths, so each matrix cell gets its own baseline and
PR comment.

## Required permissions

```yaml
permissions:
  contents: read
  actions: read # to look up the baseline workflow run's artifacts
  pull-requests: write # to upsert the PR comment
```

`actions: read` and `pull-requests: write` can be omitted if you don't need
baseline comparison or the PR comment (e.g. a `push`-only, budgets-only
setup) — a missing scope just downgrades that feature to a warning, it
doesn't fail the run.

## Outputs

| Output            | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `sizes-path`      | Path to the measured sizes JSON.                                     |
| `report-path`     | Path to the rendered Markdown report.                                |
| `status`          | Overall status: `pass`, `warn`, or `fail`.                           |
| `baseline-status` | Baseline lookup status: `found`, `missing`, or `incompatible`.       |
| `total-size`      | Total compressed client JS size in bytes (union of all route files). |
| `total-delta`     | Byte delta of `total-size` versus the baseline, if any.              |
| `warning-count`   | Number of threshold warnings.                                        |
| `failure-count`   | Number of threshold failures.                                        |

`setFailed` is only called when a `fail-*` threshold is breached, or on a
measurement/configuration error — never merely because a warning was
raised.

## Budgets file reference

`budgets-file` overrides the global `warn-*`/`fail-*` inputs per route,
matched by glob against the normalized route path. The most specific
matching glob wins; ties go to the first entry in the file. An invalid
budgets file is a configuration error, not a silent no-op.

```json
{
  "routes": {
    "/map/**": { "warn-route-size": "600kB", "fail-route-size": "900kB" },
    "/admin/*": { "warn-route-increase": "15%" }
  }
}
```

## The size model

- **First load** is the compressed size of a route's unique required file
  set (no double counting within a route).
- **Shared**, per router, is: for the Pages Router,
  `pages['/_app']`'s files (plus the framework/main chunks bundled into
  it); for the App Router, the intersection of files across every route in
  that router.
- **Own** = first load − that router's shared.
- **Total** is the compressed size of the union of all client files across
  every route, so adding a route that only reuses existing chunks doesn't
  grow it. `warn-total-increase`/`fail-total-increase` use this, not a sum
  of first loads.
- A baseline whose fingerprint (schema version, collector version,
  compression algorithm) differs from the head is `incompatible`: the
  report shows no deltas but still evaluates absolute budgets.
- A chunk referenced by a manifest but missing on disk is a measurement
  error (the action fails), never counted as zero.

## Support matrix

| Combo                              | App Router     | Pages Router |
| ---------------------------------- | -------------- | ------------ |
| Next 15, webpack                   | ✅             | ✅           |
| Next 15, Turbopack (`--turbopack`) | ✅             | ✅           |
| Next 16, webpack (`--webpack`)     | ❌ unsupported | ✅           |
| Next 16, Turbopack (default)       | ✅             | ✅           |

**Next.js 15 or newer is required.** The action resolves the installed
`next` package by walking up from the directory containing `next-dir`
(falling back to `working-directory`), so hoisted monorepo installs are
found. If that version is below 15, the action fails with an unsupported-version
error. If no `next` install can be resolved, the check is skipped.

**Next 16 webpack + App Router is unsupported and fails explicitly.** Next
16's webpack build no longer emits `app-build-manifest.json`, and the
remaining `*_client-reference-manifest.js` files don't expose a reliable
route → client-chunk list (see `docs/manifests.md`'s "16-webpack" section
for the full investigation). If your app has any App Router routes and
builds with `next build --webpack` on Next 16, the action fails with an
error naming the combo and linking to that doc — including in a mixed app,
where the Pages Router routes would otherwise still be measurable. Build
with Turbopack (the Next 16 default) or stay on webpack with App Router
routes only through Next 15 to avoid this.

## Fork pull requests

On a `pull_request` from a fork, the default `github.token` is read-only
against the base repository — it retains read scopes like `actions: read`
and `contents: read`, it just can't write. Baseline lookup and the resulting
deltas still work, and absolute budgets are still checked. Only the PR
comment write fails, downgrading to a warning; the job summary is still
written in full, with the deltas included. Set `comment-author` if you're
using a GitHub App token from a workflow that does have write access
instead of the default token.

## `build-command` security

When set, `build-command` runs via a shell in `working-directory` with the
environment scrubbed of everything the action itself doesn't want a build
script to see: every `INPUT_*` variable (including the token, as
`INPUT_GITHUB-TOKEN`/`INPUT_GITHUB_TOKEN`), `ACTIONS_RUNTIME_TOKEN`,
`ACTIONS_RESULTS_URL`, `ACTIONS_RUNTIME_URL`, and
`ACTIONS_ID_TOKEN_REQUEST_TOKEN`/`ACTIONS_ID_TOKEN_REQUEST_URL`.
Caller-set environment (e.g. `env:` build secrets on the step) still passes
through unchanged.

`build-command` refuses to run at all on `pull_request_target` and
`workflow_run` events — those run with base-repository permissions against
head-repository (potentially untrusted) code, and a configurable build
command is exactly the kind of thing that shouldn't execute there. Use a
`pull_request` trigger instead (see
[Fork pull requests](#fork-pull-requests) for what that means for forks).

A non-zero exit from `build-command` fails the action.

## Pinning guidance

```yaml
- uses: garnertb/nextjs-bundle-analysis-action@v1 # tracks v1.x.x, recommended
- uses: garnertb/nextjs-bundle-analysis-action@v1.2.3 # exact version
- uses: garnertb/nextjs-bundle-analysis-action@<commit-sha> # supply-chain pinned
```

`v1` and `v1.<minor>` are floating tags that release-please moves to the
latest matching release automatically; pin to a full commit SHA if your
policy requires immutable action references.

## Sample report

Generated with `pnpm cli measure` against two of this repo's own committed
fixtures (one mutated to add a new route, remove another, and grow
`/products/[slug]` past its budget), then `pnpm cli report`:

```markdown
<!-- nextjs-bundle-analysis:web -->

### ❌ Bundle sizes · web

**192.6 kB** total client JS (gzip) · **+24.3 kB (+14.4%)** vs `a1b2c3d` on `main`
7 routes · 1 changed · 1 added · 1 removed · **3 failures · 3 warnings**

#### Findings

|     | Route              | Check          |    Value |            Limit |
| :-: | ------------------ | -------------- | -------: | ---------------: |
| ❌  | `/products/[slug]` | Route increase | +24.1 kB |  fail &gt; 20 kB |
| ❌  | `/products/[slug]` | Route size     | 104.3 kB | fail &gt; 104 kB |
| ❌  | `/about`           | Route size     | 104.5 kB | fail &gt; 104 kB |
| ⚠️  | _total_            | Total increase | +24.3 kB |  warn &gt; 10 kB |
| ⚠️  | `/`                | Route size     | 102.7 kB | warn &gt; 100 kB |
| ⚠️  | `/_not-found`      | Route size     | 103.5 kB | warn &gt; 100 kB |

#### Changed routes

| Route              | Router |  Before |    After |        Δ |     Δ% |     |
| ------------------ | ------ | ------: | -------: | -------: | -----: | :-: |
| `/products/[slug]` | app    | 80.2 kB | 104.3 kB | +24.1 kB | +30.1% | ❌  |

**Added:** `/about` (app) 104.5 kB
**Removed:** `/legacy/promo` (pages) was 95.2 kB

<details><summary>All routes (7)</summary>

**App Router** (shared 102.5 kB)

| Route              | First load |    Own |  Budget |
| ------------------ | ---------: | -----: | ------: |
| `/`                |   102.7 kB |  127 B | ⚠️ 102% |
| `/_not-found`      |   103.5 kB |  992 B | ⚠️ 103% |
| `/about`           |   104.5 kB | 2.0 kB | ⚠️ 104% |
| `/products/[slug]` |   104.3 kB | 1.7 kB | ⚠️ 104% |

**Pages Router** (shared 82.6 kB)

| Route                 | First load |    Own | Budget |
| --------------------- | ---------: | -----: | -----: |
| `/legacy`             |    82.9 kB |  282 B |    82% |
| `/legacy/about`       |    84.8 kB | 2.2 kB |    84% |
| `/legacy/blog/[slug]` |    84.4 kB | 1.8 kB |    84% |

</details>

<sub>Thresholds: route size warn 100 kB / fail 104 kB · route increase warn 5% / fail 20 kB · total increase warn 10 kB<br>
Next 15.5.4 (webpack) · nextjs-bundle-analysis-action v1.0.0</sub>
```

The `&gt;` you see above is real: every repo-derived string (and even the
static `>` in "fail > 20 kB") is HTML-entity-escaped outside of code spans
so a route name can never forge the report's own markup — GitHub renders it
as a literal `>`.
