import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  pathMatchesReviewPackages,
  REVIEW_PACKAGE_EXCLUSION_ID,
  resolveReviewPackages,
} from "./review-scope.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const DIFF_CONCURRENCY = 10;

export type PrSize = "small" | "medium" | "large";

export interface IgnorePatternDef {
  id: string;
  source: RegExp;
}

export const IGNORE_PATTERNS: IgnorePatternDef[] = [
  { id: "lockfile", source: /(^|\/)(yarn\.lock|package-lock\.json|pnpm-lock\.yaml|\.pnp\.)/ },
  {
    id: "build-output",
    source: /(^|\/)(dist|build|\.next|out)\/|\.min\.(js|css)$/,
  },
  { id: "test-artifacts", source: /\.snap$|(^|\/)coverage\/|(^|\/)\.nyc_output\// },
  { id: "ide-editor", source: /(^|\/)\.(vscode|idea)\/|\.swp$|\.swo$|\.DS_Store$/ },
  { id: "logs", source: /\.log$|(^|\/)logs\// },
  {
    id: "generated",
    source: /(^|\/)(__generated__|generated)\/|(^|\/)schema\.prisma$/,
  },
  {
    id: "binary-media",
    source: /\.(png|jpe?g|gif|ico|svg|woff2?|ttf|eot|pdf|zip|tar|gz|bz2|7z)$/i,
  },
  { id: "low-signal-config", source: /(^|\/)\.(gitignore|editorconfig)$/ },
  { id: "db-migrations", source: /(^|\/)migrations\/.*\.(js|ts|sql)$/ },
];

export interface PrepareDiffMetadata {
  is_incremental: boolean;
  since_commit?: string;
  diff_base: string;
  merge_base: string;
  pr_size: PrSize;
  total_files: number;
  total_lines_added: number;
  total_lines_removed: number;
  files_excluded: number;
  excluded_patterns_matched: Record<string, number>;
  warnings: string[];
}

export interface PrepareDiffFile {
  path: string;
  diff: string;
  lines_added: number;
  lines_removed: number;
}

export interface PrepareDiffOutput {
  metadata: PrepareDiffMetadata;
  files: PrepareDiffFile[];
}

export interface PrepareDiffGit {
  mergeBase(target: string, source: string): Promise<string>;
  isAncestor(ancestor: string, head: string): Promise<boolean>;
  listChangedFiles(diffBase: string, source: string): Promise<string[]>;
  fileDiff(diffBase: string, source: string, path: string): Promise<string>;
}

export interface PrepareDiffOptions {
  source: string;
  target: string;
  sinceCommit?: string;
  prFiles: Set<string>;
  cwd: string;
  git?: PrepareDiffGit;
  /** When set (including `[]`), overrides `.ai-code-review/review.config.json`. */
  reviewPackages?: string[];
}

export function getIgnorePatternId(path: string): string | null {
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.source.test(path)) {
      return pattern.id;
    }
  }
  return null;
}

export function filterReviewableFiles(
  paths: string[],
  prFiles: Set<string>,
  reviewPackages?: string[],
): {
  reviewable: string[];
  excludedCount: number;
  excludedPatterns: Record<string, number>;
} {
  const reviewable: string[] = [];
  const excludedPatterns: Record<string, number> = {};
  let excludedCount = 0;
  const packageFilterActive = Boolean(reviewPackages?.length);

  for (const path of paths) {
    if (!prFiles.has(path)) {
      excludedCount++;
      excludedPatterns["out-of-pr"] = (excludedPatterns["out-of-pr"] ?? 0) + 1;
      continue;
    }
    if (packageFilterActive && !pathMatchesReviewPackages(path, reviewPackages!)) {
      excludedCount++;
      excludedPatterns[REVIEW_PACKAGE_EXCLUSION_ID] =
        (excludedPatterns[REVIEW_PACKAGE_EXCLUSION_ID] ?? 0) + 1;
      continue;
    }
    const ignoreId = getIgnorePatternId(path);
    if (ignoreId) {
      excludedCount++;
      excludedPatterns[ignoreId] = (excludedPatterns[ignoreId] ?? 0) + 1;
      continue;
    }
    reviewable.push(path);
  }

  return { reviewable, excludedCount, excludedPatterns };
}

export async function resolveDiffBase(input: {
  sinceCommit?: string;
  mergeBase: string;
  isAncestor: (since: string) => boolean | Promise<boolean>;
}): Promise<{
  diffBase: string;
  is_incremental: boolean;
  since_commit?: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  if (!input.sinceCommit) {
    return { diffBase: input.mergeBase, is_incremental: false, warnings };
  }
  const valid = await input.isAncestor(input.sinceCommit);
  if (valid) {
    return {
      diffBase: input.sinceCommit,
      is_incremental: true,
      since_commit: input.sinceCommit,
      warnings,
    };
  }
  warnings.push("full review fallback: since-commit is not an ancestor of source head");
  return { diffBase: input.mergeBase, is_incremental: false, warnings };
}

export function countDiffLineStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added++;
    } else if (line.startsWith("-")) {
      removed++;
    }
  }
  return { added, removed };
}

export function computePrSize(
  fileCount: number,
  linesAdded: number,
  linesRemoved: number,
): PrSize {
  const totalLines = linesAdded + linesRemoved;
  if (fileCount <= 10 && totalLines <= 500) {
    return "small";
  }
  if (fileCount > 30 && totalLines > 5000) {
    return "large";
  }
  return "medium";
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

export function createExecPrepareDiffGit(cwd: string): PrepareDiffGit {
  async function gitStdout(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });
    return stdout;
  }

  async function gitExitOk(args: string[]): Promise<boolean> {
    try {
      await execFileAsync("git", args, { cwd, maxBuffer: GIT_MAX_BUFFER });
      return true;
    } catch {
      return false;
    }
  }

  return {
    async mergeBase(target, source) {
      for (const ref of [`origin/${target}`, target]) {
        try {
          const stdout = await gitStdout(["merge-base", ref, source]);
          const sha = stdout.trim();
          if (sha) {
            return sha;
          }
        } catch {
          // try next ref
        }
      }
      throw new Error(`Could not resolve merge-base for target=${target} source=${source}`);
    },
    async isAncestor(ancestor, head) {
      return gitExitOk(["merge-base", "--is-ancestor", ancestor, head]);
    },
    async listChangedFiles(diffBase, source) {
      const stdout = await gitStdout([
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        `${diffBase}...${source}`,
      ]);
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    },
    async fileDiff(diffBase, source, path) {
      const stdout = await gitStdout(["diff", `${diffBase}...${source}`, "--", path]);
      return stdout;
    },
  };
}

export async function prepareDiff(options: PrepareDiffOptions): Promise<PrepareDiffOutput> {
  const git = options.git ?? createExecPrepareDiffGit(options.cwd);
  const merge_base = await git.mergeBase(options.target, options.source);
  const base = await resolveDiffBase({
    sinceCommit: options.sinceCommit,
    mergeBase: merge_base,
    isAncestor: (since) => git.isAncestor(since, options.source),
  });

  const changedPaths = await git.listChangedFiles(base.diffBase, options.source);
  const reviewPackages = await resolveReviewPackages(
    options.cwd,
    "reviewPackages" in options ? { packages: options.reviewPackages } : undefined,
  );
  const filtered = filterReviewableFiles(changedPaths, options.prFiles, reviewPackages);
  const warnings = [...base.warnings];

  const fileResults = await mapConcurrent(filtered.reviewable, DIFF_CONCURRENCY, async (path) => {
    try {
      const diff = await git.fileDiff(base.diffBase, options.source, path);
      const stats = countDiffLineStats(diff);
      return {
        path,
        diff,
        lines_added: stats.added,
        lines_removed: stats.removed,
        error: null as string | null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`failed to diff ${path}: ${message}`);
      return { path, diff: "", lines_added: 0, lines_removed: 0, error: message };
    }
  });

  const files: PrepareDiffFile[] = [];
  let total_lines_added = 0;
  let total_lines_removed = 0;

  for (const result of fileResults) {
    if (result.error) {
      continue;
    }
    files.push({
      path: result.path,
      diff: result.diff,
      lines_added: result.lines_added,
      lines_removed: result.lines_removed,
    });
    total_lines_added += result.lines_added;
    total_lines_removed += result.lines_removed;
  }

  const metadata: PrepareDiffMetadata = {
    is_incremental: base.is_incremental,
    since_commit: base.since_commit,
    diff_base: base.diffBase,
    merge_base,
    pr_size: computePrSize(files.length, total_lines_added, total_lines_removed),
    total_files: files.length,
    total_lines_added,
    total_lines_removed,
    files_excluded: filtered.excludedCount,
    excluded_patterns_matched: filtered.excludedPatterns,
    warnings,
  };

  return { metadata, files };
}

export async function loadPrFilesFromPath(filePath: string): Promise<Set<string>> {
  const raw = await readFile(filePath, "utf8");
  const paths = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return new Set(paths);
}

export function printHelp(): void {
  console.log(`Usage: prepare-diff [options]

Options:
  --source <ref>         Source branch or commit (PR head)
  --target <ref>         Target branch (PR base)
  --since-commit <sha>   Optional incremental base commit
  --pr-files <path>      Newline-separated PR file paths
  --output <path>        Write JSON output (default: stdout)
  --cwd <path>           Repository root (default: process.cwd())
  --help                 Show this help
`);
}

export interface CliArgs {
  source: string;
  target: string;
  sinceCommit?: string;
  prFiles: string;
  output?: string;
  cwd: string;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { cwd: process.cwd(), help: false } as CliArgs;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--help" || flag === "-h") {
      args.help = true;
    } else if (flag === "--source" && value) {
      args.source = argv[++i];
    } else if (flag === "--target" && value) {
      args.target = argv[++i];
    } else if (flag === "--since-commit" && value) {
      args.sinceCommit = argv[++i];
    } else if (flag === "--pr-files" && value) {
      args.prFiles = argv[++i];
    } else if (flag === "--output" && value) {
      args.output = argv[++i];
    } else if (flag === "--cwd" && value) {
      args.cwd = argv[++i];
    }
  }
  return args;
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseCliArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.source || !args.target || !args.prFiles) {
    console.error("Missing required flags: --source, --target, --pr-files");
    printHelp();
    return 1;
  }

  const prFiles = await loadPrFilesFromPath(args.prFiles);
  const result = await prepareDiff({
    source: args.source,
    target: args.target,
    sinceCommit: args.sinceCommit,
    prFiles,
    cwd: args.cwd,
  });
  const json = JSON.stringify(result, null, 2);
  if (args.output) {
    await writeFile(args.output, json, "utf8");
  } else {
    console.log(json);
  }
  return 0;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("prepare-diff.ts") || process.argv[1].endsWith("prepare-diff.js"));

if (isMain) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
