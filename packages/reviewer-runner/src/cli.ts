#!/usr/bin/env node
import { loadRepoEnv } from "./support/load-repo-env.js";

loadRepoEnv();

import { installProcessGuards } from "./support/process-guard.js";

installProcessGuards();

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runReviewAgent } from "./agent/agent.js";
import { resolveShasFromEnv } from "./git/diff.js";
import { parseFindingsJson } from "./findings/findings.js";
import { createGitHubClient, loadPrContextFromEvent, postInlineReview } from "./github/github.js";
import * as log from "./support/logger.js";
import { executeReviewOrchestration } from "./orchestration/orchestrate-review.js";
import { resolveRepoRoot } from "./paths/repo-root.js";

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
  sourceBranch?: string;
  prNumber?: number;
}> {
  if (!eventPath) {
    return { targetRef: "main" };
  }
  const event = JSON.parse(await readFile(eventPath, "utf8")) as {
    pull_request?: {
      base?: { ref?: string };
      head?: { ref?: string };
      number?: number;
    };
  };
  return {
    targetRef: event.pull_request?.base?.ref ?? "main",
    sourceBranch: event.pull_request?.head?.ref,
    prNumber: event.pull_request?.number,
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
    log.error("Missing --base or GITHUB_BASE_SHA");
    process.exit(1);
  }

  log.header("AI Code Review");

  const { targetRef, sourceBranch } = await loadPrMetadata(
    process.env.GITHUB_EVENT_PATH,
  );

  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  const config = {
    repoRoot,
    base,
    head: gitHead,
    headSha: gitHead,
    targetRef,
    sourceBranch,
    dryRun: args.dryRun,
    skipAgent: args.skipAgent,
  };

  const apiKey = process.env.CURSOR_API_KEY;
  const needsAgent = !args.dryRun && !args.skipAgent;

  if (needsAgent && !apiKey) {
    log.error(
      "CURSOR_API_KEY is required unless --dry-run or --skip-agent (set in repo root .env or environment)",
    );
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
    return;
  }
  if (outcome.status === "skip-agent") {
    log.done("Review finished (--skip-agent)");
    return;
  }

  if (!githubDeps && !args.dryRun) {
    log.step("Skipping GitHub post (not in Actions PR context)");
  } else if (args.dryRun) {
    log.step("Dry-run: no GitHub post");
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
