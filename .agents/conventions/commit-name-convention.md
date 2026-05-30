# Commit name convention

Use when suggesting commit messages to the human (e.g. after each `/implement` phase).

## Format

```
<type>(<scope>): <summary>
```

- **English** — brief, one line, no trailing period
- **Lowercase** summary (keep acronyms as written: `SDD`, `PR`, `API`)
- Describe **what changed or why**, not a file list

## Type

| Type | Use for |
|------|---------|
| `feat` | New behavior or capability |
| `fix` | Bug fix |
| `chore` | Tooling, docs, agent workspace, repo hygiene |
| `refactor` | Behavior-preserving code change |
| `test` | Tests only |
| `ci` | CI/CD, workflows |

## Scope

Optional but preferred. Match the area touched:

- `agents` — `.agents/`, skills, specs, conventions
- `reviewer-runner`, `ledger-lite`, `ai-code-review` — package or skill name
- Omit scope only when the change is truly repo-wide and no single scope fits

## Summary

- Imperative or outcome-focused phrasing (`add`, `fix`, `initial`, `pause`)
- Short — aim for ~50 characters; hard max ~72
- No `WIP`, ticket IDs, or emoji unless the human asks

## Examples

```
chore(agents): initial SDD workflow and agent workspace
feat(reviewer-runner): add GitHub inline comment publisher
fix(ledger-lite): correct currency formatting for zero amounts
chore(agents): pause implement skill after each phase for commit
```

## Agent rules

- Suggest **one** message; do not run `git commit` unless the human asks
- Follow [`.agents/conventions/concise-responses.md`](concise-responses.md) when presenting it in chat
