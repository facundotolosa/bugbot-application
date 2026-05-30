import { Agent, CursorAgentError } from "@cursor/sdk";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { logAgentStreamEvent } from "./agent-stream.js";

const FINDINGS_PATH = ".ai-code-review/findings.json";
const SKILL_PATH = ".cursor/skills/ai-code-review/SKILL.md";

export function buildReviewPrompt(
  diff: string,
  repoRoot: string,
  prTitle?: string,
): string {
  const findingsFile = join(repoRoot, FINDINGS_PATH);
  const header = prTitle
    ? `Review PR: ${prTitle}\n\n`
    : "";
  return `${header}You are running the ai-code-review skill.

Read and follow every instruction in \`${SKILL_PATH}\`.

After analysis, you MUST create or overwrite this file on disk (use the Write/edit tool):
\`${findingsFile}\`

Path is relative to the git repo root: \`${FINDINGS_PATH}\`.
Valid JSON matching the skill schema. Do not only describe findings in chat.

Unified diff to review:

\`\`\`diff
${diff}
\`\`\`
`;
}

export async function runReviewAgent(options: {
  repoRoot: string;
  diff: string;
  apiKey: string;
  prTitle?: string;
}): Promise<void> {
  const findingsPath = join(options.repoRoot, FINDINGS_PATH);
  const prompt = buildReviewPrompt(options.diff, options.repoRoot, options.prTitle);

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
        "Ensure the skill ran and the agent used the Write tool at that path.",
    );
  }
}

export { FINDINGS_PATH };
