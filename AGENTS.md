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
| `skills/ai-code-review/` | _Planned — core review skill (v1: diff → findings → JSON report)_ |
| `packages/reviewer-runner/` | _Planned — Cursor SDK + GitHub comment publisher for CI (npm workspace)_ |
| `packages/ledger-lite/` | _Planned — non-functional React fixture (personal finance mock, npm workspace)_ |
| `.github/workflows/` | _Planned — `pull_request` AI review workflow_ |

---

## Maintenance

Update this file when top-level paths or stack defaults change (same session as the change).
