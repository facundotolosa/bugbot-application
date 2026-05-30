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
| `skills/ai-code-review/` | Core review skill (v1: diff → `.ai-code-review/findings.json`) |
| `packages/reviewer-runner/` | Cursor SDK + GitHub inline comment publisher (npm workspace) |
| `packages/ledger-lite/` | Non-functional React finance dashboard fixture (mock data + utils, npm workspace) |
| `.github/workflows/ai-code-review.yml` | `pull_request` AI review via `reviewer-runner` |

---

## Maintenance

Update this file when top-level paths or stack defaults change (same session as the change).
