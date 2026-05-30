# BugBot Application

Portfolio AI code reviewer for GitHub: skill (`skills/ai-code-review/`), fixture app (`packages/ledger-lite/`), and CI runner (`packages/reviewer-runner/`).

## Spec & plan

- [MVP spec](.agents/specs/01-mvp-foundation/spec.md)
- [Implementation plan](.agents/specs/01-mvp-foundation/plan.md)

## Local review (skill)

See [skills/ai-code-review/README.md](skills/ai-code-review/README.md).

## CI runner

```bash
cd packages/reviewer-runner
npm run build
npm run review -- --dry-run --base origin/main --head HEAD
```

Full run (requires `CURSOR_API_KEY`):

```bash
CURSOR_API_KEY=... npm run review -- --base origin/main --head HEAD
```

## Secrets (GitHub Actions)

| Secret / token | Required | Notes |
|----------------|----------|--------|
| `CURSOR_API_KEY` | Yes | Cursor API key for SDK agent runs |
| `GITHUB_TOKEN` | Auto | Provided by Actions; needs `pull-requests: write` |

Add `CURSOR_API_KEY` in **Settings → Secrets and variables → Actions**.

## Development

```bash
npm install
npm test
npm run build
```
