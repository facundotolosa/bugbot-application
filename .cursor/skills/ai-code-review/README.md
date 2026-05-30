# Local invocation — `ai-code-review`

## Prerequisites

- Repo checked out at the workspace root
- Cursor with this repo open (skill lives under `.cursor/skills/` for IDE registration)
- Node 20+ (`npx tsx` for `prepare-diff`)

## Full review (local)

1. Attach the **`ai-code-review`** skill (`.cursor/skills/ai-code-review/SKILL.md`).
2. Build a PR file list (paths changed vs merge-base):

   ```bash
   git diff --name-only main...HEAD > /tmp/pr-files.txt
   ```

3. Prompt the agent, for example:

   > Follow the ai-code-review skill.
   > Source: `HEAD` · Target: `main`
   > PR files list: `/tmp/pr-files.txt`
   > Run `prepare-diff`, print the diff summary block, then write `.ai-code-review/findings.json`.

4. Confirm the artifact:

   ```bash
   cat .ai-code-review/findings.json | jq .
   ```

## Incremental review (local only)

Incremental mode applies **only** when you pass a valid ancestor SHA:

> Follow the ai-code-review skill.
> **Since commit:** `abc123…` (full SHA of last reviewed commit)
> Source: `HEAD` · Target: `main`
> PR files list: `/tmp/pr-files.txt`

The agent runs `prepare-diff` with `--since-commit`. If the SHA is not an ancestor of `HEAD`, the script falls back to full review and emits warnings — print them as `Warning:` lines after the summary block.

## Smoke target in this repo

```bash
git diff main -- .cursor/skills/ai-code-review/examples/smoke-target.ts
```

Reference findings: `.cursor/skills/ai-code-review/examples/findings.sample.json`.

## `prepare-diff` CLI

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts --help
```

Full PR scope:

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts \
  --source HEAD \
  --target main \
  --pr-files packages/reviewer-runner/fixtures/pr-files.txt \
  --output /tmp/prepare-diff.json
```

Incremental:

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts \
  --source HEAD \
  --target main \
  --since-commit <full-sha> \
  --pr-files /tmp/pr-files.txt \
  --output /tmp/prepare-diff.json
```

## CI path

`packages/reviewer-runner` passes branch refs, head SHA, and paths to `pr-files` / `known-issues` JSON. The agent runs `prepare-diff`, logs the mandatory summary block, and writes `.ai-code-review/findings.json` for inline PR comments.
