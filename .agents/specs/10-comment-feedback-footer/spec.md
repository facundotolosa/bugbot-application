# Comment feedback footer (demo placeholder)

**Status:** Done

## Product summary

Inline PR review comments posted by `reviewer-runner` should end with a small **feedback footer** so the demo looks like a product that collects usefulness signals. The footer is **visual only**: thumbs-up / thumbs-down links have **no backend, no tracking, and no click handler** — they exist purely as a placeholder for portfolio demos.

## Scope

### In scope

| # | Area | Notes |
|---|------|--------|
| 1 | **Inline finding comments** | Append footer to every body produced by `formatCommentBody` in `packages/reviewer-runner/src/findings/comments.ts` (same path used by `toInlineReviewComments` → `postInlineReview`). |
| 2 | **Footer copy & layout** | Fixed English text and markdown structure (see **Behavior**). |
| 3 | **Tests** | Unit tests in `comments.test.ts` assert footer presence and structure; existing comment-format tests updated for the new trailing block. |

### Out of scope

| # | Topic |
|---|--------|
| 1 | **Tracking comment** (`upsertTrackingComment` / `formatTrackingBody`) — no footer. |
| 2 | **Click handling** — links do not POST, open analytics, or mutate GitHub state. |
| 3 | **Per-user or per-comment IDs** in URLs. |
| 4 | **Evals harness** — no golden-case changes unless a test asserts raw comment bodies (unlikely). |
| 5 | **Orchestrator / skill / findings schema** — footer is runner-side markdown only. |

## Behavior

### Where it applies

Only **inline review comments** on PR diffs. The orchestrator and analyzers continue emitting v2 JSON; markdown formatting stays centralized in `formatCommentBody`.

### Footer format (GitHub)

Appended **after** the existing suggestion block, separated by one blank line:

```html
<sub><em>Was this comment useful?</em> <a href="#">👍</a> | <a href="#">👎</a></sub>
```

| Element | Rule |
|---------|------|
| Size | Entire footer wrapped in `<sub>…</sub>` — renders smaller than body text (no custom CSS). |
| Prompt | `<em>Was this comment useful?</em>` — italic inside `<sub>`. |
| Layout | Prompt and thumb links on **one line**; space between prompt and `[👍]` (no `<br>` — separate lines render poorly on GitHub). |
| Thumbs | Literal 👍 and 👎 as `<a href="#">` links; pipe separator ` \| ` between them. |
| Spacing | One blank line between the suggestion line and the footer HTML block. |

### Full comment example

```markdown
### 🤖 Security analyzer

⚠️ Division by zero when `b === 0`.

💡 **Suggestion:** Guard the divisor before calling `divide`.

<sub><em>Was this comment useful?</em> <a href="#">👍</a> | <a href="#">👎</a></sub>
```

### Edge cases

- Footer is **identical** on every inline comment (no variation by analyzer, severity, or finding).
- Empty findings → no comments → no footer (unchanged).
- Dry-run preview logs show the full body including the footer.

## API / events

N/A — internal string formatting in `formatCommentBody`. No new env vars, webhooks, or GitHub API fields.

## Acceptance criteria

- [x] Every inline comment body from `formatCommentBody` ends with the footer block exactly as specified (`<sub>` wrapper, italic prompt, linked emojis).
- [x] Tracking comment body is unchanged (no footer).
- [x] Thumbs links use placeholder href `<a href="#">`; no real URL or query params.
- [x] Footer text renders smaller than the main comment body (via `<sub>`).
- [x] `npm test -w reviewer-runner` passes, including updated/added tests for the footer.
- [x] On a real PR, rendered comment shows smaller italic prompt and clickable thumb links (PR #13, human confirmed).

## Validation checklist

- [x] Acceptance criteria above are met
- [x] `npm test -w reviewer-runner` passes
- [x] Spot-check one posted inline comment on GitHub: footer visibly smaller than body, links render as links, clicks are inert (PR #13)
- [x] No open questions block release (or explicitly deferred in Open questions)

## Open questions

| # | Question | Status | Answer / decision |
|---|----------|--------|-------------------|
| 1 | Should the **tracking comment** also show the feedback footer? | Resolved | **No** — inline finding comments only. |
| 2 | Link href for thumbs: empty `()` vs `#`? | Resolved | **`<a href="#">`** — placeholder links, no backend. |
| 3 | Smaller footer text? | Resolved | Wrap footer in **`<sub>…</sub>`** (GitHub-safe; no CSS). |
| 4 | Export a dedicated `formatCommentFooter()` helper vs inline strings in `formatCommentBody`? | Deferred | Implementation detail; default to smallest change (inline or tiny constant in `comments.ts`). |

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-31 | brainstorm | Initial draft from `/brainstorm` |
| 2026-05-31 | brainstorm | Links `[👍](#)`; footer wrapped in `<sub>` for smaller text |
| 2026-05-31 | implement | Phase 1: `COMMENT_FEEDBACK_FOOTER` appended in `formatCommentBody` |
| 2026-05-31 | implement | Phase 2: dry-run smoke; GitHub render check deferred to PR |
| 2026-05-31 | implement | Footer layout fix: HTML `<br>` + `<a href="#">` (markdown inside `<sub>` overlapped) |
| 2026-05-31 | validate | PASS — PR #13 visual check; spec Done |
| 2026-05-31 | implement | Inline footer layout: thumbs on same line as prompt |
