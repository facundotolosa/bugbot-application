import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_DIR = join(import.meta.dirname, "../../../.cursor/skills/ai-code-review");
const TODO_IDS = [
  "prereq",
  "metadata",
  "diff",
  "analyzers",
  "collect",
  "validate",
  "report",
] as const;

describe("ai-code-review skill contract", () => {
  it("documents all seven TodoWrite ids in SKILL.md and progress-todos.md", () => {
    const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
    const progress = readFileSync(
      join(SKILL_DIR, "references/progress-todos.md"),
      "utf8",
    );

    for (const id of TODO_IDS) {
      expect(skill, `SKILL.md missing todo id ${id}`).toContain(`\`${id}\``);
      expect(progress, `progress-todos.md missing ${id}`).toContain(`\`${id}\``);
    }

    expect(skill).toContain("Step 0");
    expect(skill).toMatch(/first tool call/i);
    expect(skill).not.toMatch(/optional.*TodoWrite/i);
  });

  it("uses canonical English stdout lines from spec 07", () => {
    const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
    const lines = [
      "I'll run the ai-code-review skill with the PR parameters from the prompt.",
      "Diff ready; selecting analyzers.",
      "Launching selected analyzer sub-agents in parallel.",
      "Collected analyzer output; merging raw findings.",
      "Running validator on raw findings.",
      "All analyzers returned no findings; skipping validator.",
      "Report written to: .ai-code-review/findings.json",
    ];
    for (const line of lines) {
      expect(skill).toContain(line);
    }
  });
});
