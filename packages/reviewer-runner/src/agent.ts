import { Agent, CursorAgentError } from "@cursor/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FINDINGS_PATH = ".ai-code-review/findings.json";
const SKILL_PATH = ".cursor/skills/ai-code-review/SKILL.md";

export function buildReviewPrompt(diff: string, prTitle?: string): string {
  const header = prTitle
    ? `Review PR: ${prTitle}\n\n`
    : "";
  return `${header}You are running the ai-code-review skill.

Read and follow every instruction in \`${SKILL_PATH}\`.

After analysis, you MUST write \`${FINDINGS_PATH}\` at the repo root with valid JSON matching the schema in the skill. Do not only describe findings in chat.

Unified diff to review:

\`\`\`diff
${diff}
\`\`\`
`;
}

export async function runReviewAgent(options: {
  cwd: string;
  diff: string;
  apiKey: string;
  prTitle?: string;
}): Promise<void> {
  const prompt = buildReviewPrompt(options.diff, options.prTitle);
  try {
    const result = await Agent.prompt(prompt, {
      apiKey: options.apiKey,
      model: { id: "composer-2.5" },
      local: {
        cwd: options.cwd,
        settingSources: ["project"],
      },
    });
    if (result.status === "error") {
      throw new Error(`Agent run failed: ${result.id ?? "unknown"}`);
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Agent startup failed: ${err.message}`);
    }
    throw err;
  }

  const findingsPath = join(options.cwd, FINDINGS_PATH);
  try {
    await readFile(findingsPath, "utf8");
  } catch {
    throw new Error(
      `Agent did not write ${FINDINGS_PATH}. Ensure the skill ran and created the file.`,
    );
  }
}

export { FINDINGS_PATH };
