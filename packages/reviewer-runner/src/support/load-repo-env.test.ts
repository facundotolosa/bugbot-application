import { describe, expect, it } from "vitest";

import { REPO_ROOT, loadRepoEnv } from "./load-repo-env.js";

describe("loadRepoEnv", () => {
  it("resolves monorepo root", () => {
    expect(REPO_ROOT).toMatch(/bugbot-application\/?$/);
  });

  it("runs without throwing when .env files are absent", () => {
    expect(() => loadRepoEnv()).not.toThrow();
  });
});
