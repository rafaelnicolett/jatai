/**
 * hooks-installer.ts
 *
 * Instala os hooks de atividade de agente (contrato agent-activity §4) no
 * harness que tem hooks de projeto (o Claude Code): o relé em
 * `.github/scripts/` e os hooks no `.claude/settings.json`, com merge que
 * preserva o que o time configurou. Uma configuração que não é JSON puro
 * fica como está, com um aviso. A escrita passa pelo lock do estado.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { BRAND } from "../../data/brand.pure";
import { atomicWrite } from "../../state/lock/atomic-write";
import type { HarnessAdapter } from "../harness/HarnessAdapter";
import { KIT_SCRIPTS_DIR } from "../content/mcp-config";
import { claudeHookRelay, hookRelayFile, mergeClaudeSettings } from "../content/claude-hooks";
import { installOpenCodeActivity } from "./opencode-activity-installer";

/** Relé e hooks (Claude) ou plugin (OpenCode). */
export async function installAgentActivityHooks(targetDir: string, harness: HarnessAdapter): Promise<void> {
  if (harness.activity === "plugin") {
    await installOpenCodeActivity(targetDir);
    return;
  }
  if (harness.activity === "none" || harness.projectHooksFile === null) return;
  const relay = path.join(targetDir, KIT_SCRIPTS_DIR, hookRelayFile());
  try {
    await fs.mkdir(path.dirname(relay), { recursive: true });
    await fs.writeFile(relay, claudeHookRelay(), "utf-8");
    await fs.chmod(relay, 0o755);
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao gravar o relé dos hooks ${hookRelayFile()}:`, err);
  }
  await configureAgentActivityHooks(targetDir, harness);
}

/** Só os hooks/plugin na configuração do harness (a retomada da instalação usa só isto). */
export async function configureAgentActivityHooks(targetDir: string, harness: HarnessAdapter): Promise<void> {
  if (harness.activity === "plugin") {
    await installOpenCodeActivity(targetDir);
    return;
  }
  if (harness.activity === "none") return;
  const settings = harness.projectHooksFile;
  if (settings === null) return;
  try {
    await atomicWrite(path.join(targetDir, settings), (current) => {
      const result = mergeClaudeSettings(current);
      if (result.kind === "write") return result.text;
      if (result.kind === "unreadable") {
        console.warn(`[${BRAND.name}] ${settings} ${result.reason}: o arquivo não foi alterado e os hooks de atividade de agente não foram instalados`);
      }
      return current;
    });
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao configurar os hooks de atividade em ${settings}:`, err);
  }
}
