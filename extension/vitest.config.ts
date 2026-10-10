import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["tests/e2e/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
