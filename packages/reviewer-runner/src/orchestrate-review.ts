import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReviewPromptInput } from "./agent.js";
import {
  createReviewRunDir,
  findingsPathInRun,
  REVIEW_RUN_FILES,
} from "./paths/review-run-dir.js";
import { toInlineReviewComments, type InlineReviewComment } from "./comments.js";
import { parseFindingsFile, type FindingsReport } from "./findings.js";
import {
  createGitHubClient,
  findTrackingComment,
  listInlineReviewComments,
  listIssueComments,
  mapInlineReviewToKnownIssues,
  type FoundTrackingComment,
  type GitHubClient,
  type PrContext,
  upsertTrackingComment,
} from "./github.js";
import {
  createExecGitRunner,
  resolveReviewMode,
  shouldSkipAgent,
  writePrFilesList,
  type GitRunner,
  type ShouldSkipAgentResult,
} from "./git-scope.js";
import * as log from "./support/logger.js";
import { buildKnownIssuesJson, filterFindingsForPost } from "./post-review.js";

function formatTrackingRef(commentId: number | undefined): string | undefined {
  if (commentId == null) {
    return undefined;
  }
  return `#${commentId}`;
}

export interface ReviewOrchestrationConfig {
  repoRoot: string;
  base: string;
  head: string;
  headSha: string;
  targetRef: string;
  sourceBranch?: string;
  dryRun: boolean;
  skipAgent: boolean;
}

export interface ReviewOrchestrationGitHub {
  token: string;
  ctx: PrContext;
  client?: GitHubClient;
}

export interface ReviewOrchestrationDeps {
  git?: GitRunner;
  github?: ReviewOrchestrationGitHub;
  runAgent?: (input: ReviewPromptInput) => Promise<void>;
  readFindings?: (repoRoot: string) => Promise<FindingsReport>;
  postComments?: (comments: InlineReviewComment[]) => Promise<void>;
  now?: () => Date;
}

export type ReviewOutcome =
  | { status: "skipped"; reason: string; scope: ShouldSkipAgentResult }
  | { status: "skip-agent"; scope: ShouldSkipAgentResult }
  | {
      status: "completed";
      posted: number;
      totalFindings: number;
      droppedOutOfPr: number;
      scope: ShouldSkipAgentResult;
    };

async function countKnownIssues(path: string): Promise<number> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as { issues?: unknown[] };
    return Array.isArray(raw.issues) ? raw.issues.length : 0;
  } catch {
    return 0;
  }
}

export async function executeReviewOrchestration(
  config: ReviewOrchestrationConfig,
  deps: ReviewOrchestrationDeps = {},
): Promise<ReviewOutcome> {
  const git = deps.git ?? createExecGitRunner();
  const now = deps.now ?? (() => new Date());
  let reviewRunDir = "";
  const readFindings =
    deps.readFindings ??
    ((repoRoot: string) => {
      const path = reviewRunDir
        ? findingsPathInRun(reviewRunDir)
        : findingsPathInRun(join(repoRoot, ".ai-code-review", "missing-run"));
      return parseFindingsFile(path);
    });

  let tracking: FoundTrackingComment | null = null;
  let trackingCommentId: number | undefined;
  const gh = deps.github;

  if (gh) {
    const client = gh.client ?? createGitHubClient(gh.token);
    const issueComments = await listIssueComments(gh.token, gh.ctx, client);
    tracking = findTrackingComment(issueComments);
    trackingCommentId = tracking?.commentId;
  }

  const mode = await resolveReviewMode({
    tracking,
    head: config.headSha,
    cwd: config.repoRoot,
    runner: git,
  });
  const scope = await shouldSkipAgent({
    mode: mode.mode,
    sinceCommit: mode.sinceCommit,
    base: config.base,
    head: config.headSha,
    cwd: config.repoRoot,
    runner: git,
  });
  async function advanceTracking(): Promise<void> {
    if (!gh) {
      return;
    }
    const client = gh.client ?? createGitHubClient(gh.token);
    const result = await upsertTrackingComment(gh.token, gh.ctx, config.headSha, trackingCommentId, {
      client,
      dryRun: config.dryRun,
      at: now(),
    });
    trackingCommentId = result.commentId;
  }

  if (scope.skip) {
    log.warn(`Skipping agent: ${scope.reason ?? "unknown"}`);
    await advanceTracking();
    log.reviewOutcome("skipped", {
      mode: mode.mode,
      findings: 0,
      posted: 0,
      tracking: formatTrackingRef(trackingCommentId),
    });
    return { status: "skipped", reason: scope.reason ?? "unknown", scope };
  }

  if (config.skipAgent) {
    log.step("skip-agent: not invoking agent");
    await advanceTracking();
    return { status: "skip-agent", scope };
  }

  reviewRunDir = await createReviewRunDir(config.repoRoot, now());
  const prFilesPath = join(reviewRunDir, REVIEW_RUN_FILES.prFiles);
  const knownIssuesPath = join(reviewRunDir, REVIEW_RUN_FILES.knownIssues);

  await writePrFilesList(scope.prFiles, prFilesPath);

  let knownIssues = [] as ReturnType<typeof mapInlineReviewToKnownIssues>;
  if (gh) {
    const client = gh.client ?? createGitHubClient(gh.token);
    const inline = await listInlineReviewComments(gh.token, gh.ctx, client);
    knownIssues = mapInlineReviewToKnownIssues(inline);
  }
  await writeFile(knownIssuesPath, JSON.stringify(buildKnownIssuesJson(knownIssues), null, 2), "utf8");
  const knownIssuesCount = await countKnownIssues(knownIssuesPath);

  if (deps.runAgent) {
    try {
      await deps.runAgent({
        repoRoot: config.repoRoot,
        reviewRunDir,
        sourceRef: config.headSha,
        targetRef: config.targetRef,
        headSha: config.headSha,
        sinceCommit: mode.sinceCommit,
        prFilesPath,
        knownIssuesPath,
        sourceBranch: config.sourceBranch,
        knownIssuesCount,
      });
    } catch (err) {
      log.error("Agent failed; tracking comment not advanced");
      throw err;
    }
  } else if (config.dryRun) {
    log.step("dry-run: agent skipped");
  } else {
    throw new Error("runAgent dependency is required for agent path");
  }

  const report = await readFindings(config.repoRoot);
  const prFileSet = new Set(scope.prFiles);
  const { findings: filtered, droppedOutOfPr } = filterFindingsForPost(report, prFileSet);
  const comments = toInlineReviewComments({ ...report, findings: filtered });

  if (droppedOutOfPr > 0) {
    log.warn(`${droppedOutOfPr} finding(s) dropped (outside PR file list)`);
  }

  let posted = 0;
  if (deps.postComments && !config.dryRun) {
    try {
      await deps.postComments(comments);
      posted = comments.length;
    } catch (err) {
      log.error("GitHub post failed; tracking not advanced");
      throw err;
    }
  } else if (config.dryRun) {
    for (const c of comments) {
      log.meta(`preview ${c.path}:${c.line}`, c.body.split("\n")[0] ?? "");
    }
  }

  await advanceTracking();
  log.reviewOutcome("complete", {
    mode: mode.mode,
    findings: report.findings.length,
    posted,
    dropped: droppedOutOfPr > 0 ? droppedOutOfPr : undefined,
    tracking: formatTrackingRef(trackingCommentId),
  });
  return {
    status: "completed",
    posted,
    totalFindings: report.findings.length,
    droppedOutOfPr,
    scope,
  };
}
