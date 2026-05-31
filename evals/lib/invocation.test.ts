import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DURABLE_PATHS,
  MODEL_ID,
  SETTING_SOURCES,
  SUBAGENT_TYPES,
  buildComponentHarnessPrompt,
  performanceTaskPrompt,
  securityTaskPrompt,
  sessionPaths,
  validatorTaskPrompt,
} from "./invocation.js";
import { createEvalSession } from "./session.js";

const REPO_ROOT = join(import.meta.dirname, "../..");

function readAgentName(filename: string): string {
  const content = readFileSync(
    join(REPO_ROOT, ".cursor/agents", filename),
    "utf8",
  );
  const match = content.match(/^name:\s*(.+)$/m);
  if (!match) throw new Error(`name not found in ${filename}`);
  return match[1]!.trim();
}

describe("invocation parity", () => {
  it("exports production model and settingSources", () => {
    expect(MODEL_ID).toBe("composer-2.5");
    expect(SETTING_SOURCES).toEqual(["project"]);
  });

  it("securityTaskPrompt uses absolute session paths (two lines)", async () => {
    const session = await createEvalSession();
    try {
      const prompt = securityTaskPrompt(session.sessionDir);
      const lines = prompt.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(`Read diff from: ${session.manifest.diff}`);
      expect(lines[1]).toBe(
        `Write findings to: ${session.manifest.security}`,
      );
      expect(lines[0]).toMatch(/^Read diff from: \//);
    } finally {
      await session.cleanup();
    }
  });

  it("performanceTaskPrompt uses absolute session paths (two lines)", async () => {
    const session = await createEvalSession();
    try {
      const prompt = performanceTaskPrompt(session.sessionDir);
      expect(prompt.split("\n")).toHaveLength(2);
      expect(prompt).toContain(session.manifest.performance);
    } finally {
      await session.cleanup();
    }
  });

  it("validatorTaskPrompt uses absolute session paths (three lines)", async () => {
    const session = await createEvalSession();
    const ws = "/tmp/eval-worktree";
    try {
      const prompt = validatorTaskPrompt(session.sessionDir, ws);
      const lines = prompt.split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(`Read findings from: ${session.manifest.raw}`);
      expect(lines[1]).toBe(
        `Read known issues from: ${join(ws, DURABLE_PATHS.knownIssues)}`,
      );
      expect(lines[2]).toBe(`Write output to: ${session.manifest.validatorOut}`);
    } finally {
      await session.cleanup();
    }
  });

  it("SUBAGENT_TYPES match .cursor/agents frontmatter name", () => {
    expect(SUBAGENT_TYPES.security).toBe(
      readAgentName("ai-code-review-security-analyzer.md"),
    );
    expect(SUBAGENT_TYPES.performance).toBe(
      readAgentName("ai-code-review-performance-analyzer.md"),
    );
    expect(SUBAGENT_TYPES.validator).toBe(
      readAgentName("ai-code-review-validator.md"),
    );
  });

  it("sessionPaths align with manifest schema v1", async () => {
    const session = await createEvalSession();
    try {
      const p = sessionPaths(session.sessionDir);
      expect(p.version).toBe("1");
      expect(p.diff).toContain("diff.json");
      expect(p.security).toContain("security-findings.json");
      expect(p.validatorOut).toContain("validator-output.json");
    } finally {
      await session.cleanup();
    }
  });

  it("buildComponentHarnessPrompt embeds subagent_type and task lines only", () => {
    const prompt = buildComponentHarnessPrompt(SUBAGENT_TYPES.security, [
      "line-a",
      "line-b",
    ].join("\n"));
    expect(prompt).toContain(`subagent_type: ${SUBAGENT_TYPES.security}`);
    expect(prompt).toContain("line-a\nline-b");
    expect(prompt).toContain("Task tool");
    expect(prompt).not.toMatch(/severity|false.?positive|root.?cause/i);
  });

  it("DURABLE_PATHS exclude ephemeral work/", () => {
    expect(DURABLE_PATHS.findings).toBe(".ai-code-review/findings.json");
    expect(DURABLE_PATHS.knownIssues).toBe(".ai-code-review/known-issues.json");
  });
});
