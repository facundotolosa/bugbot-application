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
const PREPARE_DIFF_OUTPUT = ".ai-code-review/prepare-diff.json";
const SKILL_PATH = ".cursor/skills/ai-code-review/SKILL.md";
const PREPARE_DIFF_SCRIPT = ".cursor/skills/ai-code-review/scripts/prepare-diff.ts";
const MODEL_ID = "composer-2.5";

export interface ReviewPromptInput {
  repoRoot: string;
  sourceRef: string;
  targetRef: string;
  headSha: string;
  sinceCommit?: string;
  knownIssuesPath?: string;
  prFilesPath?: string;
  prTitle?: string;
  knownIssuesCount?: number;
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const findingsFile = join(input.repoRoot, FINDINGS_PATH);
  const prepareDiffOutput = join(input.repoRoot, PREPARE_DIFF_OUTPUT);
  const header = input.prTitle ? `Review PR: ${input.prTitle}\n\n` : "";

  const sinceLine = input.sinceCommit
    ? `Since commit: ${input.sinceCommit}\n`
    : "";

  const knownIssuesLine = input.knownIssuesPath
    ? `Known issues JSON: \`${input.knownIssuesPath}\`\n`
    : "";

  const prFilesLine = input.prFilesPath
    ? `PR files list: \`${input.prFilesPath}\`\n`
    : "PR files list: (required — use the path provided by the runner or generate from PR scope)\n";

  const prepareDiffCmd = [
    "npx tsx",
    PREPARE_DIFF_SCRIPT,
    `--source ${input.sourceRef}`,
    `--target ${input.targetRef}`,
    input.prFilesPath ? `--pr-files ${input.prFilesPath}` : "",
    input.sinceCommit ? `--since-commit ${input.sinceCommit}` : "",
    `--output ${PREPARE_DIFF_OUTPUT}`,
  ]
    .filter(Boolean)
    .join(" ");

  return `${header}You are running the **ai-code-review orchestrator** skill (one SDK agent; the skill delegates to security/performance subagents via Task).

Read and follow every instruction in \`${SKILL_PATH}\`.

${sinceLine}Source branch/ref: ${input.sourceRef}
Target branch/ref: ${input.targetRef}
Current head SHA: ${input.headSha}
${prFilesLine}${knownIssuesLine}
## Required steps

1. Run prepare-diff from the repo root:
   \`${prepareDiffCmd}\`
2. Read the JSON at \`${prepareDiffOutput}\`.
3. Print the 📊 Diff stats emoji block to stdout (see skill Progress visibility); print immediate \`Warning:\` lines for fallback and metadata.warnings when applicable.
4. Write \`.ai-code-review/work/diff.json\` (same payload as prepare-diff output).
5. Select analyzers per the skill; log \`Analyzers: ...\` to stdout.
6. Launch security and/or performance analyzer subagents in **one parallel Task batch** (two-line prompts only; see skill).
7. Collect analyzer output files; retry once on missing/invalid JSON per skill.
8. Run validator path per skill; log \`Validator funnel: ...\` when applicable.
9. Print the consolidated emoji close block (📋→🎯) then exactly one final line: \`Report written to: .ai-code-review/findings.json\`.
10. Overwrite \`${findingsFile}\` with schema v2 findings before finishing.

Do not perform heuristic analysis in this agent. Do not only describe findings in chat. Do not rely on a pre-inlined unified diff in this prompt.
`;
}

export interface RunReviewAgentOptions extends ReviewPromptInput {
  apiKey: string;
}

export async function runReviewAgent(options: RunReviewAgentOptions): Promise<void> {
  const findingsPath = join(options.repoRoot, FINDINGS_PATH);
  const prompt = buildReviewPrompt(options);
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
    log.meta("run id", run.id);
    log.meta("agent id", agent.agentId);

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

export { FINDINGS_PATH, PREPARE_DIFF_SCRIPT, SKILL_PATH };
