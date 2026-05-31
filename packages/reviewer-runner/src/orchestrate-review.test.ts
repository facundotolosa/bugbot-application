import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPromptInput } from "./agent.js";
import type { FindingsReport } from "./findings.js";
import type { GitHubClient, PrContext } from "./github.js";
import type { GitRunner } from "./git-scope.js";
import { executeReviewOrchestration } from "./orchestrate-review.js";

const HEAD = "b".repeat(40);
const SINCE = "a".repeat(40);

const ctx: PrContext = {
  owner: "acme",
  repo: "app",
  pullNumber: 1,
  headSha: HEAD,
};

let repoRoot = "";

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), "review-orch-"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function baseConfig(overrides: Partial<Parameters<typeof executeReviewOrchestration>[0]> = {}) {
  return {
    repoRoot,
    base: "base",
    head: HEAD,
    headSha: HEAD,
    targetRef: "main",
    dryRun: false,
    skipAgent: false,
    ...overrides,
  };
}

function gitRunner(overrides: Partial<GitRunner> = {}): GitRunner {
  return {
    shaExists: vi.fn().mockResolvedValue(true),
    isAncestor: vi.fn().mockResolvedValue(true),
    fetchOriginSha: vi.fn(),
    fetchDeepen: vi.fn(),
    listPrFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
    listIncrementalFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
    firstParentLog: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

function githubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    listIssueComments: vi.fn().mockResolvedValue([]),
    listPullReviewComments: vi.fn().mockResolvedValue([]),
    createIssueComment: vi.fn().mockResolvedValue({ id: 99 }),
    updateIssueComment: vi.fn(),
    ...overrides,
  };
}

const findings: FindingsReport = {
  version: "2",
  findings: [
    {
      analyzer: "security",
      severity: "major",
      file: "src/a.ts",
      line: 5,
      issue: "p",
      suggestion: "s",
    },
    {
      analyzer: "performance",
      severity: "minor",
      file: "src/a.ts",
      line: 10,
      issue: "dup",
      suggestion: "s",
    },
  ],
};

describe("executeReviewOrchestration", () => {
  it("skips agent and advances tracking on pure sync", async () => {
    const client = githubClient({
      listIssueComments: vi.fn().mockResolvedValue([
        {
          id: 1,
          body: `< ai-review-tracking >\nAnalyzed up to: ${SINCE}\nAt: 2026-05-30T12:00:00.000Z`,
        },
      ]),
    });
    const result = await executeReviewOrchestration(baseConfig(), {
      git: gitRunner({
        firstParentLog: vi.fn().mockResolvedValue(""),
        listIncrementalFiles: vi.fn().mockResolvedValue([]),
        listPrFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
      }),
      github: { token: "t", ctx, client },
      runAgent: vi.fn(),
    });

    expect(result.status).toBe("skipped");
    expect(client.updateIssueComment).toHaveBeenCalled();
    expect(client.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not advance tracking when agent fails", async () => {
    const client = githubClient({
      listIssueComments: vi.fn().mockResolvedValue([
        {
          id: 5,
          body: `< ai-review-tracking >\nAnalyzed up to: ${SINCE}\nAt: 2026-05-30T10:00:00.000Z`,
        },
      ]),
      listPullReviewComments: vi.fn().mockResolvedValue([
        { path: "src/a.ts", line: 10, body: "existing" },
      ]),
    });

    await expect(
      executeReviewOrchestration(baseConfig(), {
        git: gitRunner({
          firstParentLog: vi.fn().mockResolvedValue("abc1234 feat: work\n"),
        }),
        github: { token: "t", ctx, client },
        runAgent: vi.fn().mockRejectedValue(new Error("agent down")),
        readFindings: vi.fn().mockResolvedValue(findings),
      }),
    ).rejects.toThrow(/agent down/i);

    expect(client.updateIssueComment).not.toHaveBeenCalled();
    expect(client.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not advance tracking when post fails after agent", async () => {
    const client = githubClient();
    const runAgent = vi.fn().mockResolvedValue(undefined);

    await expect(
      executeReviewOrchestration(baseConfig(), {
        git: gitRunner({
          firstParentLog: vi.fn().mockResolvedValue("abc1234 feat: work\n"),
        }),
        github: { token: "t", ctx, client },
        runAgent,
        readFindings: vi.fn().mockResolvedValue(findings),
        postComments: vi.fn().mockRejectedValue(new Error("post failed")),
      }),
    ).rejects.toThrow(/post failed/i);

    expect(runAgent).toHaveBeenCalled();
    expect(client.createIssueComment).not.toHaveBeenCalled();
    expect(client.updateIssueComment).not.toHaveBeenCalled();
  });

  it("posts PR-scoped comments and advances tracking on success", async () => {
    const client = githubClient({
      listPullReviewComments: vi.fn().mockResolvedValue([
        { path: "src/a.ts", line: 10, body: "existing thread" },
      ]),
    });
    const postComments = vi.fn().mockResolvedValue(undefined);
    const runAgent = vi.fn(async (_input: ReviewPromptInput) => {});

    const result = await executeReviewOrchestration(baseConfig(), {
      git: gitRunner({
        firstParentLog: vi.fn().mockResolvedValue("abc1234 feat: work\n"),
      }),
      github: { token: "t", ctx, client },
      runAgent,
      readFindings: vi.fn().mockResolvedValue(findings),
      postComments,
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed outcome");
    }
    expect(result.posted).toBe(2);
    expect(postComments).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/a.ts", line: 5 }),
        expect.objectContaining({ path: "src/a.ts", line: 10 }),
      ]),
    );
    expect(client.createIssueComment).toHaveBeenCalled();
  });

  it("dry-run loads fixture findings and logs comments without agent", async () => {
    const logger = await import("./support/logger.js");
    const stepSpy = vi.spyOn(logger, "step").mockImplementation(() => {});
    const metaSpy = vi.spyOn(logger, "meta").mockImplementation(() => {});
    const readFindings = vi.fn().mockResolvedValue(findings);

    const result = await executeReviewOrchestration(baseConfig({ dryRun: true }), {
      git: gitRunner({
        firstParentLog: vi.fn().mockResolvedValue("abc1234 feat: work\n"),
      }),
      readFindings,
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed outcome");
    }
    expect(readFindings).toHaveBeenCalled();
    expect(stepSpy).toHaveBeenCalledWith("dry-run: agent skipped");
    expect(metaSpy).toHaveBeenCalledWith(
      "preview src/a.ts:5",
      expect.any(String),
    );
    stepSpy.mockRestore();
    metaSpy.mockRestore();
  });
});
