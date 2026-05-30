# Severity guidelines

Use when calibrating findings in **Phase 5** of the validator funnel. The runner maps severity to inline comment emojis via `SEVERITY_EMOJIS` in `packages/reviewer-runner/src/comments.ts`.

## Severity definitions

| Severity | When to use |
|----------|-------------|
| **critical** | Confirmed high impact: exploitable path, data loss, auth bypass, or production outage with traceable evidence. No speculation. |
| **major** | Clear failure mechanism that is plausible in production (security flaw, serious perf regression, correctness bug). |
| **minor** | Real issue with bounded impact or narrow blast radius. |
| **enhancement** | Nice-to-have improvement, style, or speculative hardening—not a definite defect. |

## Calibration rules (Phase 5)

1. **Speculative language** — If `issue` uses "could", "might", "possibly", "may", or similar without confirmed impact → set `enhancement` or drop in Phase 4.
2. **Critical bar** — Reserve `critical` only when Phase 4 verification confirms high impact (not merely scary wording).
3. **Between two levels** — Choose the **lower** severity when evidence is ambiguous.
4. **Test-only findings** — Cap at `major`; never `critical` based on test code alone.
5. **Null checks on non-nullable types** — `enhancement` or skip (often false positive in Phase 2).
6. **Downgrades from Phase 2** — If a finding was downgraded one level for test files or "library API missing", do not upgrade again in Phase 5 unless verification proves higher impact.

## Emoji mapping (informational in validator output)

| Severity | Emoji |
|----------|-------|
| critical | 🚨 |
| major | ⚠️ |
| minor | 💡 |
| enhancement | ✨ |

The runner recomputes emoji from `severity` when posting; include `emoji` in validator output for consistency with this table.
