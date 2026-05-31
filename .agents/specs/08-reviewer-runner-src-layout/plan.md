# Plan: reviewer-runner `src/` modular layout

**Spec:** [spec.md](./spec.md)  
**Plan status:** Draft

## Prerequisites

- [x] Spec reviewed; open questions **Resolved** (OQ 1–5 in spec)
- [ ] Human approves plan before `/implement`
- [x] `npm test -w reviewer-runner` and `npm test -w evals` green on current `main` / branch (baseline before moves)
- [x] Node.js **20+**, npm workspaces; `tsc` `rootDir: src` unchanged

## Acceptance criteria → phases

| Criterion (spec) | Phase |
|------------------|-------|
| Domain folders under `src/` per target layout | 1–7 |
| `npm run build -w reviewer-runner`; `dist/` mirrors subpaths | 7, 9 |
| `npm test -w reviewer-runner` (unit + contract) | 1–8 (per phase), 9 (full) |
| `index.ts` export surface unchanged | 7 |
| Consumers updated; `npm test -w evals` | 8 |
| Skill script tests via reviewer-runner vitest | 8, 9 |
| README **Source layout** section | 9 |
| No new circular domain deps | 1–7 (import-direction checks), 9 (grep) |
| Stale flat-path deep imports eliminated | 8, 9 |

## Phases

_Move-only refactor: each phase is a vertical slice—move one domain, fix relative imports in moved files and in any remaining flat `src/` modules, then run tests. No new behavior tests; existing suites are the safety net (TDD “green after each slice”)._

---

### Phase 1: `support/` (cross-cutting)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `logger`, `load-repo-env`, and `process-guard` (+ co-located tests) live under `src/support/` with no product-domain imports. |

#### Steps

1. Create `packages/reviewer-runner/src/support/`.
2. `git mv` (or equivalent) `logger.ts`, `logger.test.ts`, `load-repo-env.ts`, `load-repo-env.test.ts`, `process-guard.ts`, `process-guard.test.ts` into `support/`.
3. Fix **intra-support** relative imports (e.g. `load-repo-env.test.ts` → `./load-repo-env.js`).
4. Update **all remaining `src/` files** still at root (and tests) that import these modules to `../support/...` or `./support/...` as appropriate.
5. Confirm `support/` does not import from `agent/`, `github/`, `findings/`, etc.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/support` passes
- [ ] `npm run build -w reviewer-runner` succeeds
- [ ] `rg "from \"\\./(logger|load-repo-env|process-guard)" packages/reviewer-runner/src` — no matches outside `support/` and entry files not yet updated in later phases (re-run full grep in Phase 9)

#### Notes

- `load-repo-env` may import `repo-root` later; if `repo-root` is still flat, keep that import path valid until Phase 2.

---

### Phase 2: `paths/` (run dir + repo root)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `review-run-dir` and `repo-root` (+ tests) live under `src/paths/`. |

#### Steps

1. Create `src/paths/`; move `review-run-dir.ts`, `review-run-dir.test.ts`, `repo-root.ts`, `repo-root.test.ts`.
2. Fix imports inside `paths/` and update consumers still at `src/` root to `../paths/...` or `./paths/...`.
3. Update `support/load-repo-env.ts` if it references `repo-root` (use `../paths/repo-root.js`).

#### Verification

- [ ] `npm test -w reviewer-runner -- src/paths` passes
- [ ] `npm run build -w reviewer-runner` succeeds

---

### Phase 3: `findings/` (schema + comments)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `findings` and `comments` (+ tests) live under `src/findings/` with **no** imports from `github/` or `agent/`. |

#### Steps

1. Create `src/findings/`; move `findings.ts`, `comments.ts`, `comments.test.ts`.
2. Fix internal imports (`comments` → `./findings.js`).
3. Update unmoved modules that import findings/comments (leave `post-review` at flat `src/` until Phase 4).

#### Verification

- [ ] `npm test -w reviewer-runner -- src/findings/comments.test.ts src/findings/comments.ts` passes (or `src/findings` glob once files exist)
- [ ] `findings/findings.ts` and `findings/comments.ts` do not import `github/` or `agent/`

---

### Phase 4: `github/` + `post-review`

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `github` and `tracking` under `src/github/`; `post-review` under `src/findings/` with a one-way import to `github` for `KnownIssue`. |

#### Steps

1. Create `src/github/`; move `github.ts`, `github.test.ts`, `tracking.ts`, `tracking.test.ts`.
2. Move `post-review.ts`, `post-review.test.ts` into `src/findings/`; import `KnownIssue` from `../github/github.js`.
3. Fix `github.ts` imports: `../findings/comments.js`, `../support/logger.js`, `./tracking.js`.
4. Update `git-scope` (still flat) and other consumers of github/tracking/post-review.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/github src/findings/post-review` passes
- [ ] No cycle: `github/` must not import `post-review.ts`; `findings/post-review` may import `github` only

---

### Phase 5: `git/` (scope + diff)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `git-scope` (+ test) and `diff.ts` live under `src/git/`. |

#### Steps

1. Create `src/git/`; move `git-scope.ts`, `git-scope.test.ts`, `diff.ts`.
2. Fix imports: `git-scope` → `../github/github.js`, `../support/logger.js`; tests → `../github/github.js` for tracking types.
3. Update orchestration/agent/cli imports still pointing at flat paths.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/git` passes

---

### Phase 6: `agent/` (SDK + stream + artifacts)

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | `agent`, `agent-stream`, `run-artifacts` (+ tests) live under `src/agent/`. |

#### Steps

1. Create `src/agent/`; move all six files from spec target layout.
2. Fix imports to `../findings/`, `../paths/`, `../support/`, and intra-agent `./agent-stream.js`, `./run-artifacts.js`.
3. Update any remaining flat imports.

#### Verification

- [ ] `npm test -w reviewer-runner -- src/agent` passes

---

### Phase 7: `orchestration/` + root entry points

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Pipeline module under `src/orchestration/`; `cli.ts` and `index.ts` at `src/` root wire domains; **public export list unchanged**. |

#### Steps

1. Create `src/orchestration/`; move `orchestrate-review.ts`, `orchestrate-review.test.ts`.
2. Fix orchestration imports across all domain folders.
3. Update `src/cli.ts` imports to domain subpaths (thin wiring unchanged).
4. Rewrite `src/index.ts` barrel to re-export from subpaths only, e.g. `./findings/findings.js`, `./agent/agent.js`, `./orchestration/orchestrate-review.js`—**same named exports** as pre-refactor (39 export lines / symbols today).
5. Capture baseline if helpful: `git show HEAD:packages/reviewer-runner/src/index.ts` diff should be path-only.

#### Verification

- [ ] `npm test -w reviewer-runner` passes (full package)
- [ ] `npm run build -w reviewer-runner` succeeds; `ls dist/orchestration dist/findings dist/agent` (mirrored layout)
- [ ] Export parity: diff `index.ts` export **names** against pre-refactor (no additions/removals)
- [ ] `npm run review -w reviewer-runner -- --dry-run --skip-agent --base origin/main --head HEAD` from repo root exits 0

---

### Phase 8: `contract/` + external consumers

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | Contract test relocated; all deep imports in spec [Consumers](spec.md#consumers) updated. |

#### Steps

1. Create `src/contract/`; move `skill-contract.test.ts`.
2. Fix `SKILL_DIR`: `join(import.meta.dirname, "../../../../.cursor/skills/ai-code-review")` (one extra `..` vs flat `src/`).
3. Update deep imports:
   - `evals/run.ts` → `../packages/reviewer-runner/src/support/load-repo-env.js`
   - `evals/lib/*` → `findings/findings.js`, `paths/review-run-dir.js`, `agent/agent.js`, `git/git-scope.js`, `support/load-repo-env.js` (per module)
   - `.cursor/skills/ai-code-review/scripts/*` → `.../src/findings/findings.js`
   - `.cursor/skills/ai-code-review/SKILL.md` example: `review-run-dir` path under `src/paths/`
4. Update `evals/lib/invocation.ts` header comment path only (parity comment).

#### Verification

- [ ] `npm test -w reviewer-runner` passes (includes `src/contract` + skill script tests in vitest `include`)
- [ ] `npm test -w evals` passes

---

### Phase 9: Docs + final validation

| Field | Value |
|-------|--------|
| **Status** | `pending` |
| **Goal** | README documents layout; monorepo free of stale flat `src/*.ts` deep imports; sign-off checklist complete. |

#### Steps

1. Add **Source layout** section to `packages/reviewer-runner/README.md` (table: folder → one-line purpose per spec target layout).
2. Run stale-import grep from spec validation checklist.
3. Manual import-direction review (or short note in plan Notes): `support/` → none; `findings/` → no `agent/`; `orchestration/` may depend on all.

#### Verification

- [ ] README contains **Source layout** table
- [ ] `rg 'reviewer-runner/src/(findings|comments|agent|github|git-scope|review-run-dir|load-repo-env|orchestrate-review)\\.js' --glob '!*.md' .` — zero hits at old flat paths (allow historical spec/plan docs if desired; **code** must be clean)
- [ ] `rg 'packages/reviewer-runner/src/[a-z-]+\\.ts' .cursor/skills evals packages/reviewer-runner --glob '*.{ts,tsx,js}'` — zero stale flat imports
- [ ] `npm test -w reviewer-runner` and `npm test -w evals` pass
- [ ] `npm run build -w reviewer-runner` passes
- [ ] Dry-run smoke (same as Phase 7)

---

## Files (estimate)

| Path | Action |
|------|--------|
| `packages/reviewer-runner/src/support/*` | Move from flat `src/` |
| `packages/reviewer-runner/src/paths/*` | Move |
| `packages/reviewer-runner/src/findings/*` | Move |
| `packages/reviewer-runner/src/github/*` | Move |
| `packages/reviewer-runner/src/git/*` | Move |
| `packages/reviewer-runner/src/agent/*` | Move |
| `packages/reviewer-runner/src/orchestration/*` | Move |
| `packages/reviewer-runner/src/contract/skill-contract.test.ts` | Move |
| `packages/reviewer-runner/src/index.ts` | Modify (barrel paths) |
| `packages/reviewer-runner/src/cli.ts` | Modify (import paths) |
| `packages/reviewer-runner/README.md` | Modify (Source layout) |
| `evals/run.ts`, `evals/lib/*.ts` | Modify (deep import paths) |
| `.cursor/skills/ai-code-review/scripts/*.ts` | Modify (deep import paths) |
| `.cursor/skills/ai-code-review/SKILL.md` | Modify (example path) |
| `evals/lib/invocation.ts` | Modify (comment only) |

## Out of scope for this plan

- Behavior, orchestration, posting, logger palette, or agent prompt changes
- Splitting `github.ts` / `git-scope.ts` into smaller files
- `package.json` `exports` subpath map
- `evals/` migrating to `import from "reviewer-runner"` barrel (follow-up PR)
- `ai-review-run-artifacts/` placement / gitignore
- Renaming public types or functions

## Notes

- **Vitest** `include` unchanged (`src/**/*.test.ts` + skill scripts); no config edit expected.
- **Optional doc touch-ups** (not required for acceptance): root `README.md`, `evals/README.md`, `severity-guidelines.md` still mention old flat paths—update only if grep cleanup includes them.
- Use `git mv` where possible to preserve history.

## Changelog

| Date | Change |
|------|--------|
| 2026-05-31 | Initial plan from spec 08 (domain moves bottom-up, consumers Phase 8, README Phase 9) |
