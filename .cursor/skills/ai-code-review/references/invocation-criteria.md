# Invocation criteria (v1)

The orchestrator evaluates these rules **once per run** on `files[].path` and `files[].diff` from `prepare-diff` output (after writing session `diff.json` from `session-manifest.json`).

Deterministic implementation: [`../scripts/select-analyzers.ts`](../scripts/select-analyzers.ts) (`selectAnalyzers`).

## Analyzers

| Key | Include when |
|-----|----------------|
| **security** | **Always** — every non-empty review run. |
| **performance** | **Any** condition below matches **at least one** file. |

If performance does not match, **do not** launch its Task; merge treats it as `{ "findings": [] }`.

## Performance conditions

### 1. Path heuristics

Path contains any of:

- `packages/`
- `/api/`
- `server`, `worker`, `service`, `route`, `handler`
- `packages/reviewer-runner`, `packages/ledger-lite`
- Data-layer segments: `model`, `repository`, `db`, `database`

### 2. React

Path ends with `.tsx` or `.jsx`.

### 3. Diff or path content (case-sensitive)

| Token / pattern |
|-----------------|
| `mongoose`, `mongodb`, `MongoClient`, `prisma` |
| `.aggregate(`, `.find(`, `.findOne(`, `getCollection` |
| SQL literals `INSERT`, `SELECT` |
| `useEffect`, `useState`, `useMemo`, `useCallback`, `React.memo` |

## Log format

Recommended order: `security` → `performance`.

```text
Analyzers: security, performance
```

```text
Analyzers: security (skipped: performance)
```

## Out of scope (this version)

- Multi-batch `batch-{i}.json`
- Analyzers other than `security` and `performance`
- Known-issues dedup in the orchestrator or at runner post time (validator Phase 3; runner `filterFindingsForPost` is PR file scope only)
