# Plan: Incremental AI code review (PR tracking + scoped diffs)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Draft

## Prerequisites

- [x] Spec reviewed; all open questions **Resolved** in spec (2026-05-30)
- [ ] Human approves this plan before `/implement`
- [x] MVP delivered: `.cursor/skills/ai-code-review/`, `packages/reviewer-runner/`, `.github/workflows/ai-code-review.yml`
- [x] Node.js **20+**, npm workspaces, `CURSOR_API_KEY` in Actions secrets
- [x] Workflow uses `fetch-depth: 0` (retained for ancestry checks)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| First PR run: full review + tracking comment created | 7, 9 |
| Second push: incremental diff since tracking SHA, scoped to `prFiles` | 5, 6, 7 |
| Tracking updated in place (`Analyzed up to` = head) | 1, 2, 7 |
| Pure sync push skips agent, advances tracking | 4, 7 |
| Empty `effectiveFiles` skips agent, advances tracking | 4, 7 |
| Rebase/squash → full review + tracking update | 3, 7 |
| No duplicate inline post at same `(file, line)` | 5, 7 |
| Findings outside `prFiles` never posted | 5, 7 |
| `prepare-diff` metadata + fallback warning | 5, 6 |
| Mandatory diff run summary in agent logs | 6 |
| Unit tests: tracking, skip rules, SHA validation | 1–5, 7 |
| Agent failure: tracking SHA unchanged | 7 |

## Phases

_Each phase is a vertical slice (TDD tracer bullets in `reviewer-runner`; one behavior per RED→GREEN). Do not wire full CI orchestration until Phases 1–6 are green in isolation._

---

### Phase 1: Tracking comment — parse, format, select

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Pure functions to parse issue-comment bodies, pick the canonical tracking comment, and format an updated body per spec. |

#### Steps

1. Add `packages/reviewer-runner/src/tracking.ts` with:
   - `TRACKING_MARKER = "< ai-review-tracking >"`
   - `parseTrackingComment(body)` → `{ analyzedSha, at } | null`
   - `selectTrackingComment(comments[])` → latest by `At` ISO timestamp when multiple match marker
   - `formatTrackingBody(headSha, at: Date)` → marker + `Analyzed up to:` + `At:` lines (no `Reviewer:` line)
2. **Tracer bullet (RED→GREEN):** fixture comment bodies → parsed SHA and timestamp.
3. Add tests: missing marker → null; malformed lines → null; two comments → picks latest `At`.
4. Export types from `index.ts` if useful for tests/CLI.

#### Verification

- [x] `npm test -w reviewer-runner` passes (new `tracking.test.ts`)
- [x] `formatTrackingBody` output matches spec regex-friendly lines exactly
- [x] `selectTrackingComment` behavior covered with ≥2 fixtures

#### Notes

- No GitHub API in this phase — strings and selection logic only.
- Timestamp format: ISO-8601 (e.g. `2026-05-30T12:00:00.000Z`).

---

### Phase 2: GitHub API — tracking + inline comment listing

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Octokit helpers to fetch issue comments, find tracking, create/update tracking, and list inline review comments for known-issues. |

#### Steps

1. Extend `packages/reviewer-runner/src/github.ts`:
   - `listIssueComments(token, ctx)` → paginated `GET .../issues/{pr}/comments`
   - `findTrackingComment(comments)` → uses Phase 1 `selectTrackingComment` + `parseTrackingComment`
   - `upsertTrackingComment(token, ctx, headSha, existingCommentId?)` → create or `issues.updateComment`
   - `listInlineReviewComments(token, ctx)` → `GET .../pulls/{pr}/comments`
2. Map inline comments to `{ file, line, message }` (full body, no truncation).
3. **RED→GREEN:** test with mocked Octokit or injected client interface (do not hit network in CI).
4. Dry-run path: log tracking payload without POST when `--dry-run`.

#### Verification

- [x] Unit tests pass for upsert decision (create vs update) and inline mapping
- [x] `npm run build -w reviewer-runner` succeeds
- [x] No regression in existing `comments.test.ts`

---

### Phase 3: SHA validation + execution mode

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Determine `full` vs `incremental` from tracking SHA with `git cat-file`, `merge-base --is-ancestor`, and optional fetch retry. |

#### Steps

1. Add `packages/reviewer-runner/src/git-scope.ts` (or split `git-validate.ts` + `git-scope.ts` in Phase 4):
   - `shaExists(sha, cwd)`, `isAncestor(ancestor, head, cwd)`
   - `validateSinceSha(since, head, cwd)` → `{ valid: boolean; reason? }`
   - On failure: attempt `git fetch origin <sha>` and/or `git fetch --deepen=200`, then retry once
   - `resolveReviewMode({ tracking, head, cwd })` → `"full" | "incremental"` + `sinceCommit?`
2. **RED→GREEN:** mock `execFile` / inject `GitRunner` — valid ancestor → incremental; missing SHA → full; non-ancestor → full.
3. Log `[review] mode=full|incremental` (and since SHA when incremental).

#### Verification

- [x] Tests cover: no tracking → full; valid ancestor → incremental; invalid/missing SHA → full
- [x] Fetch-retry path tested with mock (second `isAncestor` succeeds)
- [x] `npm test -w reviewer-runner` passes

---

### Phase 4: PR file sets + skip rules

| Field | Value |
|-------|--------|
| **Status** | `in progress` |
| **Goal** | Compute `prFiles`, `incrementalFiles`, `effectiveFiles`, and detect pure-sync / empty-scope skips before invoking the agent. |

#### Steps

1. In `git-scope.ts` (or `scope.ts`):
   - `listPrFiles(base, head, cwd)` → `git diff --name-only base...head`
   - `listIncrementalFiles(since, head, cwd)` → `git diff --name-only since..head` (two-dot)
   - `effectiveFiles = intersection(prFiles, incrementalFiles)`
   - `isPureSync(since, head, cwd)` → `git log --no-merges --first-parent since..head` empty
2. `shouldSkipAgent({ since, base, head, cwd })` → `{ skip: true, reason }` when pure sync OR `effectiveFiles.length === 0` (when incremental); full mode with empty PR diff may still skip via empty effective scope per spec table.
3. **RED→GREEN:** fixtures / mocked git output for intersection and pure-sync detection.
4. Write temp `pr-files` list file helper for later agent invocation (newline-separated paths).

#### Verification

- [ ] Tests: intersection logic; pure sync empty log; non-empty effective → no skip
- [ ] `shouldSkipAgent` returns distinct reasons logged by caller (`pure-sync` vs `empty-effective-scope`)
- [ ] `npm test -w reviewer-runner` passes

---

### Phase 5: `prepare-diff` script (skill-owned)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Deterministic script under the skill that emits reviewable per-file diffs + metadata (`is_incremental`, ignore filters, warnings). |

#### Steps

1. Create `.cursor/skills/ai-code-review/scripts/prepare-diff.ts` (rewritten per spec, not a port):
   - CLI args: `--source`, `--target`, `--since-commit?`, `--pr-files` (file path), `--output` (JSON path, default stdout)
   - Resolve `merge_base` (`origin/<target>` then `<target>`)
   - Incremental when `--since-commit` is ancestor of source head; else fallback + `warnings[]`
   - Three-dot name-only diff, `--diff-filter=ACMR`, filter by pr-files + hardcoded ignore regex categories (spec table)
   - Per-file unified diffs with bounded concurrency (~10), `maxBuffer` ~10 MiB
   - Metadata: `is_incremental`, `since_commit`, `diff_base`, `merge_base`, `pr_size`, `total_files`, `total_lines_added`, `total_lines_removed`, `files_excluded`, `excluded_patterns_matched`, `warnings`
2. Add runnable entry: `npx tsx` or compile step documented in skill README.
3. **RED→GREEN:** unit tests (import module from `packages/reviewer-runner` vitest via relative path, or colocated `prepare-diff.test.ts` included in vitest `include`):
   - Ignore patterns exclude lockfiles / `dist/`
   - `--since-commit` invalid → `is_incremental: false` + warning
   - pr-files filter drops out-of-PR paths
4. Add `packages/reviewer-runner/fixtures/` sample pr-files + mini repo git scenarios if needed (or pure function tests for filters).

#### Verification

- [ ] `npm test -w reviewer-runner` runs prepare-diff tests
- [ ] Manual: `npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts --help` exits 0
- [ ] JSON output schema stable enough for skill + summary block (Phase 6)

#### Notes

- Script stays **skill-owned**; runner does not embed diff logic beyond scope lists.
- `pr_size` heuristic: small ≤10 files & ≤500 lines; large >30 files & >5000 lines; else medium.

---

### Phase 6: Skill + agent prompt contract

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Skill instructs agent to run `prepare-diff`, print mandatory diff summary, analyze, write findings; runner prompt passes CI context without embedding full diff. |

#### Steps

1. Update `.cursor/skills/ai-code-review/SKILL.md`:
   - Remove “runner owns diff / no prepare-diff” MVP wording
   - Inputs: branches, head SHA, optional `Since commit`, paths to known-issues JSON, pr-files list, output findings path
   - Workflow: `prepare-diff` → **stdout summary block** (exact format from spec) → analyze → `findings.json`
   - Local: incremental only when human supplies `Since commit:`; else full from merge-base
   - Fallback warning when incremental requested but `metadata.is_incremental === false`
2. Update `packages/reviewer-runner/src/agent.ts` `buildReviewPrompt`:
   - Pass metadata (source/target/head/since paths) instead of inlined unified diff
   - Point agent at `prepare-diff` script path and skill checklist
3. Update `.cursor/skills/ai-code-review/README.md` with local incremental example (`Since commit: <sha>`).
4. Runner still validates `findings.json` after agent (unchanged contract).

#### Verification

- [ ] SKILL.md documents summary block with examples for incremental and full
- [ ] Prompt includes paths for known-issues + pr-files when built by runner (Phase 7)
- [ ] Manual/local: skill doc is copy-pasteable for `/ai-code-review` + `Since commit`
- [ ] No spec contradictions (grep skill for “runner owns diff”)

---

### Phase 7: Known-issues, post filters, orchestration

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Wire end-to-end CLI: tracking → mode → scope → skip or agent → filter findings → post → advance tracking per rules. |

#### Steps

1. Add `packages/reviewer-runner/src/post-review.ts`:
   - `buildKnownIssuesJson(inlineComments)` → `{ issues: [{ file, line, message }] }`
   - `filterFindingsForPost(report, prFiles, knownIssues)` → drop ∉ prFiles; drop matching `(file, line)`
2. Refactor `packages/reviewer-runner/src/cli.ts`:
   - Use `GITHUB_HEAD_SHA` for tracking and review `commit_id` (not `GITHUB_SHA` alone)
   - Flow per spec diagram: list comments → tracking → validate → scope → skip?
   - **Skip path:** log `[review] skip: <reason>`; upsert tracking to head; exit 0; no agent
   - **Agent path:** write temp known-issues + pr-files; `runReviewAgent` with new prompt; parse findings; filter; post inline
   - **Advance rules:** advance on skip or successful findings read; **no** advance on agent error or post failure
   - Flags: `--skip-agent` (scope + tracking only), existing `--dry-run`
3. **RED→GREEN:** orchestration tests with mocked github/git/agent modules:
   - Agent throws → tracking not updated
   - Skip pure sync → tracking updated, agent not called
   - Post throws after agent → tracking not updated
4. Remove or gate legacy `getUnifiedDiff` injection for CI path (agent uses skill + prepare-diff only).

#### Verification

- [ ] `npm test -w reviewer-runner` passes (orchestration + filter tests)
- [ ] `npm run build -w reviewer-runner` && `node dist/cli.js --dry-run --skip-agent` logs mode/skip/tracking payload (with mocked env fixtures documented in test)
- [ ] Dedup test: known `(file,line)` suppressed
- [ ] prFiles filter test: out-of-scope finding dropped

---

### Phase 8: Workflow, package scripts, docs

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | CI env documented and aligned; human can validate on a real PR per spec checklist. |

#### Steps

1. Confirm `.github/workflows/ai-code-review.yml`:
   - Retains `opened` / `synchronize`, `fetch-depth: 0`
   - Env documents `GITHUB_HEAD_SHA` as tracking SHA (already set; add comment if helpful)
2. Update `packages/reviewer-runner/README.md`: incremental behavior, `--skip-agent`, dry-run, tracking marker.
3. Update root `AGENTS.md` if new paths appear (`scripts/prepare-diff.ts`).
4. Manual E2E on test PR (human): open → incremental push → merge-base-only push → rebase; verify tracking text and logs.

#### Verification

- [ ] Workflow file unchanged in triggers/permissions except comments/env clarity
- [ ] Spec **Validation checklist** manual items documented in PR or plan Notes with dates
- [ ] CI log spot-check: diff summary block on incremental + full run (human)
- [ ] Single canonical tracking comment (no duplicates after multiple pushes)

---

### Phase 9: Validation handoff

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | All acceptance criteria checked; ready for `/validate` and spec status **Done**. |

#### Steps

1. Walk spec acceptance criteria and validation checklist; tick in spec when satisfied.
2. `npm test` at repo root passes.
3. Update `.agents/AGENTS.md` spec row → **Done** only after `/validate`.

#### Verification

- [ ] All spec **Acceptance criteria** satisfied
- [ ] `npm test` passes at root
- [ ] Out-of-scope items not partially built (DB, Bitbucket, local runner `--since`, severity filter)

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/tracking.ts` | Create |
| `packages/reviewer-runner/src/tracking.test.ts` | Create |
| `packages/reviewer-runner/src/git-scope.ts` | Create |
| `packages/reviewer-runner/src/git-scope.test.ts` | Create |
| `packages/reviewer-runner/src/post-review.ts` | Create |
| `packages/reviewer-runner/src/post-review.test.ts` | Create |
| `packages/reviewer-runner/src/github.ts` | Extend (issue comments, upsert tracking, list inline) |
| `packages/reviewer-runner/src/agent.ts` | Update prompt contract |
| `packages/reviewer-runner/src/cli.ts` | Refactor orchestration |
| `packages/reviewer-runner/src/diff.ts` | Narrow or keep for local `--base`/`--head` dev only |
| `packages/reviewer-runner/src/index.ts` | Export new public APIs as needed |
| `packages/reviewer-runner/fixtures/**` | Add tracking comments, pr-files samples |
| `.cursor/skills/ai-code-review/scripts/prepare-diff.ts` | Create |
| `.cursor/skills/ai-code-review/scripts/prepare-diff.test.ts` | Create (or test via runner vitest include) |
| `.cursor/skills/ai-code-review/SKILL.md` | Update (prepare-diff, summary, local since) |
| `.cursor/skills/ai-code-review/README.md` | Update |
| `.github/workflows/ai-code-review.yml` | Minor comments/env clarity |
| `packages/reviewer-runner/README.md` | Update |
| `AGENTS.md` | Update if new skill script path |
| `.agents/AGENTS.md` | Status → Done after validate |

## Out of scope for this plan

- Bitbucket / GitLab, external DB, evals harness, subagents
- Runner `--since` for local fake tracking; auto-resolve old inline comments
- `.ai-review-ignore` file; `Reviewer:` version in tracking comment
- Severity threshold for posting; known-issues message truncation
- Publishing skill to global registry

## Notes

- **Spec gaps:** None blocking; open questions table fully **Resolved**.
- **MVP delta:** Runner currently injects full `git diff` in prompt and uses `GITHUB_SHA` for review `commit_id` — Phase 7 must switch to head SHA + skill-driven `prepare-diff` (spec § API / events).
- **TDD:** Phases 1–5 and 7 use tracer bullets; avoid writing all tests then all implementation.
- **Risk:** Agent must run `prepare-diff` and print summary reliably — mitigate with explicit SKILL checklist and runner validation of `findings.json`; consider logging runner mode before `Agent.send`.
- **prepare-diff tests:** Prefer importing TS module from vitest over shelling out, except one smoke exec test optional.

## Changelog

| Date | Change |
|------|--------|
| 2026-05-30 | Initial plan from spec (9 phases, acceptance mapping) |
| 2026-05-30 | Phase 1 done: `tracking.ts` parse/format/select + unit tests |
| 2026-05-30 | Phase 2 done: GitHub tracking upsert + inline listing (`github.ts`) |
| 2026-05-30 | Phase 3 done: SHA validation + `resolveReviewMode` (`git-scope.ts`) |
