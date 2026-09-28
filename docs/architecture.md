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
workflow. `src/github/baseline.ts` only accepts a `push` run on the base
branch, on the same workflow file, with `status=success`, whose
`head_repository.id` matches this repository's ID, and whose artifact hasn't
expired. Any failure in that chain (API error, no matching run, expired
artifact, unparseable JSON) degrades to `baseline-status: missing` or
`incompatible` plus a warning — never a hard failure, since a broken
baseline lookup shouldn't block an otherwise-passing PR.

"The newest trusted run" isn't enough either: it doesn't verify that the run
actually measured the commit the PR merged onto. Two failure modes follow
from that: a race, where the PR's merge commit is built before its base
commit's own push run finishes, so the report compares against an older
commit and blames the PR for changes that already landed; and drift, where a
rerun or a slow run means the newest trusted run is _ahead_ of the commit
the PR actually merged onto, so that commit's changes show up as inverted
deltas. On `pull_request`, the lookup therefore prefers the exact commit the
build merged onto — the first parent of the merge commit `github.context.sha`,
resolved via `GET /repos/{owner}/{repo}/git/commits/{sha}` — searching for a
trusted run at that exact `head_sha` first. If the commit doesn't have
exactly two parents (not a merge commit) or the API call fails, it falls
back to the event payload's `pull_request.base.sha`, which is fixed per
event and survives a garbage-collected synthetic merge commit, and a warning
is emitted since that value hasn't been verified against the merge ref's
actual first parent. Only if neither source is usable does the lookup fall
back to today's "newest trusted run" behavior with no preference at all.

When the preferred commit has no trusted run yet, the search falls back to
the newest trusted run on the base branch, and the resulting comparison is
marked `baseline-status: stale` rather than `found`: every threshold still
applies, but the report calls out that deltas may include changes already on
the base branch. This can be permanent for a given merge base — if that
commit's own push run was skipped (a `paths` filter, `[skip ci]`), failed, or
was cancelled, and nobody re-runs it, later pushes to the base branch don't
help a PR merged onto that commit. Rebasing or otherwise updating the PR
does, since it changes the merge base being resolved.

## Why the core (`collectors`/`thresholds`/`report`/`cli`) has no `@actions/*` imports

`src/main.ts` is the only file allowed to import both a pure module and
`@actions/*`. Everything else stays runnable outside the Actions runtime, so
it can be unit-tested directly, driven by `src/cli.ts` for local debugging,
and reused by the agent skills in `.github/skills/`.
