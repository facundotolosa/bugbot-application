import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { seedWorkspace } from "./workspace.js";

const WS_CASE = join(import.meta.dirname, "__fixtures__", "ws-case");
const LEAKED_KEY_CASE = join(
  import.meta.dirname,
  "../cases/analyzer-security/leaked-key",
);

describe("seedWorkspace", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it("copies fixture tree and frozen inputs into session paths", async () => {
    const ws = await seedWorkspace({
      caseDir: WS_CASE,
      caseId: "ws-case",
      fixtureId: "ws-minimal",
      runId: "test-run",
    });
    cleanups.push(ws.cleanup);

    await access(join(ws.cwd, "src/app.ts"));
    const diff = await readFile(ws.manifest.diff, "utf8");
    expect(JSON.parse(diff)).toHaveProperty("files");
    expect(process.env.AI_CODE_REVIEW_SESSION_DIR).toBe(ws.sessionDir);
  });

  it("ignores diff-refs.json (refresh metadata only)", async () => {
    const ws = await seedWorkspace({
      caseDir: LEAKED_KEY_CASE,
      caseId: "leaked-key",
      fixtureId: "leaked-key",
      runId: "test-skip-refs",
    });
    cleanups.push(ws.cleanup);

    await access(ws.manifest.diff);
  });
});
