# Facundo Tolosa

+34 602 40 49 44 | facundotolosa98@gmail.com | [linkedin.com/in/facundo-tolosa](https://linkedin.com/in/facundo-tolosa) | [github.com/facundotolosa](https://github.com/facundotolosa) | Barcelona, Spain

---

## Professional Summary

Software engineer with 3+ years of experience, currently building AI code review systems, agent pipelines, and developer tools in production. Own an AI PR review platform used by ~70 engineers: orchestrator-based architecture with specialized sub-agents, a multi-phase validation funnel for false-positive filtering, and iteration driven by team feedback. Ship full-stack features end-to-end in TypeScript, from review pipeline and CI/CD integrations to onboarding flows and observability tooling.

Built an [AI code review system for GitHub](https://github.com/facundotolosa/bugbot-application) as a demonstration of how I think about the problems Bugbot solves.

---

## Work Experience

### Semble
**Software Engineer** - HealthTech SaaS, London | Aug 2025 - Present

- **AI Code Review System:** orchestrator-based architecture with content-triggered analyzer sub-agents; teammates extend the system by adding analyzers without touching core plumbing. Multi-phase validation funnel filters false positives before posting
- **Bug Analysis Pipeline:** TypeScript agent pipeline over historical bugs. Pattern detection, AI severity inference, and a codebase scanning POC that surfaced **5 real bugs** from recurrent failure patterns
- **Pull Request Onboarder:** when a PR moves to Ready for Review, posts a summary generated from the diff and the linked ticket context to the team's code review channel. On later pushes, posts short summaries of what changed so reviewers can catch up without re-reading the full diff. Includes fair-rotation reviewer assignment based on domain ownership
- **Observability & tooling:** full pipeline tracing (prompts, tool calls, inter-agent communication); Design System Metrics for component library adoption; legacy module migration risk map via deterministic + AI hybrid assessment
- **Developer adoption:** AGENTS.md definitions, packaged Agent Skills, 1:1 context engineering training, and ongoing dissemination of best practices for AI-assisted development across the engineering org

### AIAlma
**Independent Software Consultant** - Software Consultancy, Barcelona | Feb 2025 - Present

- Designed and built a **full-stack ERP** for Helixmarine (MGA insurance broker) from 0 to production. Owned architecture, data modeling, and client relationship end-to-end
- Built AI-powered automations and integrations; developed voice bot assistants with VAPI for client workflows

### Appspace
**Frontend Engineer** - SaaS, Texas - 3 yrs - Distributed (US, EU, APAC) | Nov 2022 - Aug 2025

- Led technical development of the **internal component library** used by all product teams. Designed reusable, accessible components in collaboration with design and product; mentored developers on adoption
- Shipped product features end-to-end with agile delivery; owned **testing quality** from unit through E2E across projects

### ISDI Coders
**Assistant Teacher** - Bootcamp, Barcelona - 6 mos | Apr - Sep 2022

- Mentored students in-person and online; facilitated SCRUM/Agile teamwork, pair programming, and code reviews

---

## Projects

### BugBot Application

Self-contained AI code review system for GitHub PRs, built as a demonstration project for the Bugbot role. Orchestrator skill with security and performance sub-agents, 5-phase validation funnel, incremental reviews via tracking comments, inline PR comments through GitHub Actions CI, and an eval harness with 6 golden cases across component and E2E suites.
[github.com/facundotolosa/bugbot-application](https://github.com/facundotolosa/bugbot-application)

TypeScript, Cursor SDK, GitHub Actions, Vitest, LLM-as-judge evals

---

## Education

- **Full-Stack Web Development Coding Bootcamp** - ISDI Coders, Barcelona | 2022
- **Industrial Plants Technician** - Instituto Politecnico Superior "General San Martin", Rosario | 2012 - 2017
