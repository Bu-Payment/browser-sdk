import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/**/types.ts",
        "src/presentation/modal-accessibility.ts",
        "src/presentation/trusted-modal-script.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 50,
        statements: 80,
      },
    },
  },
});
