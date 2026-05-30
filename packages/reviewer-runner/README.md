# reviewer-runner

Orchestrates **incremental AI code review** on GitHub PRs: tracking comment → review mode → scope/skip → Cursor agent (`prepare-diff` skill) → filtered inline comments.

Resolves the monorepo root via `git rev-parse`. Agent stdout is streamed with `[agent]` lines; the skill prints the mandatory diff summary block after `prepare-diff`.

## Flow (CI)

1. Load PR issue comments; find `< ai-review-tracking >` (latest `At` wins).
2. `full` vs `incremental` from tracked SHA + ancestry validation.
3. Skip agent on pure sync with base or empty effective file scope (still advance tracking).
4. Otherwise run agent with `pr-files` + known-issues JSON; post new inline comments only; advance tracking on success.

## Scripts

```bash
npm run build
npm test
npm run review -- --dry-run --skip-agent --base origin/main --head HEAD
```

## CLI flags

| Flag | Purpose |
|------|---------|
| `--dry-run` | No agent (unless `CURSOR_API_KEY` set); no GitHub post; tracking upsert logs payload only |
| `--skip-agent` | Scope + tracking only (tests / plumbing) |
| `--base` / `--head` | Git refs or SHAs (fallback: `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`) |
| `--cwd` | Override repo root |

## Environment

| Variable | When |
|----------|------|
| `CURSOR_API_KEY` | Agent run |
| `GITHUB_TOKEN` | Issue comments (tracking), inline review comments, post |
| `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA` | Scope; **head SHA** for tracking and review `commit_id` |
| `GITHUB_REPOSITORY` / `GITHUB_EVENT_PATH` | Provided by Actions; required for GitHub API in CI |

## Tracking comment

Non-inline PR issue comment, marker line:

```text
< ai-review-tracking >
Analyzed up to: <full-head-sha>
At: <ISO-8601>
```

Updated in place when possible. Advances on skip or successful run; **not** on agent failure or post failure.

## Dry-run

With `--dry-run` and no `CURSOR_API_KEY`, uses `fixtures/findings.json` after orchestration (agent skipped). Use `--skip-agent` to exercise mode/scope/tracking without findings.

## Related paths

| Path | Role |
|------|------|
| `.cursor/skills/ai-code-review/SKILL.md` | Agent instructions + diff summary format |
| `.cursor/skills/ai-code-review/scripts/prepare-diff.ts` | Scoped diff + metadata (skill-owned) |
| `.ai-code-review/findings.json` | Agent output (repo root) |
