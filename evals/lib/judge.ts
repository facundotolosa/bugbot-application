import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Agent } from "@cursor/sdk";

import { getJudgeModelId } from "../config.js";
import type { ExpectationJudgeRequest, JudgeResult } from "./types.js";

export type JudgeFn = (
  request: ExpectationJudgeRequest,
) => Promise<JudgeResult>;

export function buildJudgePrompt(request: ExpectationJudgeRequest): string {
  const expectationJson = JSON.stringify(request.expectation, null, 2);
  const findingsJson = JSON.stringify(request.findingsPayload, null, 2);

  return [
    "You are an eval judge for an AI code review golden case.",
    "Decide whether the findings under review satisfy the expectation.",
    "",
    `Expectation type: ${request.kind}`,
    `Case rubric: ${request.rubric}`,
    "",
    "Expectation details:",
    expectationJson,
    "",
    "Findings under review (JSON):",
    findingsJson,
    "",
    'Respond with JSON only: {"pass": true|false, "reason": "brief explanation"}',
  ].join("\n");
}

function parseJudgeResponse(text: string): JudgeResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("Judge response is not valid JSON");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Judge response must be an object");
  }
  const record = data as Record<string, unknown>;
  if (typeof record.pass !== "boolean") {
    throw new Error('Judge response must include boolean "pass"');
  }
  if (typeof record.reason !== "string" || record.reason.trim() === "") {
    throw new Error('Judge response must include non-empty string "reason"');
  }
  return { pass: record.pass, reason: record.reason };
}

function collectAssistantText(events: AsyncIterable<{ type: string; message?: { content: Array<{ type: string; text?: string }> } }>): Promise<string> {
  return (async () => {
    let responseText = "";
    for await (const event of events) {
      if (event.type !== "assistant" || !event.message) continue;
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          responseText += block.text;
        }
      }
    }
    return responseText;
  })();
}

export async function runJudgeWithAgent(
  request: ExpectationJudgeRequest,
  options: { repoRoot: string; transcriptDir: string },
): Promise<JudgeResult> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required to run LLM judge");
  }

  const prompt = buildJudgePrompt(request);
  const agent = await Agent.create({
    apiKey,
    model: { id: getJudgeModelId() },
    local: {
      cwd: options.repoRoot,
      settingSources: ["project"],
    },
  });

  const run = await agent.send(prompt);
  const responseText = await collectAssistantText(run.stream());
  const waitResult = await run.wait();
  if (waitResult.status === "error") {
    throw new Error(`Judge agent run failed: ${waitResult.id ?? run.id}`);
  }

  const result = parseJudgeResponse(responseText);

  await mkdir(options.transcriptDir, { recursive: true });
  const transcriptPath = path.join(
    options.transcriptDir,
    `judge-${request.kind}-${request.index}.json`,
  );
  await writeFile(
    transcriptPath,
    JSON.stringify(
      {
        request: {
          kind: request.kind,
          index: request.index,
          expectation: request.expectation,
          rubric: request.rubric,
        },
        prompt,
        responseText,
        result,
      },
      null,
      2,
    ),
    "utf8",
  );

  return result;
}

export function createAgentJudge(
  repoRoot: string,
  transcriptDir: string,
): JudgeFn {
  return (request) =>
    runJudgeWithAgent(request, { repoRoot, transcriptDir });
}
