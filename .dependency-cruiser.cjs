/**
 * Fitness functions da arquitetura-alvo (ADR-0016): núcleo funcional e
 * casca imperativa, no estágio de monólito modular (fronteiras como pastas
 * de src/). Roda no CI e no ci:local (`npm run arch`).
 *
 * Severidade:
 * - error: só `core-is-pure` (F3.2). Um import de builtin do Node ou do
 *   `vscode` dentro de src/core reprova o build.
 * - warn: as regras cujas pastas ainda estão em transição. Cada uma vira
 *   error na feature que a zera (ver `comment`).
 *
 * Registradas e ainda fora da config, porque a pasta de origem não existe
 * no estágio atual: `no-vscode-outside-extension` (src/vscode, F3.6),
 * `state-no-upward` (src/state completo, F3.3/F3.6), `mcp-only-client`
 * (ADR-0004, quando o cliente único sair de src/server), `webview-only-core`
 * e `no-deep-imports` (pacotes físicos, F3.11), `no-orphans`.
 */
module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      severity: "error",
      comment:
        "src/core é puro (ADR-0016, D12): sem fs, path, os, crypto, http nem outro builtin do Node. I/O fica na casca (src/data/*-contract.ts, src/state, src/server).",
      from: { path: "^src/core/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "core-is-pure",
      severity: "error",
      comment: "src/core não importa a API do VS Code (ADR-0016, D12): o vscode só aparece na casca.",
      from: { path: "^src/core/" },
      to: { path: "^vscode$" },
    },
    {
      name: "core-is-root",
      severity: "warn",
      comment:
        "src/core só depende de si mesmo e de bibliotecas (ADR-0016). O brand.json é dado, não código. Vira error quando os barrels de src/data saírem.",
      from: { path: "^src/core/" },
      to: { path: "^src/", pathNot: ["^src/core/", "^src/data/brand\\.json$"] },
    },
    {
      name: "cli-no-generator",
      severity: "warn",
      comment: "O CLI de estado não alcança o gerador nem a casca do VS Code (ADR-0016).",
      from: { path: "^src/cli/" },
      to: { path: "^src/(generator|views|wizard|chat|codelens|extension\\.ts)" },
    },
    {
      name: "ds-is-leaf",
      severity: "warn",
      comment: "O design system do webview é folha: não importa features, store nem app (ADR-0016, P9). Vira error na F3.9 (frente D).",
      from: { path: "^webview-ui/src/design-system/" },
      to: { path: "^webview-ui/src/(features|store|app|apps|bridge|shell)/" },
    },
    {
      name: "no-cross-feature",
      severity: "warn",
      comment: "Uma feature do webview não importa outra (ADR-0016). Vira error na F3.9 (frente D).",
      from: { path: "^webview-ui/src/features/([^/]+)/" },
      to: { path: "^webview-ui/src/features/", pathNot: "^webview-ui/src/features/$1/" },
    },
    {
      name: "no-circular",
      severity: "warn",
      comment: "Sem ciclos de import (ADR-0016).",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".json"],
    },
  },
};
