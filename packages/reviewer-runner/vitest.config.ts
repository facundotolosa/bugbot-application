import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "../../.cursor/skills/ai-code-review/scripts/**/*.test.ts",
    ],
  },
});
