# Local invocation — `ai-code-review`

## Prerequisites

- Repo checked out at the workspace root
- Cursor with this repo open (skill lives under `.cursor/skills/` for IDE registration)

## Steps (Cursor Agent)

1. Attach the **`ai-code-review`** skill (`.cursor/skills/ai-code-review/SKILL.md`).
2. Produce the diff (runner does this in CI; locally you run git):

   ```bash
   git diff main...HEAD
   ```

   Or for a fixed pair:

   ```bash
   git diff origin/main...HEAD
   ```

3. Prompt the agent, for example:

   > Follow the ai-code-review skill. Review this unified diff and write `.ai-code-review/findings.json`. Diff:
   >
   > ```diff
   > …paste git diff output…
   > ```

4. Confirm the artifact:

   ```bash
   cat .ai-code-review/findings.json | jq .
   ```

## Smoke target in this repo

Intentional bug for manual smoke:

```bash
git diff main -- .cursor/skills/ai-code-review/examples/smoke-target.ts
```

Expected sample output (reference): `.cursor/skills/ai-code-review/examples/findings.sample.json`.

## `prepare-diff` (incremental scope)

From the repo root:

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts --help
```

Example (full PR scope):

```bash
npx tsx .cursor/skills/ai-code-review/scripts/prepare-diff.ts \
  --source HEAD \
  --target main \
  --pr-files packages/reviewer-runner/fixtures/pr-files.txt \
  --output /tmp/prepare-diff.json
```

Add `--since-commit <sha>` for incremental diffs when the SHA is an ancestor of `HEAD`.

## CI path

`packages/reviewer-runner` invokes the Cursor SDK with this skill; the agent runs `prepare-diff` and writes `.ai-code-review/findings.json` for inline PR comments.
