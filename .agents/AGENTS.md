# `.agents/` — Agent workspace

Conventions, skills, and specs for SDD + TDD development. **Update this index** when you add or rename files here.

### conventions/

| File | Read when |
|------|-----------|
| [`conventions/concise-responses.md`](conventions/concise-responses.md) | You are replying to the human in chat (not writing code or specs). |
| [`conventions/clean-code.md`](conventions/clean-code.md) | You are writing or reviewing implementation code in `src/`. |
| [`conventions/commit-name-convention.md`](conventions/commit-name-convention.md) | You are suggesting a commit message to the human. |

### skills/

| Skill | Use when |
|-------|----------|
| [`skills/brainstorm/SKILL.md`](skills/brainstorm/SKILL.md) | Starting a feature: `/brainstorm` — draft or iterate `spec.md` with project context and open questions. |
| [`skills/plan/SKILL.md`](skills/plan/SKILL.md) | Spec exists: `/plan` — phased, verifiable `plan.md` from the spec. |
| [`skills/implement/SKILL.md`](skills/implement/SKILL.md) | Plan approved: `/implement` — execute phases, mark plan progress, verify each phase. |
| [`skills/validate/SKILL.md`](skills/validate/SKILL.md) | Implementation done: `/validate` — checklist against spec before marking Done. |
| [`skills/tdd/SKILL.md`](skills/tdd/SKILL.md) | Writing or changing behavior in code (used by `/implement`). |
| [`skills/read-gh-ai-reviewer-logs/SKILL.md`](skills/read-gh-ai-reviewer-logs/SKILL.md) | User passes an Actions job URL — fetch filtered AI Code Review logs (`Build reviewer-runner`, `Run AI code review` only). |

### specs/

Each feature: `.agents/specs/<id>-<slug>/spec.md` + `plan.md`.

| Folder | About | Status |
|--------|-------|--------|
| [`specs/_template/`](specs/_template/) | Boilerplate for `spec.md` and `plan.md`. | — |
| [`specs/01-mvp-foundation/`](specs/01-mvp-foundation/) | MVP: `ai-code-review` skill, fixture app, `reviewer-runner`, GitHub PR comments. [plan.md](specs/01-mvp-foundation/plan.md) | Done |
| [`specs/02-incremental-review/`](specs/02-incremental-review/) | Incremental PR reviews: tracking comment, scoped diffs, skip rules, dedup. [plan.md](specs/02-incremental-review/plan.md) | Done |
| [`specs/03-specialized-analyzers/`](specs/03-specialized-analyzers/) | Orchestrator + parallel security/performance subagents, invocation criteria, merge to findings v2 + enriched inline comments. [plan.md](specs/03-specialized-analyzers/plan.md) | Done |
| [`specs/04-validator-subagent/`](specs/04-validator-subagent/) | Validator subagent: 5-phase funnel between analyzer merge and findings v2; runner PR-only post filter. [plan.md](specs/04-validator-subagent/plan.md) | Done |
| [`specs/05-pipeline-observability/`](specs/05-pipeline-observability/) | Pipeline observability: wrapper logger, orchestrator progress blocks, SDK stream prefix, run artifacts for CI/local. [plan.md](specs/05-pipeline-observability/plan.md) | Implemented (pending `/validate`) |
| [`specs/06-evals-harness/`](specs/06-evals-harness/) | `evals/` golden cases: E2E orchestrator, analyzer + validator component evals, invocation parity with production Task prompts. [plan.md](specs/06-evals-harness/plan.md) | In progress |
| [`specs/07-review-progress-ux/`](specs/07-review-progress-ux/) | Mandatory TodoWrite (local), English-only concise narration, ephemeral temp IPC files (no `work/` clutter). [spec.md](specs/07-review-progress-ux/spec.md) · [plan.md](specs/07-review-progress-ux/plan.md) | Done |
| [`specs/08-reviewer-runner-src-layout/`](specs/08-reviewer-runner-src-layout/) | Modular `packages/reviewer-runner/src/` folders by domain; stable public API; update evals/skill deep imports. [spec.md](specs/08-reviewer-runner-src-layout/spec.md) · [plan.md](specs/08-reviewer-runner-src-layout/plan.md) | Done |
| [`specs/09-evals-console-reporter/`](specs/09-evals-console-reporter/) | Vitest-style `npm run eval` console: quiet agent stream, suite/case tree, spinner, concise failure lines. [plan.md](specs/09-evals-console-reporter/plan.md) | In progress |
| [`specs/10-comment-feedback-footer/`](specs/10-comment-feedback-footer/) | Demo placeholder footer on inline PR comments: “Was this comment useful?” + inert 👍/👎 links. [spec.md](specs/10-comment-feedback-footer/spec.md) | Pending |

## Spec workflow

```
/brainstorm  →  spec.md (+ open questions, acceptance criteria, validation checklist)
     ↓
/plan        →  plan.md (phased, each phase verifiable)
     ↓
/implement   →  src/ + plan phases marked done (uses tdd + clean-code)
     ↓
/validate    →  sign-off via spec validation checklist → Status: Done
```

1. Copy `specs/_template/` only when creating structure manually; `/brainstorm` usually creates the folder + `spec.md`.
2. Human approves spec before `/plan`; approves plan before `/implement`.
3. Update this index when adding a spec folder.
4. Update root [`AGENTS.md`](../AGENTS.md) when new top-level project paths appear.
