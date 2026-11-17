import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // `vscode` só existe dentro do host — sem este alias, qualquer src/ que o
      // importe fica intestável em Node. Ver tests/mocks/vscode.ts.
      vscode: path.resolve(__dirname, "tests/mocks/vscode.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // As edições do kit saem de kit/ em dist/kit/ (fora do git, ADR-0018).
    globalSetup: ["tests/setup/materialize-kit.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/extension.ts"], // entry point — VS Code API, não testável sem host
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
