import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PATHS } from "./invocation.js";
import { seedWorkspace } from "./workspace.js";

const WS_CASE = join(import.meta.dirname, "__fixtures__", "ws-case");

describe("seedWorkspace", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it("copies fixture tree and frozen inputs into work paths", async () => {
    const ws = await seedWorkspace({
      caseDir: WS_CASE,
      caseId: "ws-case",
      fixtureId: "ws-minimal",
      runId: "test-run",
    });
    cleanups.push(ws.cleanup);

    await access(join(ws.cwd, "src/app.ts"));
    const diff = await readFile(join(ws.cwd, PATHS.diff), "utf8");
    expect(JSON.parse(diff)).toHaveProperty("files");
  });
});
