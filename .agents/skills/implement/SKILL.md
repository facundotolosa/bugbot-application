---
name: implement
description: Implements plan.md phases one at a time, verifies each phase, and marks plan status done. Use when running /implement or executing an approved spec plan.
disable-model-invocation: true
---

# Implement → code + plan progress

## When to use

`spec.md` and approved `plan.md` exist; human runs `/implement` (optionally for one phase).

## Before coding

Read `.agents/specs/<name>/spec.md` and `plan.md`.

## TDD

When a phase adds or changes behavior in `src/`, follow [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md): red-green-refactor, vertical slices, tests through public interfaces.

## Workflow

1. Pick the **next** phase with `Status` ≠ `done` (or the phase the human named).
2. Set phase **Status** → `in progress` in `plan.md`.
3. Execute **Steps**; run **Verification** checks (tests, lint, manual steps listed).
4. When verification passes:
   - Check all verification `- [ ]` → `- [x]`
   - Set phase **Status** → `done`
   - Append **plan.md** Changelog
5. Update **spec.md** Changelog if behavior or scope changed during impl.
6. Repeat until all phases `done`, then set **Plan status** → `Done`.

## Scope discipline

- Implement only what the current phase and spec require.
- Do not start the next phase until the current phase verification passes (unless human explicitly overrides).

## Commit

After all plan phases are `done` **and** `/validate` reports **PASS**, suggest **one** commit message for the human:

- Brief, concise, **English**
- Imperative mood; use a conventional prefix when it fits (`feat`, `fix`, `chore`, …) and scope when useful
- Focus on **why**, not a file list
- Do **not** run `git commit` unless the human asks

Example: `chore(agents): add SDD workflow skills and spec templates`

## Done when

- All plan phases `done` and verifications checked.
- Tests required by the phase/spec pass.
- `/validate` PASS and commit message suggested (if there are changes to commit).
