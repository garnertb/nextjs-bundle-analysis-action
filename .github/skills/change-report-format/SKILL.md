---
name: change-report-format
description: Edit the Markdown report renderer, update its snapshot tests and the README's sample report, and re-verify truncation and escaping.
---

# Change the report format

Use this when altering what the PR comment / job summary Markdown looks
like (`src/report/render.ts`).

1. Read `.github/instructions/report.instructions.md` and the plan's
   "Report improvements" / "Findings summary examples" reference (the four
   rendered examples: findings, changed routes, added/removed, shared rows,
   collapsed all-routes, footer) before changing structure.

2. Edit `render.ts`. Keep every repo-derived string going through
   `escape.ts`'s `escapeCell`/`codeSpan` — never add a new
   string-interpolation site that bypasses it.

3. Update the snapshot tests in `src/report/*.test.ts` to match, and add a
   new one if you added a new section/branch.

4. **Truncation checklist** (re-verify even for a small format tweak):
   - Findings are never dropped due to changed-route visibility (only
     capped, failures first, as an absolute last resort).
   - Added/Removed lists are capped with "…and K more".
   - The final Markdown length is asserted `<= MAX_MARKDOWN_LENGTH` in a
     test with thousands of changed/added/removed routes.

5. **Escaping checklist:**
   - A route name containing `|`, a backtick, `<!--`, `-->`, and a newline
     renders escaped, not raw.
   - The two marker-spoofing strings in `escape.test.ts` still don't
     produce a literal `<!--`/`-->` anywhere in the output.

6. Regenerate the README's sample report from a real fixture pair (see the
   Phase 2 PR body for the original generation approach: measure two
   fixture builds, or one fixture against a synthetically mutated
   baseline, then render).

7. Run `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`.
