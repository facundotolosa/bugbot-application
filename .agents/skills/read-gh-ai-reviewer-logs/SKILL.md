---
name: read-gh-ai-reviewer-logs
description: Fetches and filters GitHub Actions logs for the AI Code Review workflow to only "Build reviewer-runner" and "Run AI code review" steps. Use when the user passes a github.com/.../actions/runs/.../job/... URL, asks to read AI reviewer CI logs, or wants signal without checkout/cache/setup noise.
disable-model-invocation: true
---

# Read GH AI reviewer logs

## When to use

- User provides a GitHub Actions **job URL** for workflow `AI Code Review` (`.github/workflows/ai-code-review.yml`).
- User wants reviewer-runner build output or the agent review run without Actions infrastructure noise.

## Input

One URL:

`https://github.com/{owner}/{repo}/actions/runs/{run_id}/job/{job_id}`

(`job_id` is accepted in the URL but not required for fetching; filtering is by **step name**.)

## Workflow

1. **Run the filter script** (do not hand-parse full `gh run view --log` output):

   ```bash
   .agents/skills/read-gh-ai-reviewer-logs/scripts/filter-logs.sh "<url>"
   ```

2. **Requirements:** `gh` installed and authenticated with access to the repo (`repo` + `workflow` scopes on a PAT, or logged-in `gh auth login`).

3. **Read the filtered output** — two sections only:
   - `## Build reviewer-runner` — `npm run build -w reviewer-runner`
   - `## Run AI code review` — `npm run review -w reviewer-runner` (findings, tracking, post)

4. **Summarize for the human** when asked: failures, timings, review outcome (`Posted PR review…`, skip reasons, errors). Quote relevant log lines.

## What the script filters out

All steps except the two above: `Set up job`, `checkout`, `setup-node`, `Install dependencies`, and post-job cleanup/cache/git noise.

Filtering is deterministic: `gh run view --log` lines are tab-separated (`job`, `step`, `message`); only `step` ∈ {`Build reviewer-runner`, `Run AI code review`} is kept. ISO timestamps are stripped from each line.

## Errors

| Symptom | Action |
|---------|--------|
| `invalid Actions URL` | Ask for a full job URL under `actions/runs/`. |
| `gh: Not Found` / 404 | Token lacks repo access or run expired. |
| Empty output | Run may predate these step names; confirm workflow matches `ai-code-review.yml`. |
