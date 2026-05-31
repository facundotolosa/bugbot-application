# ledger-security

E2E eval: full `runReviewAgent` orchestrator on a git worktree at pinned `head_sha` (`eval/e2e-security-head`). Scope is frozen `pr-files.txt` under `packages/ledger-lite/` only.

Factory branch adds `packages/ledger-lite/src/api/client.ts` with an intentional hardcoded secret.

Regenerate scope: `npm run eval -- --suite e2e --case ledger-security --refresh-inputs` (rewrites `inputs/pr-files.txt` from `pins.json`).
