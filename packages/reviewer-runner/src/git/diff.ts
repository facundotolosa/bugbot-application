import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getUnifiedDiff(
  base: string,
  head: string,
  cwd: string,
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", `${base}...${head}`],
    { cwd, maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout;
}

export interface PrShas {
  base: string;
  head: string;
}

export function resolveShasFromEnv(): PrShas | null {
  const base = process.env.GITHUB_BASE_SHA;
  const head = process.env.GITHUB_HEAD_SHA;
  if (base && head) {
    return { base, head };
  }
  return null;
}
