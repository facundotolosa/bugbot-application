# ledger-pipeline

E2E eval: full orchestrator path including performance analyzer + validator when raw findings are non-empty. Pinned `head_sha` on `eval/e2e-pipeline-head` adds `transactions-export.ts` with a per-id loop over accounts.

Frozen `pr-files.txt` limits review to `packages/ledger-lite/src/api/transactions-export.ts`.
