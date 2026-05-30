# Local invocation — `ai-code-review`

## Prerequisites

- Repo checked out at the workspace root
- Cursor with this repo open (or Cursor CLI / SDK with `local` cwd = repo root)

## Steps (Cursor Agent)

1. Attach the **`ai-code-review`** skill (`skills/ai-code-review/SKILL.md`).
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
git diff main -- skills/ai-code-review/examples/smoke-target.ts
```

Expected sample output (reference): `skills/ai-code-review/examples/findings.sample.json`.

## CI path

`packages/reviewer-runner` runs `git diff`, calls the Cursor SDK with this skill, then reads `.ai-code-review/findings.json` and posts inline PR comments.
