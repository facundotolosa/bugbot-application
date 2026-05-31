import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  filterPathsByReviewPackages,
  loadReviewPackagesFromConfig,
  pathMatchesReviewPackages,
  resolveReviewPackages,
  REVIEW_CONFIG_RELATIVE,
} from "./review-scope.js";

describe("pathMatchesReviewPackages", () => {
  it("matches paths under configured prefixes", () => {
    const packages = ["packages/reviewer-runner"];
    expect(pathMatchesReviewPackages("packages/reviewer-runner/src/a.ts", packages)).toBe(
      true,
    );
    expect(pathMatchesReviewPackages("packages/ledger-lite/src/b.ts", packages)).toBe(false);
  });

  it("treats empty package list as no filter", () => {
    expect(pathMatchesReviewPackages("any/path.ts", [])).toBe(true);
  });
});

describe("filterPathsByReviewPackages", () => {
  it("keeps only paths in review packages", () => {
    expect(
      filterPathsByReviewPackages(
        ["packages/reviewer-runner/a.ts", "packages/ledger-lite/b.ts"],
        ["packages/reviewer-runner"],
      ),
    ).toEqual(["packages/reviewer-runner/a.ts"]);
  });
});

describe("resolveReviewPackages", () => {
  it("loads reviewPackages from review.config.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "review-config-"));
    try {
      await mkdir(join(dir, ".ai-code-review"), { recursive: true });
      await writeFile(
        join(dir, REVIEW_CONFIG_RELATIVE),
        JSON.stringify({ reviewPackages: ["packages/reviewer-runner"] }),
        "utf8",
      );
      await expect(loadReviewPackagesFromConfig(dir)).resolves.toEqual([
        "packages/reviewer-runner",
      ]);
      await expect(resolveReviewPackages(dir)).resolves.toEqual(["packages/reviewer-runner"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("explicit empty array disables config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "review-config-"));
    try {
      await mkdir(join(dir, ".ai-code-review"), { recursive: true });
      await writeFile(
        join(dir, REVIEW_CONFIG_RELATIVE),
        JSON.stringify({ reviewPackages: ["packages/reviewer-runner"] }),
        "utf8",
      );
      await expect(resolveReviewPackages(dir, { packages: [] })).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
