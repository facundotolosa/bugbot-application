import { mkdir, writeFile } from "node:fs/promises";
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
  | { status: "completed"; posted: number; scope: ShouldSkipAgentResult };

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
    console.log(`[review] skip: ${scope.reason}`);
    await advanceTracking();
    return { status: "skipped", reason: scope.reason ?? "unknown", scope };
  }

  if (config.skipAgent) {
    console.log("[review] skip-agent: not invoking agent");
    await advanceTracking();
    return { status: "skip-agent", scope };
  }

  const aiDir = join(config.repoRoot, ".ai-code-review");
  await mkdir(aiDir, { recursive: true });
  const prFilesPath = join(aiDir, "pr-files.txt");
  const knownIssuesPath = join(aiDir, "known-issues.json");

  await writePrFilesList(scope.prFiles, prFilesPath);

  let knownIssues = [] as ReturnType<typeof mapInlineReviewToKnownIssues>;
  if (gh) {
    const client = gh.client ?? createGitHubClient(gh.token);
    const inline = await listInlineReviewComments(gh.token, gh.ctx, client);
    knownIssues = mapInlineReviewToKnownIssues(inline);
  }
  await writeFile(knownIssuesPath, JSON.stringify(buildKnownIssuesJson(knownIssues), null, 2), "utf8");

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
      });
    } catch (err) {
      console.error("[review] agent failed; tracking not advanced");
      throw err;
    }
  } else if (config.dryRun) {
    console.log("[review] dry-run: agent skipped");
  } else {
    throw new Error("runAgent dependency is required for agent path");
  }

  const report = await readFindings(config.repoRoot);
  const prFileSet = new Set(scope.prFiles);
  const filtered = filterFindingsForPost(report, prFileSet, knownIssues);
  const comments = toInlineReviewComments({ version: "1", findings: filtered });

  console.log(`Inline comments to post: ${comments.length}`);

  if (deps.postComments && !config.dryRun) {
    try {
      await deps.postComments(comments);
    } catch (err) {
      console.error("[review] GitHub post failed; tracking not advanced");
      throw err;
    }
  } else if (config.dryRun) {
    for (const c of comments) {
      console.log(`--- ${c.path}:${c.line} ---\n${c.body}\n`);
    }
  }

  await advanceTracking();
  return { status: "completed", posted: comments.length, scope };
}
