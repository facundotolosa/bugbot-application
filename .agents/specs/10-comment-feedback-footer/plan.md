# Plan: Comment feedback footer (demo placeholder)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Done

## Prerequisites

- [x] Spec reviewed; blocking open questions resolved or deferred in spec
- [x] Human approves plan before `/implement`

## Phases

_Each phase must be independently testable/verifiable before moving on._

---

### Phase 1: Feedback footer in `formatCommentBody`

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Every inline comment body ends with the spec footer (`<sub>`, italic prompt, `[👍](#)` / `[👎](#)` links). |

#### Steps

1. **RED→GREEN** in `packages/reviewer-runner/src/findings/comments.ts`:
   - Add a module-level constant for the footer block (exact markdown from spec § Footer format).
   - Append it in `formatCommentBody` after the suggestion line (blank line before `<sub>`).
2. **RED→GREEN** in `packages/reviewer-runner/src/findings/comments.test.ts`:
   - New test: body contains `<sub>`, `*Was this comment useful?*`, `[👍](#)`, `[👎](#)`, and pipe separator.
   - Update the exact-match test (`performance minor` example) to include the footer trailing block.
   - Existing `toInlineReviewComments` fixture test should still pass (footer present on mapped comments).
3. **Docs:** extend `packages/reviewer-runner/README.md` § Inline comment format with the footer snippet (no other packages).

#### Verification

- [x] `npm test -w reviewer-runner` passes (`comments.test.ts` and full workspace suite)
- [x] `formatCommentBody` output matches spec full example structure (header + issue + suggestion + footer)
- [x] `toInlineReviewComments` still skips findings without `line` (unchanged behavior)

#### Notes

- Single vertical slice — no separate “tests-only” phase.
- Tracking comment path (`formatTrackingBody` in `github/tracking.ts`) is untouched; no new test required unless a regression is suspected (tracking tests already assert exact body shape without footer).

---

### Phase 2: Smoke check & sign-off prep

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Confirm dry-run preview and (optionally) a live PR show the footer as intended before `/validate`. |

#### Steps

1. Run dry-run locally:
   ```bash
   npm run review -- --dry-run --skip-agent --base origin/main --head HEAD
   ```
   Inspect logged comment preview lines include the footer block.
2. **Manual (human or CI PR):** post at least one inline comment on a PR; confirm GitHub renders smaller italic prompt and clickable `#` thumb links with no side effects beyond anchor jump.

#### Verification

- [x] Dry-run orchestration completes (`npm run review -w reviewer-runner -- --dry-run --base origin/main --head HEAD`); fixture comment body includes footer (preview meta skipped when findings dropped from PR scope)
- [x] Manual GitHub render check documented in PR or chat — PR #13, human confirmed footer layout OK
- [x] Spec acceptance criteria mappable — ready for `/validate`

#### Notes

- Phase 2 dry-run dropped fixture findings (paths outside current diff); footer verified by printing `toInlineReviewComments` body from fixture — full footer block present.

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/findings/comments.ts` | Modify — footer constant + append in `formatCommentBody` |
| `packages/reviewer-runner/src/findings/comments.test.ts` | Modify — footer assertions; update exact-match expected body |
| `packages/reviewer-runner/README.md` | Modify — document footer in inline comment format section |

## Out of scope for this plan

- Tracking comment footer
- Analytics, webhooks, or link targets beyond `#`
- Evals golden-case changes
- Exporting `formatCommentFooter` from `index.ts` (internal to `comments.ts` unless a consumer appears)

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial plan from spec |
| 2026-05-31 | Phase 1 done: footer in `formatCommentBody`, tests, README |
| 2026-05-31 | Phase 2 done: dry-run + fixture body smoke; GitHub render deferred to PR |
| 2026-05-31 | Validate PASS: PR #13 visual check; footer HTML layout fix merged |
