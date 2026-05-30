import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReviewPromptInput } from "./agent.js";
import { FINDINGS_PATH } from "./agent.js";
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
  logReviewMode,
  logReviewScope,
  resolveReviewMode,
  shouldSkipAgent,
  writePrFilesList,
  type GitRunner,
  type ShouldSkipAgentResult,
} from "./git-scope.js";
import * as log from "./logger.js";
import { buildKnownIssuesJson, filterFindingsForPost } from "./post-review.js";

export interface ReviewOrchestrationConfig {
  repoRoot: string;
  base: string;
  head: string;
  headSha: string;
  targetRef: string;
  prTitle?: string;
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
  const readFindings =
    deps.readFindings ??
    ((repoRoot: string) => parseFindingsFile(join(repoRoot, FINDINGS_PATH)));

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
  logReviewMode(mode);

  const scope = await shouldSkipAgent({
    mode: mode.mode,
    sinceCommit: mode.sinceCommit,
    base: config.base,
    head: config.headSha,
    cwd: config.repoRoot,
    runner: git,
  });
  logReviewScope(mode.mode, scope);

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
    log.summary({
      mode: mode.mode,
      findings: "0 (skipped — no effective diff)",
      posted: 0,
      tracking: trackingCommentId ?? "n/a",
    });
    log.done("Review skipped");
    return { status: "skipped", reason: scope.reason ?? "unknown", scope };
  }

  if (config.skipAgent) {
    log.step("skip-agent: not invoking agent");
    await advanceTracking();
    return { status: "skip-agent", scope };
  }

  const aiDir = join(config.repoRoot, ".ai-code-review");
  await mkdir(aiDir, { recursive: true });
  const prFilesPath = join(aiDir, "pr-files.txt");
  const knownIssuesPath = join(aiDir, "known-issues.json");

  log.meta("review mode", mode.mode === "incremental" ? `incremental (since ${mode.sinceCommit})` : "full");
  log.meta("pr files", String(scope.prFiles.length));
  log.meta("effective files", String(scope.effectiveFiles.length));
  log.meta("pr-files.txt", prFilesPath);
  log.meta("known-issues.json", knownIssuesPath);

  await writePrFilesList(scope.prFiles, prFilesPath);

  let knownIssues = [] as ReturnType<typeof mapInlineReviewToKnownIssues>;
  if (gh) {
    const client = gh.client ?? createGitHubClient(gh.token);
    const inline = await listInlineReviewComments(gh.token, gh.ctx, client);
    knownIssues = mapInlineReviewToKnownIssues(inline);
  }
  await writeFile(knownIssuesPath, JSON.stringify(buildKnownIssuesJson(knownIssues), null, 2), "utf8");
  const knownIssuesCount = await countKnownIssues(knownIssuesPath);
  log.meta("known issues", String(knownIssuesCount));

  if (deps.runAgent) {
    try {
      await deps.runAgent({
        repoRoot: config.repoRoot,
        sourceRef: config.headSha,
        targetRef: config.targetRef,
        headSha: config.headSha,
        sinceCommit: mode.sinceCommit,
        prFilesPath,
        knownIssuesPath,
        prTitle: config.prTitle,
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

  log.meta("findings (total)", String(report.findings.length));
  if (droppedOutOfPr > 0) {
    log.warn(`${droppedOutOfPr} finding(s) dropped (outside PR file list)`);
  }
  log.step(`Inline comments to post: ${comments.length} of ${report.findings.length} issue(s)`);

  let posted = 0;
  if (deps.postComments && !config.dryRun) {
    try {
      await deps.postComments(comments);
      posted = comments.length;
      log.ok(`Posted ${posted} inline comment(s) out of ${report.findings.length} issue(s)`);
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
  log.summary({
    mode: mode.mode,
    findings: report.findings.length,
    posted,
    dropped: droppedOutOfPr,
    tracking: trackingCommentId ?? "created",
  });
  log.done("Review complete");
  return {
    status: "completed",
    posted,
    totalFindings: report.findings.length,
    droppedOutOfPr,
    scope,
  };
}
