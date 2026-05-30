#!/usr/bin/env bash
# Fetch GitHub Actions logs for an AI Code Review job URL and keep only
# "Build reviewer-runner" and "Run AI code review" step output.
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "usage: filter-logs.sh <github-actions-job-url>" >&2
  exit 1
fi

if [[ ! "$URL" =~ github\.com/([^/]+)/([^/]+)/actions/runs/([0-9]+) ]]; then
  echo "error: expected URL like https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID" >&2
  exit 1
fi

OWNER="${BASH_REMATCH[1]}"
REPO="${BASH_REMATCH[2]}"
RUN_ID="${BASH_REMATCH[3]}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI is required (https://cli.github.com/)" >&2
  exit 1
fi

readonly STEP_BUILD="Build reviewer-runner"
readonly STEP_REVIEW="Run AI code review"

gh run view "$RUN_ID" --repo "$OWNER/$REPO" --log | awk -F'\t' -v step_build="$STEP_BUILD" -v step_review="$STEP_REVIEW" '
  $2 == step_build || $2 == step_review {
    if ($2 != prev) {
      if (prev != "") print ""
      print "## " $2
      prev = $2
    }
    line = $3
    for (i = 4; i <= NF; i++) line = line "\t" $i
    sub(/^[^Z]*Z /, "", line)
    print line
  }
'
