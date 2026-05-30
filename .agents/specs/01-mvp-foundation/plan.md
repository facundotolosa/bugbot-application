# Plan: MVP — AI Code Review (skill + fixture + GitHub pipeline)

**Spec:** [spec.md](./spec.md)  
**Plan status:** Done (E2E confirmed on GitHub, 2026-05-30)

## Prerequisites

- [x] Spec reviewed; all open questions **Resolved** in spec (2026-05-30)
- [x] Human approves this plan before `/implement` (via `/implement`)
- [x] `CURSOR_API_KEY` in GitHub Actions secrets (required for live CI agent run; workflow ready)
- [x] Node.js **20+** and **npm** installed
- [x] GitHub repo with Actions enabled (`bugbot-application` only for MVP)

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| `.cursor/skills/ai-code-review/SKILL.md` exists with v1 flow | 1 |
| Local flow produces `.ai-code-review/findings.json` | 2 |
| `packages/ledger-lite/` React+TS volume target | 3 |
| `reviewer-runner` builds; unit test maps findings → comment payloads | 4 |
| CI: workflow + ≥1 inline PR comment (`*Problem*` / `Suggested fix:`) | 5–6 |
| Secrets documented | 6 |
| Root `AGENTS.md` lists real paths | 0, 7 |

## Phases

_Each phase is a vertical slice where possible (TDD for runner logic). Do not start CI until skill + parser are proven._

---

### Phase 0: Monorepo scaffold

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Root npm workspaces and shared ignores so later packages and the skill output path have a home. |

#### Steps

1. Add root `package.json` with `"workspaces": ["packages/*"]` and scripts placeholder (`test` delegates to workspaces).
2. Add root `.gitignore` including `.ai-code-review/` (and usual Node artifacts).
3. Add minimal `README.md` fragment or root note pointing to spec/plan (secrets section stub OK until Phase 6).
4. Confirm root `AGENTS.md` table matches planned paths (update “Planned” → real names only when paths exist; final pass in Phase 7).

#### Verification

- [x] `npm install` succeeds at repo root
- [x] `packages/` directory exists (may be empty until Phase 3–4)
- [x] `.ai-code-review/` is gitignored

#### Notes

- No `pnpm` in MVP (spec Q11: **npm workspaces**).
- Stack for runner: **TypeScript + Vitest** (align with root `AGENTS.md` default).

---

### Phase 1: `ai-code-review` skill (v1)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Product skill at `.cursor/skills/ai-code-review/` documents diff → analyze → write `.ai-code-review/findings.json`. |

#### Steps

1. Create `.cursor/skills/ai-code-review/SKILL.md` with:
   - Inputs: unified diff text (injected by runner in CI; locally via documented flow), optional PR metadata for report header.
   - Processing: single-pass heuristic scan (bugs, security smells, error handling, naming, large risky hunks).
   - Output: **overwrite** `.ai-code-review/findings.json` with schema `version: "1"` and `findings[]` (`severity`, `file`, `line`, `problem`, `suggestion`).
   - Rule: `line` required for findings intended for GitHub inline comments; omit or skip unresolvable lines.
   - Example JSON (valid + empty findings).
2. Document that runner owns `git diff` in MVP (skill does **not** run `prepare-diff`).
3. Document GitHub comment body template (for human/agent consistency; runner enforces in Phase 4).

#### Verification

- [x] `.cursor/skills/ai-code-review/SKILL.md` exists and describes full v1 flow
- [x] Schema and file path match spec § Skill output contract
- [x] Manual read-through: no references to subagents, evals, or stdout JSON parsing

---

### Phase 2: Local smoke (skill + findings file)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Prove the skill can run locally and produce `.ai-code-review/findings.json` for a real diff in this repo. |

#### Steps

1. Add `.cursor/skills/ai-code-review/README.md` (or section in `SKILL.md`) with **Local invocation** steps:
   - Cursor: attach skill, repo `cwd`, provide diff (`git diff main...HEAD` or paste).
   - Expected artifact: `.ai-code-review/findings.json`.
2. Create a tiny intentional change on a branch (or use existing diff) — e.g. a small `.ts` / `.tsx` file under repo root or early `packages/` stub — sufficient for one finding.
3. Run documented flow once; ensure findings file is created (redact secrets in plan notes if recording output).

#### Verification

- [x] Documented local command / Cursor flow is copy-pasteable
- [x] `.ai-code-review/findings.json` exists after run with `version: "1"` and valid JSON
- [x] At least one finding OR documented empty run (empty `findings: []` acceptable for smoke if diff is clean)

#### Notes

- Does **not** require `ledger-lite` volume yet (spec: skill-first).
- Smoke artifact: `.cursor/skills/ai-code-review/examples/findings.sample.json`; local run also writes gitignored `.ai-code-review/findings.json`.
- Command: `git diff main -- .cursor/skills/ai-code-review/examples/smoke-target.ts` + Cursor skill (see README).

---

### Phase 3: Fixture `packages/ledger-lite/`

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Non-functional React+TS dashboard mock with enough files/lines for realistic PR diffs. |

#### Steps

1. Scaffold `packages/ledger-lite/package.json` (Vite + React 18 + TypeScript).
2. Add structure: `src/pages`, `src/components`, `src/hooks`, `src/api` (mock modules returning hardcoded data).
3. Generate themed UI shells (personal finance dashboard): accounts, transactions, budgets, settings — **no real behavior**.
4. Hit volume target: **~30–50** source files, **~3k–8k LOC** (measure with `find`/`wc`; adjust with additional presentational components if under target).
5. Optional: `npm run build` script present; CI build **not** required for MVP.

#### Verification

- [x] `packages/ledger-lite/` exists under workspace
- [x] `npm install` from root installs ledger-lite deps
- [x] File count: `find packages/ledger-lite/src -name '*.ts' -o -name '*.tsx' | wc -l` ≥ 30 (~48 files after refactor)
- [x] LOC: realistic fixture (`data/`, `utils/`, `constants/`) — no duplicated `formatHelpers*` spam
- [x] No NestJS / no real DB

---

### Phase 4: `reviewer-runner` — findings → GitHub comments (TDD)

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | TypeScript package that validates findings JSON and maps each finding to inline review comment payloads (body template only; no network yet). |

#### Steps

1. Create `packages/reviewer-runner/package.json`, `tsconfig.json`, Vitest config, `src/` entry layout.
2. **Tracer bullet (RED→GREEN):** test loads fixture `findings.json` → expects one comment body matching:
   ```
   *Problem*
   {problem}

   Suggested fix: *{suggestion}*
   ```
3. Implement public API e.g. `parseFindingsFile(path)` and `toInlineReviewComments(findings)` — skip findings missing `file` or `line`.
4. Add tests: invalid schema rejects; empty findings → empty comments; severity preserved only if needed for future (MVP may ignore in body).
5. Wire root/workspace `npm test` to run Vitest here.

#### Verification

- [x] `npm test` passes in `packages/reviewer-runner`
- [x] `npm run build` (or `tsc`) produces compilable `dist/` for Actions
- [x] Unit test uses committed sample `packages/reviewer-runner/fixtures/findings.json`

#### Notes

- Vertical slice only — **no** Cursor SDK or GitHub API in this phase.
- Follow `.agents/skills/tdd/SKILL.md`: one behavior per RED→GREEN cycle.

---

### Phase 5: `reviewer-runner` — diff, SDK, and publish

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | End-to-end runner: `git diff base...head` → `Agent.prompt` with skill → read findings file → post inline PR review comments. |

#### Steps

1. Implement diff resolution from env (`GITHUB_EVENT_PATH` / `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`) and local flags (`--base`, `--head`) for dev.
2. Run `git diff <base>...<head>`; inject unified diff into prompt; attach **`.cursor/skills/ai-code-review`** skill path per Cursor SDK docs (`@cursor/sdk`, `Agent.prompt`, `local: { cwd }`).
3. After agent completes, read `.ai-code-review/findings.json`; call Phase 4 mapper.
4. Implement GitHub REST: create PR review with **inline comments only** (no summary comment); use `GITHUB_TOKEN`.
5. CLI entry e.g. `node dist/cli.js` or `npm run review` — document in package README.
6. **Integration test (optional/manual):** mock GitHub client; or dry-run mode that prints payloads without POST.

#### Verification

- [x] Local dry-run: diff + parse + printed comment payloads (no API) passes
- [x] With `CURSOR_API_KEY`: full local run on branch produces findings file then mapped comments (E2E via Actions)
- [x] With token + test PR: at least one inline comment appears on diff line (human confirmed on GitHub)
- [x] Comment author is `github-actions[bot]` when run from Actions (human confirmed on GitHub)

#### Notes

- SDK: **`local`** runtime, `fetch-depth: 0` documented for workflow (spec Q5).
- Model id: default `composer-2.5` unless plan notes otherwise during implement.

---

### Phase 6: GitHub Actions workflow

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | CI runs on `pull_request` (`opened`, `synchronize`) and posts inline review comments without manual steps. |

#### Steps

1. Add `.github/workflows/ai-code-review.yml`:
   - `on: pull_request` types `opened`, `synchronize`
   - `permissions: pull-requests: write`, `contents: read`
   - `actions/checkout` with `fetch-depth: 0`
   - Node 20, `npm ci`, build runner, run review CLI
   - `secrets.CURSOR_API_KEY`
2. Document secrets in README: `CURSOR_API_KEY` (required), `GITHUB_TOKEN` (automatic).
3. Open **test PR** (e.g. touches `packages/ledger-lite/` or runner) and confirm workflow green + inline comment.

#### Verification

- [x] Workflow file exists at `.github/workflows/ai-code-review.yml`
- [x] Test PR: workflow completes without manual intervention (human confirmed on GitHub)
- [x] Test PR: ≥1 inline comment with `*Problem*` and `Suggested fix:` substrings (human confirmed on GitHub)
- [x] Finding traceable to `.ai-code-review/findings.json` content (human confirmed on GitHub)

---

### Phase 7: Docs index and validation handoff

| Field | Value |
|-------|--------|
| **Status** | `done` |
| **Goal** | Repo docs and agent indexes match delivered layout; ready for `/validate`. |

#### Steps

1. Update root `AGENTS.md`: replace “Planned” with brief descriptions for `.cursor/skills/ai-code-review/`, `packages/reviewer-runner/`, `packages/ledger-lite/`, `.github/workflows/ai-code-review.yml`.
2. Update `.agents/AGENTS.md` spec row when implementation completes (status **Done** only after `/validate`).
3. Walk spec **Validation checklist**; fix gaps.

#### Verification

- [x] All spec **Acceptance criteria** checkboxes satisfied (CI E2E confirmed on GitHub)
- [x] `npm test` passes at root
- [x] Manual local run noted once (command + redacted sample)
- [x] Out-of-scope items not partially built (subagents, evals, Bitbucket, App auth)

---

## Files (estimate)

| Path | Action |
|------|--------|
| `package.json` | Create (workspaces root) |
| `.gitignore` | Create / update |
| `README.md` | Create / update (secrets, local + CI) |
| `.cursor/skills/ai-code-review/SKILL.md` | Create |
| `.cursor/skills/ai-code-review/README.md` | Create (local invocation) |
| `packages/ledger-lite/**` | Create (Vite React fixture) |
| `packages/reviewer-runner/package.json` | Create |
| `packages/reviewer-runner/tsconfig.json` | Create |
| `packages/reviewer-runner/vitest.config.ts` | Create |
| `packages/reviewer-runner/src/**` | Create (parser, github client, cli) |
| `packages/reviewer-runner/fixtures/findings.json` | Create (test fixture) |
| `.github/workflows/ai-code-review.yml` | Create |
| `AGENTS.md` | Update (paths no longer “Planned”) |
| `.agents/AGENTS.md` | Update (spec status) |

## Out of scope for this plan

- Subagents, multi-pass review, incremental hunk-only review
- Skill-owned `prepare-diff` script
- Webhooks / long-running GitHub App server
- Bitbucket / GitLab
- Custom GitHub bot identity (App / PAT)
- `evals/` harness and metrics
- Functional fixture, E2E, real database, NestJS
- Publishing skill to external registry
- External consumer repos (CI scope = this repo only)

## Notes

- **Spec gaps:** None blocking; all open questions resolved.
- **Delivery order enforced:** Phases 1–2 before 3; Phase 4 before 5; Phase 6 last among code paths.
- **Risk:** CI depends on agent writing findings file reliably — mitigate with explicit skill instructions and runner validation errors if file missing/invalid.

## Changelog

| Date | Change |
|------|--------|
| 2026-05-30 | Initial plan from spec (8 phases, acceptance mapping) |
| 2026-05-30 | `/implement` — monorepo, skill, fixture, runner, workflow |
| 2026-05-30 | Move `ai-code-review` to `.cursor/skills/` for local Cursor registration |
