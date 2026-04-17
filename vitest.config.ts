import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@opseye/config": resolve(__dirname, "packages/config/src/index.ts"),
      "@opseye/types": resolve(__dirname, "packages/types/src/index.ts"),
      "@opseye/kafka": resolve(__dirname, "packages/kafka/src/index.ts"),
      "@opseye/llm": resolve(__dirname, "packages/llm/src/index.ts"),
      "@opseye/vector-store": resolve(
        __dirname,
        "packages/vector-store/src/index.ts",
      ),
      "@opseye/retrieval": resolve(
        __dirname,
        "packages/retrieval/src/index.ts",
      ),
      "@opseye/observability": resolve(
        __dirname,
        "packages/observability/src/index.ts",
      ),
      "@opseye/utils": resolve(__dirname, "packages/utils/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    include: [
      "apps/**/src/**/__tests__/**/*.test.ts",
      "packages/**/src/**/__tests__/**/*.test.ts",
    ],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
