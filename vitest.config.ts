import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only this project's own unit tests. The vendored skill under
    // agent/skills/eve ships the entire eve monorepo (thousands of tests
    // that cannot run here), so it must be excluded.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "agent/lib/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "agent/skills/**",
      ".output/**",
      ".next/**",
      ".eve/**",
      ".workflow-data/**",
    ],
  },
});
