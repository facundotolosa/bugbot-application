import { Agent, CursorAgentError } from "@cursor/sdk";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logAgentStreamEvent } from "./agent-stream.js";

const FINDINGS_PATH = ".ai-code-review/findings.json";
const PREPARE_DIFF_OUTPUT = ".ai-code-review/prepare-diff.json";
const SKILL_PATH = ".cursor/skills/ai-code-review/SKILL.md";
const PREPARE_DIFF_SCRIPT = ".cursor/skills/ai-code-review/scripts/prepare-diff.ts";

export interface ReviewPromptInput {
  repoRoot: string;
  sourceRef: string;
  targetRef: string;
  headSha: string;
  sinceCommit?: string;
  knownIssuesPath?: string;
  prFilesPath?: string;
  prTitle?: string;
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

  return `${header}You are running the ai-code-review skill.

Read and follow every instruction in \`${SKILL_PATH}\`.

${sinceLine}Source branch/ref: ${input.sourceRef}
Target branch/ref: ${input.targetRef}
Current head SHA: ${input.headSha}
${prFilesLine}${knownIssuesLine}
## Required steps

1. Run prepare-diff from the repo root:
   \`${prepareDiffCmd}\`
2. Read the JSON at \`${prepareDiffOutput}\`.
3. Print the mandatory diff run summary block to stdout (see skill — incremental vs full examples).
4. If incremental was requested but metadata.is_incremental is false, print Warning lines for fallback and metadata.warnings.
5. Analyze only the per-file diffs in that JSON.
6. Create or overwrite \`${findingsFile}\` with valid JSON matching the skill schema (use Write/edit tool).
   Repo-relative path: \`${FINDINGS_PATH}\`.

Do not only describe findings in chat. Do not rely on a pre-inlined unified diff in this prompt.
`;
}

export async function runReviewAgent(options: ReviewPromptInput & { apiKey: string }): Promise<void> {
  const findingsPath = join(options.repoRoot, FINDINGS_PATH);
  const prompt = buildReviewPrompt(options);

  console.log(`[review] repo root: ${options.repoRoot}`);
  console.log(`[review] expecting findings at: ${findingsPath}`);

  const agent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: "composer-2.5" },
    local: {
      cwd: options.repoRoot,
      settingSources: ["project"],
    },
  });

  try {
    const run = await agent.send(prompt);
    console.log(`[agent] started run id=${run.id} agentId=${agent.agentId}`);

    for await (const event of run.stream()) {
      logAgentStreamEvent(event);
    }

    const result = await run.wait();
    console.log(
      `\n[agent] finished status=${result.status} durationMs=${result.durationMs ?? "?"}`,
    );
    if (result.status === "error") {
      throw new Error(`Agent run failed: ${result.id ?? run.id}`);
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Agent startup failed: ${err.message}`);
    }
    throw err;
  } finally {
    await agent[Symbol.asyncDispose]();
  }

  try {
    await access(findingsPath);
    await readFile(findingsPath, "utf8");
  } catch {
    throw new Error(
      `Agent did not write ${FINDINGS_PATH} at repo root (${findingsPath}). ` +
        "Ensure the skill ran prepare-diff and used the Write tool for findings.",
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
  await writeFile(knownIssuesPath, JSON.stringify({ issues: [] }, null, 2), "utf8");

  return { prFilesPath, knownIssuesPath };
}

export { FINDINGS_PATH, PREPARE_DIFF_SCRIPT, SKILL_PATH };
