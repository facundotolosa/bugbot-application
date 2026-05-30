# Root-cause deduplication

Apply in **Phase 1** of the validator funnel (after exact dedup, before false-positive filters).

## Step 1 — Exact dedup

- **Same `file` + `line`** → duplicate. Keep higher severity; tie → more specific `issue` text.
- **Same `file`**, lines within **≤3**, and substantially the same defect in `issue` → one finding; keep the more precise `line`.
- Counter: `after_exact_dedup`.

## Step 2 — Root-cause cluster merge

Cluster findings when **all** apply:

- Same `file`
- `|line_a - line_b| ≤ 3`
- Same **root-cause key** (derived from `issue` + `analyzer`, not a category field)

**Per cluster, keep one finding.** Tie-break order:

1. Higher `severity`
2. More specific `issue` (concrete symbol/API/path beats generic wording)
3. Analyzer priority: **security > performance**

**Do not merge** unrelated defects on the same line (different symbols, APIs, or failure modes).

Counters: `after_root_cause_dedup` and `after_dedup` (same value).

`raw_input` = count of findings **before** Step 1.

## Root-cause keys (examples)

Infer from `issue` text and `analyzer`. Examples:

| Key | Typical signals |
|-----|-----------------|
| `auth_bypass` | missing auth, unauthenticated access |
| `injection` | SQL/NoSQL/command/template injection |
| `xss_unsanitized_html` | XSS, unsanitized HTML, dangerouslySetInnerHTML |
| `secret_exposure` | hardcoded secret, API key in source |
| `missing_authz` | IDOR, missing authorization check |
| `n_plus_one` | N+1, query in loop |
| `event_loop_blocking` | sync I/O, blocking call on hot path |
| `fire_and_forget_async` | unawaited promise, floating promise |
| `read_modify_write_race` | race, TOCTOU, concurrent update |

When two findings share a key and cluster rules, merge. When keys differ, keep both even if lines are adjacent.
