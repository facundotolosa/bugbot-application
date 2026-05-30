#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFindingsFile } from "./findings.js";
import { toInlineReviewComments } from "./comments.js";
import { ensureReviewInputFiles, FINDINGS_PATH, runReviewAgent } from "./agent.js";
import { getUnifiedDiff, resolveShasFromEnv } from "./diff.js";
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

async function loadPrMetadata(eventPath?: string): Promise<{
  targetRef: string;
  prTitle?: string;
}> {
  if (!eventPath) {
    return { targetRef: "main" };
  }
  const event = JSON.parse(await readFile(eventPath, "utf8")) as {
    pull_request?: { base?: { ref?: string }; title?: string };
  };
  return {
    targetRef: event.pull_request?.base?.ref ?? "main",
    prTitle: event.pull_request?.title,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.cwdExplicit
    ? args.cwd
    : await resolveRepoRoot(args.cwd || process.cwd());

  const envShas = resolveShasFromEnv();
  const base = args.base || envShas?.base || "";
  const head = args.head || envShas?.head || "HEAD";
  const headSha = process.env.GITHUB_HEAD_SHA ?? head;

  if (!base) {
    console.error("Missing --base or GITHUB_BASE_SHA");
    process.exit(1);
  }

  console.log(`[review] git repo root: ${repoRoot}`);

  const { targetRef, prTitle } = await loadPrMetadata(process.env.GITHUB_EVENT_PATH);
  const { prFilesPath, knownIssuesPath } = await ensureReviewInputFiles(repoRoot, base, head);

  if (!args.dryRun) {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) {
      console.error("CURSOR_API_KEY is required unless --dry-run");
      process.exit(1);
    }
    await runReviewAgent({
      repoRoot,
      sourceRef: headSha,
      targetRef,
      headSha,
      prFilesPath,
      knownIssuesPath,
      apiKey,
      prTitle,
    });
  } else {
    const diff = await getUnifiedDiff(base, head, repoRoot);
    console.log(`Dry-run: diff length ${diff.length} bytes (agent skipped)`);
  }

  const findingsPath = resolve(repoRoot, FINDINGS_PATH);
  let report;
  if (args.dryRun && !process.env.CURSOR_API_KEY) {
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
  const postHeadSha = process.env.GITHUB_HEAD_SHA ?? process.env.GITHUB_SHA;
  if (!token || !repoFull || !eventPath || !postHeadSha) {
    console.log("Skipping GitHub post (not in Actions PR context).");
    return;
  }

  const ctx = await loadPrContextFromEvent(eventPath, repoFull, postHeadSha);
  await postInlineReview(token, ctx, comments);
  console.log("Posted PR review with inline comments.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
