import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveRepoRoot } from "./repo-root.js";

const packageDir = dirname(fileURLToPath(import.meta.url));

describe("resolveRepoRoot", () => {
  it("resolves monorepo root from reviewer-runner package dir", async () => {
    const root = await resolveRepoRoot(join(packageDir, ".."));
    expect(root).toMatch(/bugbot-application$/);
  });
});
