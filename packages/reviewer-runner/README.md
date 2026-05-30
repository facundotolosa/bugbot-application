# reviewer-runner

CI/local runner: `git diff` → Cursor SDK (`ai-code-review` skill) → `.ai-code-review/findings.json` → GitHub inline PR comments.

## Scripts

```bash
npm run build
npm test
npm run review -- --dry-run --base origin/main --head HEAD
```

## Environment

| Variable | When |
|----------|------|
| `CURSOR_API_KEY` | Agent run (not required with `--dry-run` + fixture) |
| `GITHUB_TOKEN` | Posting comments in Actions |
| `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA` | Set by Actions; or use `--base` / `--head` |

## Dry-run

Uses `fixtures/findings.json` when `CURSOR_API_KEY` is unset. With a real findings file at repo root, parses that instead after a local agent run.
