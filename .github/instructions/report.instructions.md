---
applyTo: 'src/report/**'
---

# Report instructions

- The plan's four rendered examples (findings, changed routes sorted by
  `|Δ|` with `Δ%`, added/removed, shared rows, collapsed all-routes grouped
  by router with budget %, and the footer) are the contract for
  `render.ts`. Keep the README's sample report and the snapshot tests in
  `src/report/*.test.ts` in sync with any format change in the same PR.
- Escaping is mandatory for every repo-derived string (route names, branch
  names, error messages, etc.) rendered into Markdown: run it through
  `src/report/escape.ts`'s `escapeCell`/`codeSpan`. Never string-interpolate
  an untrusted value directly.
  - Outside code spans, `<` and `>` are entity-encoded so a spoofed
    `<!--`/`-->` can't fake the hidden marker comment.
  - Inside code spans, entities are NOT decoded by CommonMark, so
    `codeSpan` instead neutralizes comment delimiters (breaks `<!--`/`-->`)
    without literal entity text showing up to the reader.
  - Add both spoof-attempt strings from `escape.test.ts` as regression
    cases for any new escaping path.
- Truncation order (under `MAX_MARKDOWN_LENGTH`, ~60k chars): findings are
  never dropped for changed-route visibility (failures first, then
  warnings, only as an absolute last resort); Added/Removed lists are
  capped with an "…and K more" suffix; only after that does the changed
  routes table itself get capped. Assert the final length bound in tests
  whenever truncation logic changes.
- "Changed routes" is defined by `|Δ| >= significant-change` OR a Route
  increase finding on that route — never by a Route-size-only finding on an
  otherwise-unchanged route (that belongs in Findings and All routes, not
  Changed routes).
