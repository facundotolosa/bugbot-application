import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Git repository root (where `.ai-code-review/findings.json` must live). */
export async function resolveRepoRoot(startCwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd: startCwd },
  );
  return stdout.trim();
}
