# Plan: Validator subagent (findings funnel)

**Spec:** [spec.md](./spec.md)  
**Plan status:** In progress

## Prerequisites

- [x] Spec reviewed; all open questions **Resolved** in spec (no blockers)
- [ ] Human approves this plan before `/implement`
- [x] Specs 01–03 delivered: orchestrator skill, security/performance analyzers, `merge-findings.ts`, schema v2, incremental `prepare-diff` + tracking
- [x] Node.js **20+**, npm workspaces; `npm test -w reviewer-runner` includes `.cursor/skills/ai-code-review/scripts/**/*.test.ts`
- [x] `.ai-code-review/` gitignored; runner builds `known-issues.json` today (`post-review.ts`)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| `.cursor/agents/ai-code-review-validator.md` + five-phase funnel, tool restrictions | 3 |
| Reference docs: `severity-guidelines.md`, `root-cause-dedup.md`, `false-positive-filters.md` | 3 |
| `category` removed from analyzers + merge/intermediate types | 2 |
| Orchestrator: merge raw → validator → `findings.json`; skip when raw empty | 5 |
| Validator Task prompt exactly three data lines | 5 |
| Missing/invalid validator output → abort; CI fails; no unvalidated posts | 4, 5 |
| `filter_summary` without `after_ticket_crossref`; copy + stdout funnel line | 4, 5 |
| Validated output maps to schema v2 (`Finding` fields only) | 4 |
| Cross-analyzer dedup in validator phase 1, not merge script | 2, 3 (agent docs) |
| `filterFindingsForPost` PR file scope only | 1 |
| Spec 02 incremental flow tests still green | 1, 6 |

## Phases

_Each phase is a vertical slice (TDD tracer bullets where code changes). Deterministic parsing/mapping lives in `.cursor/skills/ai-code-review/scripts/` and runs under `npm test -w reviewer-runner`._

---

### Phase 1: Runner `filterFindingsForPost` — PR files only

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Known-issues dedup moves to validator phase 3; runner only drops findings whose `file` is outside the PR file set. |

#### Steps

1. **RED→GREEN** in `packages/reviewer-runner/src/post-review.test.ts`:
   - Replace test *"drops findings outside prFiles and duplicate file-line keys"* with behavior: drops out-of-PR files only; **keeps** finding at `(file, line)` even when that key exists in `knownIssues`.
2. **GREEN** in `post-review.ts`:
   - Remove `knownIssues` parameter from `filterFindingsForPost` (or ignore it if kept temporarily for call-site migration — prefer signature change in same phase).
   - Filter: `prFiles.has(finding.file)` only; preserve existing `line == null` passthrough.
3. Update `orchestrate-review.ts` call site and `index.ts` re-exports if signature changes.
4. Grep runner for other `filterFindingsForPost` callers/tests; align fixtures.

#### Verification

- [x] `npm test -w reviewer-runner` passes (`post-review.test.ts`, orchestration tests)
- [x] `filterFindingsForPost` has no `(file, line)` vs known-issues logic
- [x] `buildKnownIssuesJson` unchanged; runner still writes `.ai-code-review/known-issues.json` for the orchestrator/validator

#### Notes

- `knownIssues` variable in `orchestrate-review.ts` remains for writing JSON; only post-time filtering changes.

---

### Phase 2: Remove `category` from analyzer pipeline

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Intermediate and merged findings use only v2 fields; analyzers no longer document or emit `category`. |

#### Steps

1. **RED→GREEN** in `merge-findings.ts`:
   - Remove `category?: string` from `AnalyzerFinding`.
   - Optionally strip unknown keys in `validateIntermediateFinding` (or leave ignored — no `category` in type).
2. Update `merge-findings.test.ts`: remove/replace *"drops category from merged findings"* with test that merged items never include `category` when absent from input (regression guard).
3. Edit `.cursor/agents/ai-code-review-security-analyzer.md` and `ai-code-review-performance-analyzer.md`:
   - Remove `category` prose, JSON example field, and table row.
4. Grep `.cursor/skills/ai-code-review/` and `packages/reviewer-runner/` for `category` in review artifacts; fix samples if any.

#### Verification

- [x] `npm test -w reviewer-runner` passes (`merge-findings.test.ts`)
- [x] `rg 'category' .cursor/agents/ai-code-review-*.md .cursor/skills/ai-code-review/` shows no finding-level `category` (ledger-lite excluded)
- [x] `mergeAnalyzerOutputs` output still validates via `parseFindingsJson`

#### Notes

- Merge script **still does not** cross-analyzer dedup (concat only) — unchanged from spec 03.

---

### Phase 3: Validator agent + reference docs

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Subagent definition and three reference files exist so the orchestrator can invoke a documented five-phase funnel. |

#### Steps

1. Create `.cursor/skills/ai-code-review/references/severity-guidelines.md`:
   - Definitions for `critical` \| `major` \| `minor` \| `enhancement`; calibration rules (speculative → enhancement, critical bar, lower between two levels, test cap, null-check on non-nullable).
   - Emoji table aligned with `packages/reviewer-runner/src/comments.ts` (`SEVERITY_EMOJIS`).
2. Create `references/root-cause-dedup.md`:
   - Exact dedup rules (same file+line; ≤3 lines + same defect).
   - Cluster merge: same file, `|Δline| ≤ 3`, root-cause key from `issue` + `analyzer` (document example keys: `auth_bypass`, `injection`, `n_plus_one`, etc.).
   - Tie-break: severity → specificity → **security > performance**; do not merge unrelated symbols on same line.
3. Create `references/false-positive-filters.md`:
   - Table from spec (hooks/i18n, TS nullable, missing import, signature not in diff, Playwright races, test downgrade, placeholders, etc.).
   - Phase 4 verification strategies (input trace, auth middleware, error handling, null types, PII, performance hot path) + default 4-step trace / DROP|KEEP|downgrade rules.
4. Create `.cursor/agents/ai-code-review-validator.md`:
   - Frontmatter: `name: ai-code-review-validator`, `model: composer-2.5`, description per spec.
   - MANDATORY: read all Task paths + three reference files **before** any output; tools Read/Grep/Write only; Write only to declared output path; no Edit/Shell.
   - Phase order 1→5 with counters matching `filter_summary` keys (no `after_ticket_crossref`).
   - Output schema: `findings[]` (with `emoji`) + required `filter_summary`.
   - Chat: reply exactly `Done` after Write.

#### Verification

- [x] Files exist at paths above
- [x] Agent references all three docs by repo-relative path under `.cursor/skills/ai-code-review/references/`
- [x] `rg 'after_ticket_crossref|codebase-patterns' .cursor/agents/ai-code-review-validator.md .cursor/skills/ai-code-review/references/` — no matches
- [x] Manual: frontmatter `name` matches Task `subagent_type` `ai-code-review-validator`

#### Notes

- Funnel behavior is **agent-executed** (LLM); this phase is contract/docs only — no unit test for dedup logic itself.

---

### Phase 4: Validator I/O scripts (parse, map, empty path)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Deterministic TypeScript helpers for orchestrator/skill docs: validate validator JSON, map to v2 `findings.json`, zeroed summary when raw is empty. |

#### Steps

1. **RED→GREEN** — new `scripts/validator-output.ts`:
   - `FilterSummary` type with keys: `raw_input`, `after_exact_dedup`, `after_root_cause_dedup`, `after_dedup`, `after_fp_filters`, `after_known_issues`, `after_verification`, `final_output` (all numbers; **no** `after_ticket_crossref`).
   - `parseValidatorOutput(json: unknown)` — validates structure, non-empty `issue`/`suggestion`, valid `analyzer`/`severity`, optional `emoji` allowed on intermediate items.
   - `mapValidatorToFindingsReport(output)` → `{ version: "2", findings }` stripping `emoji` from each finding.
   - `zeroedFilterSummary()` for empty raw path.
2. **RED→GREEN** — `scripts/validator-output.test.ts`:
   - Valid fixture → v2 report passes `parseFindingsJson`.
   - Missing `filter_summary` / wrong keys → throw.
   - `emoji` not present on mapped v2 findings.
3. Document in skill (Phase 5) optional `npx tsx` one-liners using these modules (same pattern as `merge-findings.ts`).

#### Verification

- [x] `npm test -w reviewer-runner` passes (`validator-output.test.ts`)
- [x] `mapValidatorToFindingsReport` output has no extra fields required by `Finding` type
- [x] `zeroedFilterSummary()` returns all counters `0`

#### Notes

- `raw-findings.json` uses existing `mergeAnalyzerOutputs` result (`version: "2"`, `findings[]`) written to `.ai-code-review/work/raw-findings.json` — no new merge algorithm in this phase.

---

### Phase 5: Orchestrator skill — validator pipeline

| Field | Value |
|-------|--------|
| **Status** | `in progress` |
| **Goal** | Skill workflow runs validator after merge when raw findings non-empty; fail closed on validator errors; log funnel summary. |

#### Steps

1. Update architecture mermaid + responsibility table in `.cursor/skills/ai-code-review/SKILL.md` (match spec diagram: merge raw → validator → `findings.json`).
2. Replace final merge-to-`findings.json` step with:
   - Merge analyzer outputs → write `.ai-code-review/work/raw-findings.json` (v2 shape via `mergeAnalyzerOutputs`).
   - If `findings.length === 0`: write empty `.ai-code-review/findings.json`; write `work/validator-summary.json` from `zeroedFilterSummary()`; **do not** launch validator Task.
   - Else: ensure `known-issues.json` path from runner prompt; launch **one** validator Task (no retry).
3. Validator Task prompt — **exactly three lines** (data only):

   ```text
   Read findings from: .ai-code-review/work/raw-findings.json
   Read known issues from: .ai-code-review/known-issues.json
   Write output to: .ai-code-review/work/validator-output.json
   ```

   `subagent_type`: `ai-code-review-validator`.
4. Collect output: read `work/validator-output.json` only; `parseValidatorOutput`; on missing/invalid → **abort** (do not write unvalidated `findings.json`; do not retry validator).
5. `mapValidatorToFindingsReport` → write `.ai-code-review/findings.json`; copy `filter_summary` → `work/validator-summary.json`.
6. Stdout: one line `Validator funnel: <raw_input> → <final_output>`.
7. Update file contract table (`raw-findings.json`, `validator-output.json`, `validator-summary.json`).
8. Update **Known issues** section: runner builds JSON for validator; orchestrator does not dedupe at merge; runner PR-only filter (Phase 1).
9. Remove validator from **Out of scope**; clarify analyzer retry (once) vs validator retry (none).
10. Update `references/invocation-criteria.md` if it still says runner-only known-issues filtering at post time.

#### Verification

- [ ] SKILL.md checklist steps 9+ match spec workflow (raw → validator → v2)
- [ ] Validator prompt in doc is exactly three lines (grepable)
- [ ] Doc states: validator failure = abort, no `findings.json` from raw merge
- [ ] `rg 'filterFindingsForPost' .cursor/skills/ai-code-review/SKILL.md` — describes PR-scope only at runner

#### Notes

- CI failure on validator abort is implicit: orchestrator agent throws/exits non-zero → `orchestrate-review.ts` already rethrows agent errors without advancing tracking (`executeReviewOrchestration`).

---

### Phase 6: End-to-end verification + index

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Full test suite green; spec validation checklist runnable; project indexes reflect validator feature. |

#### Steps

1. Run full `npm test -w reviewer-runner` and `npm run build -w reviewer-runner`.
2. Walk spec **Validation checklist** (manual where needed):
   - Local dry-run with fixture raw findings → validator Task (or mocked `validator-output.json`) → v2 file.
   - Empty raw → no validator Task; zeroed `validator-summary.json`.
3. Update `packages/reviewer-runner/README.md` artifact table if it lists only pre-validator paths.
4. Confirm incremental tests (`prepare-diff`, orchestration) still pass without changes to their contracts.

#### Verification

- [ ] `npm test -w reviewer-runner` — all tests pass
- [ ] `npm run build -w reviewer-runner` succeeds
- [ ] Spec acceptance criteria checkboxes can be ticked after human `/validate`
- [ ] No `category` in `.ai-code-review` examples under skill `examples/` (if present)

#### Notes

- Actions log line `Validator funnel: N → M` verified in CI after merge to main branch workflow — optional manual check on next PR.

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/post-review.ts` | Modify — PR-only filter |
| `packages/reviewer-runner/src/post-review.test.ts` | Modify |
| `packages/reviewer-runner/src/orchestrate-review.ts` | Modify — call signature |
| `packages/reviewer-runner/src/index.ts` | Modify — export if needed |
| `.cursor/skills/ai-code-review/scripts/merge-findings.ts` | Modify — remove `category` |
| `.cursor/skills/ai-code-review/scripts/merge-findings.test.ts` | Modify |
| `.cursor/skills/ai-code-review/scripts/validator-output.ts` | Create |
| `.cursor/skills/ai-code-review/scripts/validator-output.test.ts` | Create |
| `.cursor/skills/ai-code-review/references/severity-guidelines.md` | Create |
| `.cursor/skills/ai-code-review/references/root-cause-dedup.md` | Create |
| `.cursor/skills/ai-code-review/references/false-positive-filters.md` | Create |
| `.cursor/agents/ai-code-review-validator.md` | Create |
| `.cursor/agents/ai-code-review-security-analyzer.md` | Modify — remove `category` |
| `.cursor/agents/ai-code-review-performance-analyzer.md` | Modify — remove `category` |
| `.cursor/skills/ai-code-review/SKILL.md` | Modify — validator pipeline |
| `.cursor/skills/ai-code-review/references/invocation-criteria.md` | Modify — known-issues ownership |
| `packages/reviewer-runner/README.md` | Modify — artifact paths (optional) |
| `.agents/AGENTS.md` | Modify — spec 04 status |

## Out of scope for this plan

- `evals/` harness, workflow artifact upload for `filter_summary`
- Ticket cross-ref, `codebase-patterns.md`, new analyzers, batching
- Automatic retry of validator Task
- Implementing funnel logic in TypeScript (stays in validator subagent)
- Git hosts other than GitHub

## Changelog

| Date | Change |
|------|--------|
| 2026-05-30 | Initial plan from spec 04-validator-subagent |
