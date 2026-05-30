#!/usr/bin/env node
import { resolve } from "node:path";
import { parseFindingsFile } from "./findings.js";
import { toInlineReviewComments } from "./comments.js";
import { getUnifiedDiff, resolveShasFromEnv } from "./diff.js";
import { FINDINGS_PATH, runReviewAgent } from "./agent.js";
import { loadPrContextFromEvent, postInlineReview } from "./github.js";
import { resolveRepoRoot } from "./repo-root.js";

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    base: "",
    head: "HEAD",
    cwd: "",
    cwdExplicit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--base" && argv[i + 1]) args.base = argv[++i];
    else if (a === "--head" && argv[i + 1]) args.head = argv[++i];
    else if (a === "--cwd" && argv[i + 1]) {
      args.cwd = resolve(argv[++i]);
      args.cwdExplicit = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.cwdExplicit
    ? args.cwd
    : await resolveRepoRoot(args.cwd || process.cwd());

  const envShas = resolveShasFromEnv();
  const base = args.base || envShas?.base || "";
  const head = args.head || envShas?.head || "HEAD";

  if (!base) {
    console.error("Missing --base or GITHUB_BASE_SHA");
    process.exit(1);
  }

  console.log(`[review] git repo root: ${repoRoot}`);

  const diff = await getUnifiedDiff(base, head, repoRoot);
  console.log(`Diff length: ${diff.length} bytes`);

  if (!args.dryRun) {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      console.error("CURSOR_API_KEY is required unless --dry-run");
      process.exit(1);
    }
    let prTitle: string | undefined;
    if (process.env.GITHUB_EVENT_PATH) {
      const { readFile } = await import("node:fs/promises");
      const event = JSON.parse(
        await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
      ) as { pull_request?: { title?: string } };
      prTitle = event.pull_request?.title;
    }
    await runReviewAgent({ repoRoot, diff, apiKey, prTitle });
  }

  const findingsPath = resolve(repoRoot, FINDINGS_PATH);
  let report;
  if (args.dryRun && !process.env.CURSOR_API_KEY) {
    const { readFile } = await import("node:fs/promises");
    const sample = resolve(
      repoRoot,
      "packages/reviewer-runner/fixtures/findings.json",
    );
    const { parseFindingsJson } = await import("./findings.js");
    report = parseFindingsJson(await readFile(sample, "utf8"));
    console.log(`Dry-run: using fixture findings (no agent)`);
  } else {
    report = await parseFindingsFile(findingsPath);
  }

  const comments = toInlineReviewComments(report);
  console.log(`Inline comments: ${comments.length}`);
  for (const c of comments) {
    console.log(`--- ${c.path}:${c.line} ---\n${c.body}\n`);
  }

  if (args.dryRun) {
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const headSha = process.env.GITHUB_SHA;
  if (!token || !repoFull || !eventPath || !headSha) {
    console.log("Skipping GitHub post (not in Actions PR context).");
    return;
  }

  const ctx = await loadPrContextFromEvent(eventPath, repoFull, headSha);
  await postInlineReview(token, ctx, comments);
  console.log("Posted PR review with inline comments.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
