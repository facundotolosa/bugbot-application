---
name: plan
description: Produces a phased implementation plan from an approved spec. Each phase is independently verifiable. Use when running /plan, creating plan.md, or breaking a spec into implementation phases before coding.
disable-model-invocation: true
---

# Plan → plan.md

## When to use

A `spec.md` exists and the human wants an implementation plan before `/implement`.

## Before writing

1. Read the target **spec** in full: `.agents/specs/<name>/spec.md`.
2. Re-read project state (`src/`, tests, dependencies) — same as brainstorm.
3. Read [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md) — phases that write code should be compatible with test-first, vertical slices.

## Output

Create or update in the **same folder** as the spec:

```
.agents/specs/<name>/
├── spec.md   (read-only unless spec gaps found)
└── plan.md   (you write this)
```

Copy structure from [`specs/_template/plan.md`](../../specs/_template/plan.md).

## Workflow

1. Confirm spec folder path with the human if unclear.
2. Map **acceptance criteria** → ordered **phases** (smallest shippable increments).
3. Per phase, define:
   - **Goal** (one sentence)
   - **Steps** (ordered, concrete)
   - **Verification** (commands, tests, or checks — must be runnable/passable)
   - **Status** = `pending`
4. Add **Prerequisites** (spec approved, env, deps).
5. **Files (estimate)** — paths to create/modify.
6. Append **Changelog** on plan changes.
7. Update the spec row in `.agents/AGENTS.md` (`Status` → `In progress` when plan is ready for review).

## Phase rules

- Each phase completes with **verification checkboxes** all satisfied.
- No “horizontal” mega-phases (all tests then all code) — align with TDD vertical slices where applicable.
- If spec has gaps, list them under plan **Notes** or ask to update spec via `/brainstorm` first.

## Spec gaps

If planning reveals missing behavior or API detail, stop and propose spec updates (brainstorm) before finalizing the plan.

## Done when

- Every acceptance criterion maps to at least one phase verification.
- Human approves plan (prerequisite checkbox) before `/implement`.
