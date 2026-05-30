# reviewer-runner

Orchestrates **incremental AI code review** on GitHub PRs: tracking comment → review mode → scope/skip → **one** Cursor SDK agent (orchestrator skill) → security/performance subagents → validator funnel → filtered inline comments.

Resolves the monorepo root via `git rev-parse`. The wrapper uses ANSI `logger.*` lines (set `FORCE_COLOR=1` in CI). Orchestrator assistant text is prefixed `[orchestrator]`; Task lifecycle shows styled `› [sub-agent]` / `✔ [sub-agent]` lines only (no raw SDK `tool_call` noise). The orchestrator prints emoji progress blocks (📋 📊 🔬 …) and machine lines `Analyzers:` / `Validator funnel:` per the skill.

## Flow (CI)

1. Load PR issue comments; find `< ai-review-tracking >` (latest `At` wins).
2. `full` vs `incremental` from tracked SHA + ancestry validation.
3. Skip agent on pure sync with base or empty effective file scope (still advance tracking).
4. Otherwise run the orchestrator agent (`ai-code-review` skill): `prepare-diff` → parallel analyzer Tasks → merge raw → validator Task (when non-empty) → **findings v2**.
5. Post new inline comments (analyzer title + severity emoji + suggestion); `filterFindingsForPost` keeps PR-scoped files only; advance tracking on success.

## Findings schema (v2)

Agent output: `.ai-code-review/findings.json` at repo root.

```json
{
  "version": "2",
  "findings": [
    {
      "analyzer": "security",
      "severity": "major",
      "file": "src/a.ts",
      "line": 10,
      "issue": "…",
      "suggestion": "…"
    }
  ]
}
```

| Field | Values |
|-------|--------|
| `analyzer` | `security` \| `performance` |
| `severity` | `critical` \| `major` \| `minor` \| `enhancement` |

v1 (`problem`, `info`/`warning`/`error`) is **rejected** at parse time.

## Inline comment format

Each finding with `file` + `line` becomes one PR review comment:

```markdown
### 🤖 Security analyzer

⚠️ {issue}

💡 **Suggestion:** {suggestion}
```

Analyzer titles and severity emojis are applied in `formatCommentBody` (`comments.ts`).

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

With `--dry-run` and no `CURSOR_API_KEY`, uses `fixtures/findings.json` (v2) after orchestration (agent skipped). Use `--skip-agent` to exercise mode/scope/tracking without findings.

## Related paths

| Path | Role |
|------|------|
| `.cursor/skills/ai-code-review/SKILL.md` | Orchestrator: prepare-diff → Tasks → validator → v2 |
| `.cursor/skills/ai-code-review/scripts/prepare-diff.ts` | Scoped diff + metadata |
| `.cursor/skills/ai-code-review/scripts/select-analyzers.ts` | Invocation criteria (deterministic) |
| `.cursor/skills/ai-code-review/scripts/merge-findings.ts` | Merge analyzer outputs to raw v2 |
| `.cursor/skills/ai-code-review/scripts/validator-output.ts` | Parse/map validator JSON to findings v2 |
| `.cursor/agents/ai-code-review-*-analyzer.md` | Security / performance subagent definitions |
| `.cursor/agents/ai-code-review-validator.md` | Validator funnel subagent |
| `.ai-code-review/work/` | Diff, analyzer, raw, validator artifacts |
| `.ai-code-review/known-issues.json` | Runner-built; validator input |
| `.ai-code-review/findings.json` | Final v2 report post-validator (runner reads this) |
