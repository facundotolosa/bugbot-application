import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const REVIEW_CONFIG_RELATIVE = ".ai-code-review/review.config.json";
export const REVIEW_PACKAGE_EXCLUSION_ID = "review-package";

export interface ReviewConfig {
  reviewPackages?: string[];
}

export function normalizeReviewPackagePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return "";
  }
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  return withoutTrailing ? `${withoutTrailing}/` : "";
}

export function pathMatchesReviewPackages(path: string, reviewPackages: string[]): boolean {
  if (reviewPackages.length === 0) {
    return true;
  }
  const normalizedPath = path.replace(/\\/g, "/");
  for (const pkg of reviewPackages) {
    const prefix = normalizeReviewPackagePrefix(pkg);
    if (!prefix) {
      continue;
    }
    const dir = prefix.slice(0, -1);
    if (normalizedPath === dir || normalizedPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

export function filterPathsByReviewPackages(
  paths: string[],
  reviewPackages: string[] | undefined,
): string[] {
  if (!reviewPackages?.length) {
    return paths;
  }
  return paths.filter((p) => pathMatchesReviewPackages(p, reviewPackages));
}

export async function loadReviewConfig(cwd: string): Promise<ReviewConfig | null> {
  const configPath = join(cwd, REVIEW_CONFIG_RELATIVE);
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as ReviewConfig;
    if (parsed.reviewPackages !== undefined && !Array.isArray(parsed.reviewPackages)) {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function loadReviewPackagesFromConfig(cwd: string): Promise<string[] | undefined> {
  const config = await loadReviewConfig(cwd);
  const packages = config?.reviewPackages;
  if (!packages?.length) {
    return undefined;
  }
  return packages;
}

/** Explicit `packages: []` disables filtering; omit override to read review.config.json. */
export async function resolveReviewPackages(
  cwd: string,
  override?: { packages?: string[] },
): Promise<string[] | undefined> {
  if (override?.packages !== undefined) {
    return override.packages.length > 0 ? override.packages : undefined;
  }
  return loadReviewPackagesFromConfig(cwd);
}
