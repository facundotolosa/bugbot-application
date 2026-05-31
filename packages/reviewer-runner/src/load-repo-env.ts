import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root (`bugbot-application/`). */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const ENV_FILES = [
  path.join(REPO_ROOT, ".env"),
  path.join(REPO_ROOT, "packages/reviewer-runner/.env"),
] as const;

/** Load root `.env` then legacy package `.env`; does not override existing `process.env`. */
export function loadRepoEnv(): void {
  for (const envPath of ENV_FILES) {
    config({ path: envPath });
  }
}
