import { Octokit } from "@octokit/rest";
import type { InlineReviewComment } from "./comments.js";

export interface PrContext {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
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

export async function postInlineReview(
  token: string,
  ctx: PrContext,
  comments: InlineReviewComment[],
): Promise<void> {
  if (comments.length === 0) {
    console.log("No inline comments to post.");
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
