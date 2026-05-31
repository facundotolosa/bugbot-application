import { Octokit } from "@octokit/rest";
import type { InlineReviewComment } from "./comments.js";
import * as log from "./logger.js";
import { formatTrackingBody, parseTrackingComment, selectTrackingComment } from "./tracking.js";

export interface PrContext {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}

export interface IssueCommentLike {
  id: number;
  body: string;
}

export interface FoundTrackingComment {
  commentId: number;
  analyzedSha: string;
  at: string;
}

export interface KnownIssue {
  file: string;
  line: number;
  message: string;
}

export interface PullReviewCommentLike {
  path: string;
  line: number | null;
  body: string;
}

export interface GitHubClient {
  listIssueComments(ctx: PrContext): Promise<IssueCommentLike[]>;
  listPullReviewComments(ctx: PrContext): Promise<PullReviewCommentLike[]>;
  createIssueComment(ctx: PrContext, body: string): Promise<{ id: number }>;
  updateIssueComment(ctx: PrContext, commentId: number, body: string): Promise<void>;
}

export function createGitHubClient(token: string): GitHubClient {
  const octokit = new Octokit({ auth: token });
  return {
    async listIssueComments(ctx) {
      const comments = await octokit.paginate(octokit.issues.listComments, {
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: ctx.pullNumber,
        per_page: 100,
      });
      return comments.map((c) => ({
        id: c.id,
        body: c.body ?? "",
      }));
    },
    async listPullReviewComments(ctx) {
      const comments = await octokit.paginate(octokit.pulls.listReviewComments, {
        owner: ctx.owner,
        repo: ctx.repo,
        pull_number: ctx.pullNumber,
        per_page: 100,
      });
      return comments.map((c) => ({
        path: c.path,
        line: c.line ?? null,
        body: c.body,
      }));
    },
    async createIssueComment(ctx, body) {
      const { data } = await octokit.issues.createComment({
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: ctx.pullNumber,
        body,
      });
      return { id: data.id };
    },
    async updateIssueComment(ctx, commentId, body) {
      await octokit.issues.updateComment({
        owner: ctx.owner,
        repo: ctx.repo,
        comment_id: commentId,
        body,
      });
    },
  };
}

export function parseRepository(repoFull: string): { owner: string; repo: string } {
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repoFull}`);
  }
  return { owner, repo };
}

export async function loadPrContextFromEvent(
  eventPath: string,
  repoFull: string,
  headSha: string,
): Promise<PrContext> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(eventPath, "utf8");
  const event = JSON.parse(raw) as {
    pull_request?: { number: number };
    number?: number;
  };
  const pullNumber = event.pull_request?.number ?? event.number;
  if (!pullNumber) {
    throw new Error("GitHub event does not include pull request number");
  }
  const { owner, repo } = parseRepository(repoFull);
  return { owner, repo, pullNumber, headSha };
}

export function findTrackingComment(
  comments: readonly IssueCommentLike[],
): FoundTrackingComment | null {
  const selected = selectTrackingComment(comments);
  if (!selected) {
    return null;
  }
  const parsed = parseTrackingComment(selected.body);
  if (!parsed) {
    return null;
  }
  return {
    commentId: selected.id,
    analyzedSha: parsed.analyzedSha,
    at: parsed.at,
  };
}

export function mapInlineReviewToKnownIssues(
  comments: readonly PullReviewCommentLike[],
): KnownIssue[] {
  const issues: KnownIssue[] = [];
  for (const comment of comments) {
    if (comment.line == null) {
      continue;
    }
    issues.push({
      file: comment.path,
      line: comment.line,
      message: comment.body,
    });
  }
  return issues;
}

export async function listIssueComments(
  token: string,
  ctx: PrContext,
  client?: GitHubClient,
): Promise<IssueCommentLike[]> {
  const api = client ?? createGitHubClient(token);
  return api.listIssueComments(ctx);
}

export async function listInlineReviewComments(
  token: string,
  ctx: PrContext,
  client?: GitHubClient,
): Promise<PullReviewCommentLike[]> {
  const api = client ?? createGitHubClient(token);
  return api.listPullReviewComments(ctx);
}

export interface UpsertTrackingOptions {
  client?: GitHubClient;
  dryRun?: boolean;
  at?: Date;
}

export async function upsertTrackingComment(
  token: string,
  ctx: PrContext,
  headSha: string,
  existingCommentId?: number,
  options: UpsertTrackingOptions = {},
): Promise<{ commentId: number; body: string }> {
  const at = options.at ?? new Date();
  const body = formatTrackingBody(headSha, at);

  if (options.dryRun) {
    log.step("tracking (dry-run)");
    log.meta("body", body);
    return { commentId: existingCommentId ?? 0, body };
  }

  const api = options.client ?? createGitHubClient(token);

  if (existingCommentId != null) {
    await api.updateIssueComment(ctx, existingCommentId, body);
    return { commentId: existingCommentId, body };
  }

  const created = await api.createIssueComment(ctx, body);
  return { commentId: created.id, body };
}

export async function postInlineReview(
  token: string,
  ctx: PrContext,
  comments: InlineReviewComment[],
): Promise<void> {
  if (comments.length === 0) {
    return;
  }
  const octokit = new Octokit({ auth: token });
  await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    commit_id: ctx.headSha,
    event: "COMMENT",
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
    })),
  });
}
