# Clean code

Use when writing or reviewing implementation code.

## Naming

- Use **descriptive names** for variables, functions, types, and modules — intent should be obvious without reading the body.
- Prefer full words over abbreviations unless the abbreviation is universal in the codebase (`id`, `url`, `pr`).

## Structure

- Follow **SOLID** principles: single responsibility, open for extension, substitutability, small focused interfaces, depend on abstractions.
- Keep **functions small**; one clear job per function.
- Name functions after **what they do**, not how (`fetchPullRequestDiff`, not `getData`).

## Comments

- **No comments in code** — express intent through naming and structure.

If you feel a comment is necessary, refactor first (rename, extract function, clarify types).
