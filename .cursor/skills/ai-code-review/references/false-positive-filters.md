# False-positive filters and verification

## Phase 2 — False-positive filters (cheap, no repo reads)

Apply after Phase 1 dedup. Counter: `after_fp_filters`.

| Pattern | Action |
|---------|--------|
| Hook/i18n false positives at module level (e.g. rules-of-hooks on non-component export) | **Skip** |
| Null check suggested on TS param typed as non-nullable | **Skip** |
| Missing import alleged but file has no imports in diff | **Skip** |
| Method signature / overload issue not visible in diff | **Skip** |
| Required-field null check on domain model with guaranteed constructor | **Skip** or downgrade to `enhancement` |
| "Library API missing" without version/package change in diff | **Downgrade one level** |
| Playwright `Promise.all` + navigation waits in e2e specs | **Skip** race/promise-style issues |
| Test files (`*.test.ts`, `*.spec.ts`, `__tests__/`) | **Downgrade one level** (not skip unless clearly test-only noise) |
| Placeholder credentials (`YOUR_API_KEY`, `example.com`, `changeme`, `TODO`) | **Skip** |
| Static `data-testid` without interpolation flagged as PII exposure | **Skip** |

## Phase 4 — Deep verification (mandatory for survivors)

Each finding that passed Phases 1–3 must be traced in the codebase (**Read** / **Grep**, ~3–4 files max per finding). Counter: `after_verification`.

### Strategy by signal

| Signal in `issue` / `analyzer` | Verification approach |
|----------------------------------|------------------------|
| Input / validation | Trace input origin; **drop** if validated/sanitized upstream |
| Auth / access (`security`) | Check middleware/guards/decorators; **drop** if enforced upstream |
| Error handling | try/catch, `.catch`, callers; **drop** if handled |
| Null / undefined | Types, guards, optional chaining; **drop** if null impossible |
| PII / exposure (`security`) | Sanitization, masking, internal-only sinks; **drop** if mitigated |
| Performance (N+1, blocking, etc.) | Confirm hot path / caller; **drop** if batched, cached, or off hot path |

### Default verification (all other findings)

1. Understand the claim in `issue`.
2. Trace value, call stack, or state in related files (definitions, callers, middleware).
3. Use Grep + Read on symbols/paths mentioned.
4. **DROP** if mitigation exists anywhere in the trace.
5. **KEEP** if the defect is confirmed on the changed path.
6. **Inconclusive:** if severity would be `minor` or `enhancement` → **DROP**; if `major` or `critical` → **KEEP** but **downgrade one level**.

Do not keep findings that only repeat linter-style guesses without reading the repo.
