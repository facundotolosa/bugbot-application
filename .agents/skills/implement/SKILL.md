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
6. **STOP.** Do not start the next phase yet (see **Pause between phases**).
7. When the human confirms they want to continue, repeat from step 1 until all phases `done`, then set **Plan status** → `Done`.

## Scope discipline

- Implement only what the current phase and spec require.
- Do not start the next phase until the current phase verification passes **and** the human confirms to continue (unless human explicitly overrides).

## Pause between phases

After **each** phase completes verification:

1. **Stop** — do not pick up or begin the next phase in the same turn.
2. Summarize what was implemented in that phase (brief).
3. Suggest **one** commit message for the human (see **Commit message**).
4. Tell the human to commit when ready, then confirm to continue with the next phase.
5. Wait for explicit confirmation (e.g. "committed, continue", "siguiente fase", "go") before resuming at step 1 of **Workflow**.

If the human asks to implement multiple phases in one session, still **stop after each phase** unless they explicitly say to batch commits or skip the pause.

## Commit message

After **each** phase (not only at the end), suggest **one** commit message:

- Brief, concise, **English**
- Imperative mood; use a conventional prefix when it fits (`feat`, `fix`, `chore`, …) and scope when useful
- Focus on **why** / what the phase delivered, not a file list
- Do **not** run `git commit` unless the human asks

Example: `feat(reviewer-runner): add GitHub inline comment publisher`

When all phases are `done`, run `/validate`; if PASS, you may suggest a final commit only if there are still uncommitted changes from validation fixes.

## Done when

- All plan phases `done` and verifications checked.
- Tests required by the phase/spec pass.
- Human has committed (or chosen not to) after each phase pause.
- `/validate` PASS when the full plan is complete.
