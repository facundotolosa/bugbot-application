#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runReviewAgent } from "./agent.js";
import { resolveShasFromEnv } from "./diff.js";
import { parseFindingsJson } from "./findings.js";
import { createGitHubClient, loadPrContextFromEvent, postInlineReview } from "./github.js";
import { executeReviewOrchestration } from "./orchestrate-review.js";
import { resolveRepoRoot } from "./repo-root.js";

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    skipAgent: false,
    base: "",
    head: "HEAD",
    cwd: "",
    cwdExplicit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--skip-agent") args.skipAgent = true;
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
  const gitHead = process.env.GITHUB_HEAD_SHA ?? envShas?.head ?? args.head ?? "HEAD";

  if (!base) {
    console.error("Missing --base or GITHUB_BASE_SHA");
    process.exit(1);
  }

  console.log(`[review] git repo root: ${repoRoot}`);

  const { targetRef, prTitle } = await loadPrMetadata(process.env.GITHUB_EVENT_PATH);

  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  const config = {
    repoRoot,
    base,
    head: gitHead,
    headSha: gitHead,
    targetRef,
    prTitle,
    dryRun: args.dryRun,
    skipAgent: args.skipAgent,
  };

  const apiKey = process.env.CURSOR_API_KEY;
  const needsAgent = !args.dryRun && !args.skipAgent;

  if (needsAgent && !apiKey) {
    console.error("CURSOR_API_KEY is required unless --dry-run or --skip-agent");
    process.exit(1);
  }

  let githubDeps;
  if (token && repoFull && eventPath) {
    const ctx = await loadPrContextFromEvent(eventPath, repoFull, gitHead);
    githubDeps = { token, ctx, client: createGitHubClient(token) };
  }

  const fixturePath = resolve(
    repoRoot,
    "packages/reviewer-runner/fixtures/findings.json",
  );

  const outcome = await executeReviewOrchestration(config, {
    github: githubDeps,
    runAgent: needsAgent
      ? (input) => runReviewAgent({ ...input, apiKey: apiKey! })
      : undefined,
    readFindings: args.dryRun
      ? async () => parseFindingsJson(await readFile(fixturePath, "utf8"))
      : undefined,
    postComments:
      githubDeps && !args.dryRun
        ? (comments) => postInlineReview(githubDeps.token, githubDeps.ctx, comments)
        : undefined,
  });

  if (outcome.status === "skipped") {
    console.log(`Review skipped (${outcome.reason}).`);
    return;
  }
  if (outcome.status === "skip-agent") {
    console.log("Review finished (--skip-agent).");
    return;
  }

  console.log(`Review completed. Inline comments: ${outcome.posted}`);
  if (!githubDeps && !args.dryRun) {
    console.log("Skipping GitHub post (not in Actions PR context).");
  } else if (args.dryRun) {
    console.log("Dry-run: no GitHub post.");
  } else {
    console.log("Posted PR review with inline comments.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
