/**
 * mcp-installer.ts
 *
 * Instala o servidor MCP do estado no workspace (ADR-0025 e epic-9): o bundle
 * do kit em `.github/scripts/` e as configurações MCP do harness, com merge
 * por nome. Usado pela instalação brownfield (inclusive a retomada), pelo kit
 * greenfield e pelo `migrateKit`.
 *
 * O que o time já declarou nas configurações nunca é apagado: só a entrada
 * da marca é posta ou atualizada. Uma configuração que não é JSON puro (ou
 * JSONC, no OpenCode) fica como está, com um aviso. As escritas passam pelo
 * lock do estado (`atomicWrite`), como o config.
 */

import * as path from "path";
import { existsSync } from "fs";
import { BRAND } from "../../data/brand.pure";
import { atomicWrite } from "../../state/lock/atomic-write";
import { copyFileIfExists } from "../fs/copy";
import { KIT_SCRIPTS_DIR, mergeMcpConfig, type McpConfigFile } from "../content/mcp-config";
import type { HarnessAdapter } from "../harness/HarnessAdapter";
import { MCP_BUNDLE, mcpBundlePath } from "./kit-root";

/** Bundle do kit em `.github/scripts/` e as configurações do harness. */
export async function installMcpServer(targetDir: string, harness: HarnessAdapter): Promise<void> {
  await copyFileIfExists(mcpBundlePath(), path.join(targetDir, KIT_SCRIPTS_DIR, MCP_BUNDLE));
  await configureMcpServer(targetDir, harness);
}

/**
 * Só as configurações: põe ou atualiza o servidor da marca nas do harness,
 * por nome. A retomada da instalação usa só isto (o bundle, se faltar, já veio
 * com o resto do que falta).
 */
export async function configureMcpServer(targetDir: string, harness: HarnessAdapter): Promise<void> {
  for (const file of harness.mcpConfigs) {
    const rel = configPathFor(file, targetDir);
    const filePath = path.join(targetDir, rel);
    try {
      await atomicWrite(filePath, (current) => {
        const result = mergeMcpConfig(current, file, MCP_BUNDLE);
        if (result.kind === "write") return result.text;
        if (result.kind === "unreadable") {
          console.warn(`[${BRAND.name}] ${rel} ${result.reason}: o arquivo não foi alterado; declare o servidor "${BRAND.name}" à mão (node ${KIT_SCRIPTS_DIR}/${MCP_BUNDLE})`);
        }
        return current;
      });
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao configurar o servidor MCP em ${rel}:`, err);
    }
  }
}

/**
 * Onde editar a configuração do OpenCode. O OpenCode mergeia `.opencode/` por
 * cima da raiz, então se o time já tem um config lá é ele que vale. Sem
 * nenhum existente, nasce `opencode.json` na raiz.
 */
export function opencodeConfigPath(root: string): string {
  for (const candidate of [".opencode/opencode.jsonc", ".opencode/opencode.json", "opencode.jsonc", "opencode.json"]) {
    if (existsSync(path.join(root, candidate))) return candidate;
  }
  return "opencode.json";
}

/** A config `jsonc` do OpenCode escolhe o arquivo existente; as outras têm path fixo. */
function configPathFor(file: McpConfigFile, root: string): string {
  return file.format === "jsonc" ? opencodeConfigPath(root) : file.path;
}
