/**
 * mcp-installer.ts
 *
 * Instala o servidor MCP do estado no workspace (ADR-0025): o bundle do kit
 * em `.github/scripts/` e as duas configurações MCP (`.mcp.json` e
 * `.vscode/mcp.json`), com merge por nome. Usado pela instalação brownfield
 * (inclusive a retomada), pelo kit greenfield e pelo `migrateKit`.
 *
 * O que o time já declarou nas configurações nunca é apagado: só a entrada
 * da marca é posta ou atualizada. Uma configuração que não é JSON puro fica
 * como está, com um aviso. As duas escritas passam pelo lock do estado
 * (`atomicWrite`), como o config.
 */

import * as path from "path";
import { BRAND } from "../../data/brand.pure";
import { atomicWrite } from "../../state/lock/atomic-write";
import { copyFileIfExists } from "../fs/copy";
import { KIT_SCRIPTS_DIR, MCP_CONFIG_FILES, mergeMcpConfig } from "../content/mcp-config";
import { MCP_BUNDLE, mcpBundlePath } from "./kit-root";

/** Bundle do kit em `.github/scripts/` e as duas configurações. */
export async function installMcpServer(targetDir: string): Promise<void> {
  await copyFileIfExists(mcpBundlePath(), path.join(targetDir, KIT_SCRIPTS_DIR, MCP_BUNDLE));
  await configureMcpServer(targetDir);
}

/**
 * Só as configurações: põe ou atualiza o servidor da marca nas duas, por
 * nome. A retomada da instalação usa só isto (o bundle, se faltar, já veio
 * com o resto do que falta).
 */
export async function configureMcpServer(targetDir: string): Promise<void> {
  for (const file of MCP_CONFIG_FILES) {
    const filePath = path.join(targetDir, file.path);
    try {
      await atomicWrite(filePath, (current) => {
        const result = mergeMcpConfig(current, file, MCP_BUNDLE);
        if (result.kind === "write") return result.text;
        if (result.kind === "unreadable") {
          console.warn(`[${BRAND.name}] ${file.path} ${result.reason}: o arquivo não foi alterado; declare o servidor "${BRAND.name}" à mão (node ${KIT_SCRIPTS_DIR}/${MCP_BUNDLE})`);
        }
        return current;
      });
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao configurar o servidor MCP em ${file.path}:`, err);
    }
  }
}
