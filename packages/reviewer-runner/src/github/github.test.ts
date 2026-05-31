import { describe, expect, it, vi } from "vitest";
import { TRACKING_MARKER, formatTrackingBody } from "./tracking.js";
import {
  type GitHubClient,
  type IssueCommentLike,
  type PullReviewCommentLike,
  findTrackingComment,
  mapInlineReviewToKnownIssues,
  upsertTrackingComment,
} from "./github.js";

const HEAD_SHA = "c".repeat(40);
const PREV_SHA = "a".repeat(40);
const FIXED_AT = new Date("2026-05-30T12:00:00.000Z");

const ctx = {
  owner: "acme",
  repo: "app",
  pullNumber: 42,
  headSha: HEAD_SHA,
};

function trackingBody(sha: string, at: string): string {
  return `${TRACKING_MARKER}
Analyzed up to: ${sha}
At: ${at}`;
}

describe("findTrackingComment", () => {
  it("returns comment id and parsed fields from the latest tracking comment", () => {
    const comments: IssueCommentLike[] = [
      {
        id: 10,
        body: trackingBody(PREV_SHA, "2026-05-30T10:00:00.000Z"),
      },
      {
        id: 20,
        body: trackingBody(HEAD_SHA, "2026-05-30T14:00:00.000Z"),
      },
    ];
    expect(findTrackingComment(comments)).toEqual({
      commentId: 20,
      analyzedSha: HEAD_SHA,
      at: "2026-05-30T14:00:00.000Z",
    });
  });

  it("returns null when no valid tracking comment exists", () => {
    expect(findTrackingComment([{ id: 1, body: "regular comment" }])).toBeNull();
  });
});

describe("mapInlineReviewToKnownIssues", () => {
  it("maps path, line, and full body without truncation", () => {
    const longBody = "x".repeat(500);
    const comments: PullReviewCommentLike[] = [
      { path: "src/a.ts", line: 10, body: longBody },
      { path: "src/b.ts", line: null, body: "no line" },
    ];
    expect(mapInlineReviewToKnownIssues(comments)).toEqual([
      { file: "src/a.ts", line: 10, message: longBody },
    ]);
  });
});

describe("upsertTrackingComment", () => {
  it("creates a new tracking comment when no existing id", async () => {
    const client: GitHubClient = {
      listIssueComments: vi.fn(),
      listPullReviewComments: vi.fn(),
      createIssueComment: vi.fn().mockResolvedValue({ id: 99 }),
      updateIssueComment: vi.fn(),
    };

    const result = await upsertTrackingComment("token", ctx, HEAD_SHA, undefined, {
      client,
      at: FIXED_AT,
    });

    expect(client.createIssueComment).toHaveBeenCalledWith(
      ctx,
      formatTrackingBody(HEAD_SHA, FIXED_AT),
    );
    expect(client.updateIssueComment).not.toHaveBeenCalled();
    expect(result).toEqual({
      commentId: 99,
      body: formatTrackingBody(HEAD_SHA, FIXED_AT),
    });
  });

  it("updates an existing tracking comment in place", async () => {
    const client: GitHubClient = {
      listIssueComments: vi.fn(),
      listPullReviewComments: vi.fn(),
      createIssueComment: vi.fn(),
      updateIssueComment: vi.fn().mockResolvedValue(undefined),
    };

    const result = await upsertTrackingComment("token", ctx, HEAD_SHA, 55, {
      client,
      at: FIXED_AT,
    });

    expect(client.updateIssueComment).toHaveBeenCalledWith(
      ctx,
      55,
      formatTrackingBody(HEAD_SHA, FIXED_AT),
    );
    expect(client.createIssueComment).not.toHaveBeenCalled();
    expect(result.commentId).toBe(55);
  });

  it("logs tracking body on dry-run without calling GitHub", async () => {
    const logger = await import("../support/logger.js");
    const stepSpy = vi.spyOn(logger, "step").mockImplementation(() => {});
    const client: GitHubClient = {
      listIssueComments: vi.fn(),
      listPullReviewComments: vi.fn(),
      createIssueComment: vi.fn(),
      updateIssueComment: vi.fn(),
    };

    const result = await upsertTrackingComment("token", ctx, HEAD_SHA, undefined, {
      client,
      dryRun: true,
      at: FIXED_AT,
    });

    expect(client.createIssueComment).not.toHaveBeenCalled();
    expect(client.updateIssueComment).not.toHaveBeenCalled();
    expect(stepSpy).toHaveBeenCalledWith("tracking (dry-run)");
    expect(result.body).toBe(formatTrackingBody(HEAD_SHA, FIXED_AT));
    stepSpy.mockRestore();
  });
});
