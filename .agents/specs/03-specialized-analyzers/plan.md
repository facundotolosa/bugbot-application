# Plan: Specialized analyzers (security + performance subagents)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Draft

## Prerequisites

- [x] Spec reviewed; open questions **Resolved** or **Deferred** in spec (no blockers)
- [ ] Human approves this plan before `/implement`
- [x] Spec 02 delivered: incremental `prepare-diff`, tracking, `filterFindingsForPost`, orchestration in `reviewer-runner`
- [x] Node.js **20+**, npm workspaces, `CURSOR_API_KEY` for CI agent runs
- [x] `.ai-code-review/` gitignored; `prepare-diff` tests run via `reviewer-runner` vitest include

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| `.cursor/agents/ai-code-review-{security,performance}-analyzer.md` with aligned `name` | 5 |
| Skill documents orchestrator flow + `references/invocation-criteria.md` | 6 |
| **security** always; **performance** only when heuristics match | 3, 6 |
| Selected analyzers in **one parallel** Task batch | 6 |
| Analyzer Task prompts **two lines only** | 5, 6 |
| Output/JSON failure: **one** retry → then `{ "findings": [] }` | 6 |
| Final report **schema v2** (`analyzer`, `issue`, four severities) | 1, 4, 6 |
| Published comments: 🤖 title + severity emoji + `💡 **Suggestion:**` | 2 |
| Incremental flow unchanged (existing tests green) | 7 |
| Unit tests: invocation criteria + merge | 3, 4 |
| No batching, validator, or extra analyzers | — (out of scope) |

## Phases

_Each phase is a vertical slice (TDD tracer bullets). Deterministic logic lives in `.cursor/skills/ai-code-review/scripts/` and is exercised by `npm test -w reviewer-runner` (same pattern as `prepare-diff`)._

---

### Phase 1: Schema v2 — types and validation

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | `reviewer-runner` accepts only **v2** findings (`version: "2"`, `analyzer`, `issue`, severities `critical` \| `major` \| `minor` \| `enhancement`); v1 rejected. |

#### Steps

1. **RED→GREEN** in `packages/reviewer-runner/src/findings.ts`:
   - `AnalyzerKey = "security" \| "performance"`
   - `Severity` → four v2 values; `Finding` uses `issue` (not `problem`), required `analyzer`, required `line` for inline path
   - `FindingsReport.version` → `"2"`
   - `validateFinding` / `parseFindingsJson` enforce non-empty `issue` and `suggestion`
2. Update `packages/reviewer-runner/fixtures/findings.json` to v2 sample (keep one finding without `line` only if we still test skip-for-inline — spec requires `line` for posting; fixture can omit second finding or mark it skipped in test).
3. Update all in-package test fixtures using v1 (`orchestrate-review.test.ts`, `post-review.test.ts`, `comments.test.ts`) to v2 field names.
4. Reject v1 explicitly: `parseFindingsJson('{"version":"1",...}')` throws.

#### Verification

- [x] `npm test -w reviewer-runner` passes (`findings` / fixture-related tests)
- [x] `parseFindingsJson` accepts minimal valid v2 document from spec
- [x] v1 and unknown `version` throw with clear errors

#### Notes

- Breaking change by design; no dual-version support after this phase.

---

### Phase 2: Inline comment formatting (analyzer + severity)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | `formatCommentBody` produces the spec markdown template; `toInlineReviewComments` uses v2 `Finding` fields. |

#### Steps

1. **RED→GREEN** in `packages/reviewer-runner/src/comments.ts`:
   - `formatCommentBody(finding: Finding)` (or destructure `{ analyzer, severity, issue, suggestion }`)
   - Analyzer titles: `security` → `Security analyzer`, `performance` → `Performance analyzer`
   - Severity emojis on issue line: `critical` 🚨, `major` ⚠️, `minor` 💡, `enhancement` ✨
   - Body shape:
     ```markdown
     🤖 **{Analyzer title}**

     {emoji} {issue}

     💡 **Suggestion:** {suggestion}
     ```
   - Suggestion line always `💡 **Suggestion:**` regardless of severity
2. Update `comments.test.ts` with at least one case per analyzer and one per severity (can table-drive).
3. Fix `orchestrate-review.ts` to pass full v2 report to `toInlineReviewComments` (remove hardcoded `version: "1"` wrapper).

#### Verification

- [x] `npm test -w reviewer-runner` passes (`comments.test.ts`)
- [x] Fixture-driven inline comment body matches spec example structure
- [x] Findings without `line` still skipped for inline mapping

---

### Phase 3: Invocation criteria (`selectAnalyzers`)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Pure function `selectAnalyzers(files)` returns `["security"]` or `["security", "performance"]` per spec v1 heuristics. |

#### Steps

1. Add `.cursor/skills/ai-code-review/scripts/select-analyzers.ts`:
   - `export type AnalyzerKey = "security" | "performance"`
   - `export function selectAnalyzers(files: { path: string; diff: string }[]): AnalyzerKey[]`
   - Always include `security`; append `performance` when **any** file matches path/diff rules from spec § Invocation criteria
2. Add `.cursor/skills/ai-code-review/scripts/select-analyzers.test.ts`:
   - **Negative:** e.g. only `README.md` with cosmetic diff → `["security"]`
   - **Positive path:** e.g. `packages/foo/bar.ts` → includes `performance`
   - **Positive React:** `.tsx` path
   - **Positive diff token:** e.g. `useEffect` in diff
3. Add `.cursor/skills/ai-code-review/references/invocation-criteria.md` — human/agent-readable mirror of spec table (linked from skill).

#### Verification

- [ ] `npm test -w reviewer-runner` includes new `select-analyzers.test.ts` green
- [ ] `selectAnalyzers([])` returns `["security"]` (security always; empty diff edge — orchestrator may skip agent earlier via spec 02, but function is stable)

#### Notes

- Order in returned array: `security` then `performance` (matches recommended log order).
- `heuristics.txt` at repo root is reference-only for authoring analyzer prompts; not imported by code.

---

### Phase 4: Merge analyzer outputs

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `mergeAnalyzerOutputs` concatenates intermediate JSON into a single v2 `FindingsReport` with no cross-analyzer dedup. |

#### Steps

1. Add `.cursor/skills/ai-code-review/scripts/merge-findings.ts`:
   - Types: `AnalyzerOutput { analyzer, findings[] }` matching intermediate schema (`issue`, optional `category`, etc.)
   - `mergeAnalyzerOutputs(outputs: AnalyzerOutput[]): FindingsReport` → `{ version: "2", findings: [...] }`
   - Map each item: copy `analyzer`, `severity`, `file`, `line`, `issue`, `suggestion`; drop `category` from final report
   - **No dedup** across analyzers
   - Treat missing/empty analyzer slot as `{ findings: [] }` when merging skipped analyzers
2. Add `merge-findings.test.ts`:
   - Security-only output → merged length equals security count
   - Both analyzers → concatenated order (security findings before performance if inputs ordered that way)
   - Duplicate `(file, line)` across analyzers → **both** retained
   - Invalid severity in input → throw at merge/validate boundary (or document normalization — prefer strict throw for testability)

#### Verification

- [ ] `npm test -w reviewer-runner` passes merge tests
- [ ] Merged output validates via Phase 1 `parseFindingsJson`

---

### Phase 5: Subagent definitions (`.cursor/agents/`)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Two analyzer agent files with frontmatter `name` matching Task `subagent_type`, fixed `model: composer-2.5`, and narrow domain prompts. |

#### Steps

1. Create `.cursor/agents/ai-code-review-security-analyzer.md`:
   - Frontmatter: `name: ai-code-review-security-analyzer`, `model: composer-2.5`, `description: ...`
   - **MANDATORY** block: Read path from Task prompt; tools Read/Grep/Write; Write **only** to output path
   - Focus: secrets, injection, authz, XSS/CSRF, crypto, PII — exclude performance micro-opts
   - Document input (`metadata` + `files[].diff`) and intermediate JSON schema
   - Close: write pretty JSON → reply `Done` only
2. Create `.cursor/agents/ai-code-review-performance-analyzer.md` — symmetric with performance focus and exclusions per spec cross-analyzer table.
3. Optionally add minimal `category` guidance in prose (free-form v1 per spec Q5).

#### Verification

- [ ] Both files exist under `.cursor/agents/`
- [ ] Frontmatter `name` matches spec examples exactly (Task `subagent_type`)
- [ ] Manual skim: no overlap instructions contradicting spec exclusion table

#### Notes

- Subagents do **not** format GitHub markdown.

---

### Phase 6: Orchestrator skill rewrite

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `ai-code-review` skill coordinates `prepare-diff` → work artifacts → parallel Tasks → merge → `findings.json` v2; single-pass heuristic analysis removed. |

#### Steps

1. Rewrite `.cursor/skills/ai-code-review/SKILL.md`:
   - Replace “single pass” with orchestrator flow (spec diagram)
   - Keep **unchanged**: inputs, `prepare-diff` CLI, mandatory diff summary stdout, incremental warnings, known-issues hints
   - After `prepare-diff`: write `.ai-code-review/work/diff.json` (same shape as prepare-diff output)
   - Run invocation logic (document calling `selectAnalyzers` rules — agent applies same rules as Phase 3 module; optionally `npx tsx` helper script if we add thin CLI wrapper in implement)
   - Log: `Analyzers: security, performance` or `Analyzers: security (skipped: performance)`
   - **Parallel Task batch** for each selected analyzer; `subagent_type` = frontmatter `name`
   - **Two-line prompts only** (read `diff.json`, write `work/{key}-findings.json`)
   - **Collect:** Read output JSON; if missing/invalid → retry once with same prompt → else treat as `{ "findings": [] }`
   - **Merge** via `mergeAnalyzerOutputs` semantics (agent may use Write after computing merge — implementer can add `merge-findings.ts` CLI or inline JSON in agent; tests already cover pure function)
   - Overwrite `.ai-code-review/findings.json` v2; confirm file exists
2. Update `.cursor/skills/ai-code-review/examples/findings.sample.json` to v2.
3. Update `.cursor/skills/ai-code-review/README.md` (local flow, work dir, subagents).
4. Update **Out of scope** section in skill (remove “subagents”; add validator/batching deferred).

#### Verification

- [ ] Skill checklist matches spec orchestrator flow end-to-end
- [ ] `references/invocation-criteria.md` linked from skill
- [ ] No instruction to dump findings in chat; file contract preserved
- [ ] Anti-pattern documented: long Task prompts duplicating `.md` rules

#### Notes

- Orchestrator does **not** filter severity, dedupe, or run validator (explicit in spec).
- Skipped analyzers: no Task; merge uses empty findings for that key.

---

### Phase 7: Runner integration and regression

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `reviewer-runner` reads v2 findings, posts new comment shape, and all spec 02 orchestration tests remain green. |

#### Steps

1. Update `packages/reviewer-runner/src/agent.ts` prompt:
   - Mention orchestrator + subagents at high level (still **one** SDK agent with skill)
   - Expect v2 `findings.json` (not v1 schema text)
2. Ensure `post-review.ts` / `filterFindingsForPost` use `issue` field (type-driven after Phase 1).
3. Refresh `packages/reviewer-runner/README.md` (v2 schema, comment format).
4. Run full workspace tests; fix any drift in `agent.test.ts`, dry-run paths, CLI fixture path if needed.
5. Root `AGENTS.md` — add `.cursor/agents/` row if missing after agents land.

#### Verification

- [ ] `npm test` at repo root passes (all workspaces + skill script tests)
- [ ] `npm run build -w reviewer-runner` succeeds
- [ ] `orchestrate-review.test.ts` and `post-review.test.ts` pass with v2 fixtures
- [ ] No references to v1 `problem` / `info|warning|error` in runner publish path

---

### Phase 8: Manual E2E and `/validate`

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Human sign-off on a real PR run; spec validation checklist complete. |

#### Steps

1. Manual PR (or local `/ai-code-review` on branch with performance signals):
   - Log shows correct `Analyzers:` line
   - `work/security-findings.json` / `work/performance-findings.json` created when applicable
   - Subagents reply `Done` without JSON in chat
2. Confirm inline comments on GitHub match template (analyzer title + emojis).
3. Run `/validate` against spec validation checklist; update spec **Status** → Done only after pass.
4. Update `.agents/AGENTS.md` spec row → **Done**.

#### Verification

- [ ] Spec **Validation checklist** items checked
- [ ] `npm test` passes
- [ ] Manual E2E table in Notes below filled or explicitly deferred with reason

#### Notes

### Manual E2E (human)

| Step | Action | Expected |
|------|--------|----------|
| 1 | PR with only docs change | Log: `Analyzers: security (skipped: performance)`; valid v2 `findings.json` |
| 2 | PR touching `packages/**/*.ts` or `.tsx` | Both analyzers launched; parallel Tasks |
| 3 | Incremental second push | Tracking + `prepare-diff` summary unchanged behavior; v2 findings posted |
| 4 | Simulated bad subagent output | After retry, orchestrator merge continues with `[]` for that analyzer |
| 5 | CI Actions run | Single orchestrator agent; findings file read by runner |

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/findings.ts` | Update (v2 schema) |
| `packages/reviewer-runner/src/comments.ts` | Update (format template) |
| `packages/reviewer-runner/src/comments.test.ts` | Update |
| `packages/reviewer-runner/src/orchestrate-review.ts` | Update (v2 report) |
| `packages/reviewer-runner/src/orchestrate-review.test.ts` | Update fixtures |
| `packages/reviewer-runner/src/post-review.test.ts` | Update fixtures |
| `packages/reviewer-runner/src/agent.ts` | Update prompt (orchestrator mention, v2) |
| `packages/reviewer-runner/fixtures/findings.json` | Update (v2) |
| `.cursor/skills/ai-code-review/scripts/select-analyzers.ts` | Create |
| `.cursor/skills/ai-code-review/scripts/select-analyzers.test.ts` | Create |
| `.cursor/skills/ai-code-review/scripts/merge-findings.ts` | Create |
| `.cursor/skills/ai-code-review/scripts/merge-findings.test.ts` | Create |
| `.cursor/skills/ai-code-review/references/invocation-criteria.md` | Create |
| `.cursor/skills/ai-code-review/SKILL.md` | Rewrite (orchestrator) |
| `.cursor/skills/ai-code-review/README.md` | Update |
| `.cursor/skills/ai-code-review/examples/findings.sample.json` | Update (v2) |
| `.cursor/agents/ai-code-review-security-analyzer.md` | Create |
| `.cursor/agents/ai-code-review-performance-analyzer.md` | Create |
| `packages/reviewer-runner/README.md` | Update |
| `AGENTS.md` | Update (`.cursor/agents/` if new top-level path) |
| `.agents/AGENTS.md` | Status → Done after `/validate` |

## Out of scope for this plan

- Multi-batch `batch-{i}.json` for large PRs
- Validator agent (dedup, category filter, ticket context)
- Analyzers: `logic`, `mongodb`, `ticket`
- Runner changes to tracking/dedup beyond spec 02
- `evals/` metrics harness
- Dynamic analyzer registration in `reviewer-runner` package
- v1 schema backward compatibility

## Notes

- **Spec gaps:** None blocking. Deferred items (known-issues in orchestrator, merge dedup) documented in spec Open questions.
- **Module placement:** `select-analyzers.ts` and `merge-findings.ts` under skill `scripts/` so vitest already includes them via `packages/reviewer-runner/vitest.config.ts` — no new package.
- **TDD:** Phases 1–4 are pure TS tracer bullets; Phases 5–6 are mostly docs/agent definitions with manual verification; Phase 7 wires runner; Phase 8 is human E2E.
- **CI:** `.github/workflows/ai-code-review.yml` unchanged (still one agent + skill); verify after implement.
- **Risk:** Task/subagent availability in CI SDK — mitigate by file-contract + retry-to-empty; runner still fails closed if final `findings.json` missing/invalid.

## Changelog

| Date | Change |
|------|--------|
| 2026-05-30 | Initial plan from spec (8 phases, acceptance mapping) |
| 2026-05-30 | Phase 1 done: schema v2 in `findings.ts`, fixtures and tests migrated; v1 rejected |
| 2026-05-30 | Phase 2 done: `formatCommentBody(Finding)` with analyzer titles and severity emojis |
