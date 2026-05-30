import type { SDKMessage } from "@cursor/sdk";

/** Stream agent messages to stdout for CI/local debugging. */
export function logAgentStreamEvent(event: SDKMessage): void {
  switch (event.type) {
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          process.stdout.write(block.text);
        } else if (block.type === "tool_use") {
          console.log(`\n[agent] tool_use: ${block.name}`);
        }
      }
      break;
    case "tool_call":
      console.log(
        `[agent] tool_call: ${event.name} (${event.status}) call_id=${event.call_id}`,
      );
      break;
    case "thinking":
      if (event.text) {
        const preview =
          event.text.length > 120 ? `${event.text.slice(0, 120)}…` : event.text;
        console.log(`[agent] thinking: ${preview}`);
      }
      break;
    case "status":
      console.log(
        `[agent] status: ${event.status}${event.message ? ` — ${event.message}` : ""}`,
      );
      break;
    case "system":
      console.log(
        `[agent] system: agent_id=${event.agent_id} run_id=${event.run_id}`,
      );
      break;
    case "task":
      if (event.text || event.status) {
        console.log(`[agent] task: ${event.status ?? ""} ${event.text ?? ""}`);
      }
      break;
    default:
      break;
  }
}
