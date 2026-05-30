---
name: ai-code-review
description: Review a unified git diff for obvious bugs and quality issues; write structured findings to .ai-code-review/findings.json. Use when reviewing PR diffs locally or when invoked by reviewer-runner in CI.
---

# AI Code Review (v1)

Single-pass code review: **unified diff → heuristic analysis → `.ai-code-review/findings.json`**.

## Inputs

| Input | Source (MVP) | Required |
|-------|----------------|----------|
| Unified diff text | Injected in the prompt by `reviewer-runner` (`git diff <base>...<head>`) or pasted locally | Yes |
| Repository root (`cwd`) | Current workspace | Yes (for writing output file) |
| PR metadata (number, title) | Optional; use only in a mental/report header, not in the JSON schema | No |

**MVP:** Do **not** run `git diff` yourself unless the human explicitly asks; the runner owns diff extraction. A future `prepare-diff` script is out of scope for v1.

## Processing (single pass)

1. Parse the unified diff (files, hunks, line numbers on the **new** side where applicable).
2. Scan changed hunks for **obvious** issues (heuristic, not exhaustive):
   - Possible bugs (null/undefined misuse, wrong comparisons, race-prone patterns)
   - Security smells (secrets in code, unsafe `eval`, injection surfaces)
   - Missing error handling on risky operations
   - Confusing naming or misleading types
   - Large or risky changes without tests
3. For each issue you would flag on a real PR, add one entry to `findings[]`.
4. **Overwrite** `.ai-code-review/findings.json` at the repo root (create `.ai-code-review/` if missing).

## Output contract

**Path:** `.ai-code-review/findings.json` (repo root)

**Schema:**

```json
{
  "version": "1",
  "findings": [
    {
      "severity": "info",
      "file": "path/from/repo/root.ts",
      "line": 42,
      "problem": "what is wrong",
      "suggestion": "how to fix it"
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `version` | Must be `"1"` |
| `severity` | One of `info`, `warning`, `error` |
| `file` | Repo-relative path; must match a file in the diff for inline PR comments |
| `line` | **Required** for findings that should appear as inline PR comments — use a line number on the **new** file version in the diff. Omit findings you cannot anchor to a line. |
| `problem` | Short, specific description |
| `suggestion` | Actionable fix |

**Empty review:** valid output is `{ "version": "1", "findings": [] }`.

**Do not** emit review content only in chat; the runner reads the **file**, not stdout or markdown fences.

### Example (one finding)

```json
{
  "version": "1",
  "findings": [
    {
      "severity": "warning",
      "file": ".cursor/skills/ai-code-review/examples/smoke-target.ts",
      "line": 3,
      "problem": "Division by zero when value is 0.",
      "suggestion": "Guard with `if (value === 0) return 0` or throw a clear error."
    }
  ]
}
```

### Example (no issues)

```json
{
  "version": "1",
  "findings": []
}
```

## GitHub comment shape (for consistency)

The runner maps each finding with `file` + `line` to an inline PR comment:

```markdown
*Problem*
{problem}

Suggested fix: *{suggestion}*
```

You do not post to GitHub; only write the JSON file.

## Out of scope (v1)

- Subagents, multi-pass review, incremental hunks-only review
- `evals/` harness, precision/recall metrics
- Running `prepare-diff` or normalizing diffs beyond what you receive
- Posting GitHub comments directly

## Workflow checklist

1. Read the full unified diff provided.
2. Analyze changed lines only (context from hunks is enough).
3. Write `.ai-code-review/findings.json` with valid JSON matching the schema.
4. Confirm the file exists on disk before finishing.
