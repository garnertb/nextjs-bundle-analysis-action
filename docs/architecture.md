# Architecture

A short data-flow description of how a run turns a built Next.js app into a
PR report. See `AGENTS.md` for the module map and invariants, and
`docs/manifests.md` for the manifest research this is built on.

```
                 ┌───────────────┐
 (optional)      │ build-command │  scrubbed env, refuses pull_request_target/workflow_run
                 └───────┬───────┘
                         ▼
                 ┌───────────────┐
                 │    measure    │  src/collectors -> BundleReport (schema v1)
                 └───────┬───────┘
                         ▼
        push/dispatch/other ──────────────┐   pull_request
                         │                 │       │
                         ▼                 │       ▼
                 ┌───────────────┐         │  ┌──────────────────┐
                 │ upload as the │         │  │ baseline lookup  │  trusted cross-run
                 │ next baseline │         │  │ (src/github/     │  artifact search;
                 └───────┬───────┘         │  │  baseline.ts)    │  degrades to a
                         │                 │  └────────┬─────────┘  warning, not a crash
                         │                 │           ▼
                         │                 │  ┌──────────────────┐
                         │                 │  │     compare      │  src/report/compare.ts
                         │                 │  └────────┬─────────┘
                         │                 │           ▼
                         │                 │  ┌──────────────────┐
                         │                 │  │     evaluate      │ src/thresholds -> Finding[]
                         │                 │  └────────┬─────────┘
                         └─────────────────┼────────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │      render       │  src/report/render.ts:
                                  │                    │  escaped, truncated Markdown
                                  └────────┬───────────┘
                                           ▼
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
             ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐
             │  job summary   │   │  PR comment       │   │   annotations     │
             │ (core.summary) │   │  upsert (marker-   │   │ (core.error /     │
             │                │   │  based, bot-only)  │   │  core.warning)    │
             └───────────────┘   └──────────────────┘   └──────────────────┘
                                           │
                                           ▼
                                  outputs + setFailed
                             (only on a fail-* threshold breach,
                              or a measurement/config error)
```

## Why baseline lookup can't just use "the latest artifact"

A PR run can't trust an artifact from another PR, a fork, or an unrelated
workflow. `src/github/baseline.ts` only accepts the newest `push` run on the
base branch, on the same workflow file, with `status=success`, whose
`head_repository.id` matches this repository's ID, and whose artifact hasn't
expired. Any failure in that chain (API error, no matching run, expired
artifact, unparseable JSON) degrades to `baseline-status: missing` or
`incompatible` plus a warning — never a hard failure, since a broken
baseline lookup shouldn't block an otherwise-passing PR.

## Why the core (`collectors`/`thresholds`/`report`/`cli`) has no `@actions/*` imports

`src/main.ts` is the only file allowed to import both a pure module and
`@actions/*`. Everything else stays runnable outside the Actions runtime, so
it can be unit-tested directly, driven by `src/cli.ts` for local debugging,
and reused by the agent skills in `.github/skills/`.
