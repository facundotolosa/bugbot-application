import { Agent, CursorAgentError } from "@cursor/sdk";
import type { SDKMessage } from "@cursor/sdk";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  flushOrchestratorStream,
  logAgentStreamEvent,
  resetOrchestratorStream,
} from "./agent-stream.js";
import { parseFindingsFile } from "./findings.js";
import * as log from "./logger.js";
import { writeRunArtifacts } from "./run-artifacts.js";

const FINDINGS_PATH = ".ai-code-review/findings.json";
const SKILL_PATH = ".cursor/skills/ai-code-review/SKILL.md";
const MODEL_ID = "composer-2.5";

export interface ReviewPromptInput {
  repoRoot: string;
  sourceRef: string;
  targetRef: string;
  headSha: string;
  sourceBranch?: string;
  sinceCommit?: string;
  knownIssuesPath?: string;
  prFilesPath?: string;
  prTitle?: string;
  knownIssuesCount?: number;
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const reportFile = join(input.repoRoot, FINDINGS_PATH);
  const knownIssuesFile =
    input.knownIssuesPath ?? join(input.repoRoot, ".ai-code-review/known-issues.json");
  const prFilesFile =
    input.prFilesPath ?? join(input.repoRoot, ".ai-code-review/pr-files.txt");

  const lines = [
    `Use the ai-code-review skill at \`${SKILL_PATH}\` with the following parameters:`,
    `  Source ref: ${input.sourceRef}`,
    `  Target branch: ${input.targetRef}`,
    `  Commit: ${input.headSha}`,
  ];

  if (input.sourceBranch) {
    lines.push(`  Source branch: ${input.sourceBranch}`);
  }
  if (input.sinceCommit) {
    lines.push(`  Since commit: ${input.sinceCommit}`);
  }

  lines.push(
    `  Report file: ${reportFile}`,
    `  Known issues file: ${knownIssuesFile}`,
    `  PR files file: ${prFilesFile}`,
  );

  if (input.prTitle) {
    lines.push("", `PR title: ${input.prTitle}`);
  }

  return lines.join("\n");
}

export interface RunReviewAgentOptions extends ReviewPromptInput {
  apiKey: string;
  /** When set (e.g. E2E evals), sent to the agent instead of `buildReviewPrompt(options)`. */
  prompt?: string;
}

export async function runReviewAgent(options: RunReviewAgentOptions): Promise<void> {
  const findingsPath = join(options.repoRoot, FINDINGS_PATH);
  const prompt = options.prompt ?? buildReviewPrompt(options);
  const knownIssues = options.knownIssuesCount ?? 0;

  log.prompt(prompt, { chars: prompt.length, knownIssues });
  log.step("Launching Cursor agent…");

  const startedAt = new Date().toISOString();
  const streamEvents: SDKMessage[] = [];
  let runId = "";

  const agent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: MODEL_ID },
    local: {
      cwd: options.repoRoot,
      settingSources: ["project"],
    },
  });

  try {
    const run = await agent.send(prompt);
    runId = run.id;

    resetOrchestratorStream();
    for await (const event of run.stream()) {
      streamEvents.push(event);
      logAgentStreamEvent(event);
    }
    flushOrchestratorStream();

    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(`Agent run failed: ${result.id ?? run.id}`);
    }
    log.ok(`Agent completed (${result.durationMs ?? "?"} ms)`);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Agent startup failed: ${err.message}`);
    }
    throw err;
  } finally {
    const endedAt = new Date().toISOString();
    const artifactsDir = join(options.repoRoot, ".ai-code-review/run-artifacts");
    await mkdir(artifactsDir, { recursive: true }).catch(() => {});
    try {
      await writeRunArtifacts(artifactsDir, {
        runId: runId || agent.agentId,
        modelId: MODEL_ID,
        prompt,
        events: streamEvents,
        startedAt,
        endedAt,
      });
    } catch {
      // Artifacts are best-effort; do not mask agent errors.
    }
    await agent[Symbol.asyncDispose]();
  }

  try {
    await parseFindingsFile(findingsPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Agent did not write valid ${FINDINGS_PATH} at repo root (${findingsPath}): ${message}. ` +
        "Check [orchestrator] lines above and .ai-code-review/run-artifacts/ for the full trace.",
    );
  }
}

export async function ensureReviewInputFiles(
  repoRoot: string,
  base: string,
  head: string,
): Promise<{ prFilesPath: string; knownIssuesPath: string }> {
  const { listPrFiles, writePrFilesList } = await import("./git-scope.js");
  const aiDir = join(repoRoot, ".ai-code-review");
  await mkdir(aiDir, { recursive: true });

  const prFilesPath = join(aiDir, "pr-files.txt");
  const knownIssuesPath = join(aiDir, "known-issues.json");

  const prFiles = await listPrFiles(base, head, repoRoot);
  await writePrFilesList(prFiles, prFilesPath);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(knownIssuesPath, JSON.stringify({ issues: [] }, null, 2), "utf8");

  return { prFilesPath, knownIssuesPath };
}

export { FINDINGS_PATH, SKILL_PATH };
