# Comment feedback footer (demo placeholder)

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

### Footer format (GitHub Markdown)

Appended **after** the existing suggestion block, separated by one blank line:

```markdown
<sub>

*Was this comment useful?*  
[👍](#) | [👎](#)

</sub>
```

| Element | Rule |
|---------|------|
| Size | Entire footer wrapped in `<sub>…</sub>` — GitHub allows this HTML tag in PR comments and renders it smaller than body text (no custom CSS; `font-size` is stripped). |
| Prompt line | `*Was this comment useful?*` — italic inside `<sub>`. |
| Thumbs | Literal 👍 and 👎, each a markdown link with placeholder `href`: `[👍](#)` and `[👎](#)`. |
| Separator | ASCII pipe with spaces: ` \| ` between the two links. |
| Spacing | One blank line between the suggestion line and the opening `<sub>`; optional single trailing space after the prompt line (`  `) so the thumbs stay on the next line inside `<sub>`. |

### Full comment example

```markdown
### 🤖 Security analyzer

⚠️ Division by zero when `b === 0`.

💡 **Suggestion:** Guard the divisor before calling `divide`.

<sub>

*Was this comment useful?*  
[👍](#) | [👎](#)

</sub>
```

### Edge cases

- Footer is **identical** on every inline comment (no variation by analyzer, severity, or finding).
- Empty findings → no comments → no footer (unchanged).
- Dry-run preview logs show the full body including the footer.

## API / events

N/A — internal string formatting in `formatCommentBody`. No new env vars, webhooks, or GitHub API fields.

## Acceptance criteria

- [ ] Every inline comment body from `formatCommentBody` ends with the footer block exactly as specified (`<sub>` wrapper, italic prompt, linked emojis).
- [ ] Tracking comment body is unchanged (no footer).
- [ ] Thumbs links use placeholder href `[👍](#)`, `[👎](#)`; no real URL or query params.
- [ ] Footer text renders smaller than the main comment body (via `<sub>`).
- [ ] `npm test -w reviewer-runner` passes, including updated/added tests for the footer.
- [ ] On a real PR, rendered comment shows smaller italic prompt and clickable thumb links (manual smoke once implemented).

## Validation checklist

- [ ] Acceptance criteria above are met
- [ ] `npm test -w reviewer-runner` passes
- [ ] Spot-check one posted inline comment on GitHub: footer visibly smaller than body, links render as links, clicks are inert (no navigation beyond `#` anchor)
- [ ] No open questions block release (or explicitly deferred in Open questions)

## Open questions

| # | Question | Status | Answer / decision |
|---|----------|--------|-------------------|
| 1 | Should the **tracking comment** also show the feedback footer? | Resolved | **No** — inline finding comments only. |
| 2 | Link href for thumbs: empty `()` vs `#`? | Resolved | **`[👍](#)` / `[👎](#)`** — placeholder links, no backend. |
| 3 | Smaller footer text? | Resolved | Wrap footer in **`<sub>…</sub>`** (GitHub-safe; no CSS). |
| 4 | Export a dedicated `formatCommentFooter()` helper vs inline strings in `formatCommentBody`? | Deferred | Implementation detail; default to smallest change (inline or tiny constant in `comments.ts`). |

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-31 | brainstorm | Initial draft from `/brainstorm` |
| 2026-05-31 | brainstorm | Links `[👍](#)`; footer wrapped in `<sub>` for smaller text |
| 2026-05-31 | implement | Phase 1: `COMMENT_FEEDBACK_FOOTER` appended in `formatCommentBody` |
