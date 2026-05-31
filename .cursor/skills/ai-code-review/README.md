# Local invocation — `ai-code-review`

## Prerequisites

- Repo checked out at the workspace root
- Cursor with this repo open (skill under `.cursor/skills/`, analyzers under `.cursor/agents/`)
- Node 20+ (`npx tsx` for scripts)

## Full review (local)

1. Attach the **`ai-code-review`** skill.
2. Build a PR file list:

   ```bash
   git diff --name-only main...HEAD > /tmp/pr-files.txt
   ```

3. Prompt the agent, for example:

   > Follow the ai-code-review skill.
   > Source: `HEAD` · Target: `main`
   > PR files list: `/tmp/pr-files.txt`
   > Run `prepare-diff`, print the diff summary, select analyzers, run security/performance subagents in parallel, merge, and write `.ai-code-review/findings.json` (v2).

4. Confirm durable outputs (IPC lives under `$TMPDIR/ai-code-review-*` during the run):

   ```bash
   cat .ai-code-review/findings.json | jq .
   ls .ai-code-review/run-artifacts/session/ 2>/dev/null || true
   ```

## Incremental review (local only)

Pass a valid ancestor SHA:

> **Since commit:** `abc123…` (full SHA)
> Source: `HEAD` · Target: `main`
> PR files list: `/tmp/pr-files.txt`

If the SHA is not an ancestor of `HEAD`, `prepare-diff` falls back to full review — print `Warning:` lines after the summary block.

## Artifacts

| Path | Purpose |
|------|---------|
| `$TMPDIR/ai-code-review-*/` | Ephemeral session IPC (diff, analyzer outputs, raw, validator) |
| `.ai-code-review/findings.json` | Final v2 report |
| `.ai-code-review/validator-summary.json` | Validator funnel summary |
| `.ai-code-review/run-artifacts/session/` | Post-run snapshot of session IPC |

## Analyzer subagents

Definitions: `.cursor/agents/ai-code-review-security-analyzer.md`, `ai-code-review-performance-analyzer.md`.

Invocation rules: [references/invocation-criteria.md](references/invocation-criteria.md).

Progress todos (IDE): [references/progress-todos.md](references/progress-todos.md).

## Smoke target

```bash
git diff main -- .cursor/skills/ai-code-review/examples/smoke-target.ts
```

Reference v2 findings: [examples/findings.sample.json](examples/findings.sample.json).

## `prepare-diff` CLI

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts --help
```

## CI path

`packages/reviewer-runner` invokes **one** SDK agent with this skill. The orchestrator spawns analyzer subagents via Task; the runner reads `.ai-code-review/findings.json` (v2) and posts formatted inline comments.
