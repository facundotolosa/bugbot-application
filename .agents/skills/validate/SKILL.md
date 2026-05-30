---
name: validate
description: Validates that a spec was implemented correctly using the spec validation checklist and acceptance criteria. Produces a pass/fail report. Use when running /validate after /implement or before marking a spec Done.
disable-model-invocation: true
---

# Validate → spec sign-off

## When to use

Implementation is claimed complete; human runs `/validate` before marking the spec **Done**.

## Inputs

`.agents/specs/<name>/spec.md` (required)  
`.agents/specs/<name>/plan.md` (required — all phases should be `done`)

## Workflow

1. Read **Product summary**, **Acceptance criteria**, and **Validation checklist** from `spec.md`.
2. Read `plan.md` — confirm every phase `Status` is `done` and verification items are checked.
3. Run automated checks when applicable (`npm test`, `npm run build`, commands named in spec/plan).
4. For each **acceptance criterion** and **validation checklist** item, mark pass/fail with evidence (command output, file path, behavior observed).
5. Report to the human:

```markdown
# Validation: <feature name>

**Spec:** `.agents/specs/<name>/`
**Result:** PASS | FAIL

## Acceptance criteria
- [x] … — evidence
- [ ] … — what failed

## Validation checklist
- [x] …
- [ ] …

## Plan phases
- Phase N: done / blocked — notes

## Open questions
- Any still `Open` that block release?

## Recommended next steps
- (fixes if FAIL, or mark spec Done if PASS)
```

6. On **PASS** (human confirms): set spec **Status** → `Done` in `.agents/AGENTS.md`.
7. On **FAIL**: do not mark Done; list concrete fixes and whether to re-run `/implement`.

## Rules

- Do not mark the spec Done without human confirmation after a PASS report.
- Validation checklist in the spec is the source of truth; add missing checks to the spec via `/brainstorm` if gaps are found.
