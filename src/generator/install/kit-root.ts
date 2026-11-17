/**
 * kit-root.ts
 *
 * Onde estão as edições do kit (`templates/`, `brownfield-templates/`) e os
 * bundles do CLI de estado e do servidor MCP (F3.4, passo 5).
 *
 * Desde a onda 5 as edições não são versionadas (ADR-0018): o build as
 * materializa de `kit/` em `dist/kit/<edição>` (`scripts/copy-templates.js`),
 * e o `.vsix` leva essa pasta. Os testes materializam antes de rodar
 * (globalSetup do Vitest).
 */

import * as path from "path";
import { existsSync } from "fs";
import { BRAND } from "../../data/brand.pure";

export type KitEdition = "templates" | "brownfield-templates";

/**
 * Resolve a pasta da edição materializada.
 *
 * O `__dirname` muda conforme o contexto: em runtime o bundle vive em `dist/`
 * (→ `dist/kit/<name>`), mas no código-fonte é `src/generator/install/`
 * (→ `src/generator/install/../../../dist/kit/<name>`). Resolver por
 * tentativa mantém o gerador exercitável fora do host, em vez de depender do
 * layout do bundle.
 */
export function kitRoot(name: KitEdition): string {
  const candidates = [
    path.join(__dirname, "kit", name),                         // runtime: dist/kit/<name>
    path.join(__dirname, "..", "..", "..", "dist", "kit", name), // fonte: src/generator/install/../../../dist/kit/<name>
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

/**
 * CLI determinístico que os agentes chamam via Bash: sempre da edição
 * greenfield (`templates/scripts/`, que vem de `kit/scripts/`), buildado uma
 * vez só (`npm run build:cli`) e reusado nos dois fluxos.
 */
export function cliBundlePath(): string {
  return path.join(kitRoot("templates"), "scripts", BRAND.files.cli);
}

/**
 * Nome do bundle do servidor MCP do estado no kit e no workspace
 * (`.github/scripts/<marca>-mcp.cjs`, ADR-0025). O `npm run build:mcp` o gera
 * de `src/mcp/server.ts`, ao lado do bundle do CLI.
 */
export const MCP_BUNDLE = `${BRAND.name}-mcp.cjs`;

/** Bundle do servidor MCP no kit: como o do CLI, sempre de `templates/scripts/` (fonte: `kit/scripts/`). */
export function mcpBundlePath(): string {
  return path.join(kitRoot("templates"), "scripts", MCP_BUNDLE);
}
