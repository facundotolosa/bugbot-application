import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { refreshCaseDiffInput } from "./refresh-diff.js";

const LEAKED_CASE = join(
  import.meta.dirname,
  "../cases/analyzer-security/leaked-key",
);

describe("refreshCaseDiffInput", () => {
  it("regenerates diff.json from fixture git refs", async () => {
    const output = await refreshCaseDiffInput({
      caseDir: LEAKED_CASE,
      fixtureId: "leaked-key",
    });
    expect(output.files.length).toBeGreaterThan(0);
    expect(output.files[0]?.path).toBe("evals/fixtures/leaked-key/src/auth.ts");

    const written = await readFile(join(LEAKED_CASE, "inputs/diff.json"), "utf8");
    expect(written).toContain("API_KEY");
  });
});
