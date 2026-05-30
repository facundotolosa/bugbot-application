---
name: brainstorm
description: Creates and iterates feature specs from conversation. Analyzes current repo state, captures product intent, scope, acceptance criteria, and open questions. Use when starting a new feature, running /brainstorm, or drafting or refining a spec before planning.
disable-model-invocation: true
---

# Brainstorm → Spec

## When to use

Starting work on a new capability. The human describes intent; you shape and update `spec.md` iteratively.

## Spec location

Create or update:

```
.agents/specs/<kebab-feature-name>/
└── spec.md
```

- Folder name = stable slug (e.g. `01-github-webhook`, `mvp-roadmap`).
- Do **not** create `plan.md` here — that is `/plan`.
- Copy structure from [`specs/_template/spec.md`](../../specs/_template/spec.md).

## Session workflow

1. **Analyze current project state** — `src/`, `package.json`, existing specs under `.agents/specs/`, and relevant code paths.
2. **Clarify product outcome** — Fill **Product summary** first (what success looks like).
3. **Draft scope, behavior, API/events** — Mark unknowns in **Open questions** (do not guess silently).
4. **Acceptance criteria** — Each item must be objectively verifiable.
5. **Validation checklist** — Add spec-specific checks for `/validate` (beyond the template defaults).
6. **Iterate** — On each human turn: update `spec.md`, resolve or add open questions, append **Changelog**.
7. **Index** — Add or update the spec row in `.agents/AGENTS.md` (`About`, `Status`: `Pending` until plan/impl).

## Rules

- Leave **plan.md** absent until `/plan`.
- When analysis reveals constraints (existing modules, stack), reflect them in scope or open questions.

## Done when

- Product summary is clear.
- Scope in/out is explicit.
- Open questions list captures real ambiguity.
- Human is ready to run `/plan` (or explicitly defers questions).
