# BugBot Application — Agent Context

## What this project is

Portfolio **AI code reviewer for GitHub**, built to demonstrate production-grade review systems aligned with the [Software Engineer, BugBot](https://cursor.com/careers/software-engineer-bugbot) role at Cursor.

Author background: See `cv.md`.

## Stack (default — confirm in active spec)

TypeScript (Node 20+) · GitHub App + webhooks · agent-friendly LLM API (vendor-agnostic core) · Vitest · `evals/` for golden cases + metrics

## Context for agents → [`.agents/AGENTS.md`](.agents/AGENTS.md)

## Project itself

Application code and runtime assets.

| Path | Contents |
|------|----------|
| `.cursor/skills/ai-code-review/` | Orchestrator skill (`prepare-diff` → analyzers → validator → findings v2; Cursor-registered) |
| `.cursor/skills/ai-code-review/scripts/prepare-diff.ts` | PR-scoped incremental diff + metadata |
| `.cursor/skills/ai-code-review/scripts/select-analyzers.ts` | Deterministic analyzer invocation criteria |
| `.cursor/skills/ai-code-review/scripts/merge-findings.ts` | Merge analyzer outputs to raw findings v2 |
| `.cursor/skills/ai-code-review/scripts/validator-output.ts` | Parse/map validator output to final findings v2 |
| `.cursor/agents/` | Security, performance, and validator subagent definitions (`ai-code-review-*.md`) |
| `packages/reviewer-runner/` | Incremental orchestration, tracking comment, Cursor SDK, inline PR comments (npm workspace) |
| `packages/ledger-lite/` | Non-functional React finance dashboard fixture (mock data + utils, npm workspace) |
| `.github/workflows/ai-code-review.yml` | `pull_request` AI review via `reviewer-runner` |

---

## Maintenance

Update this file when top-level paths or stack defaults change (same session as the change).
