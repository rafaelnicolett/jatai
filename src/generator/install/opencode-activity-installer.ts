/**
 * opencode-activity-installer.ts
 *
 * Instala o plugin local de atividade do OpenCode (epic-9) em
 * `.opencode/plugins/<marca>-activity.ts`. É gerado a cada instalação,
 * retomada e migração; como o relé dos hooks do Claude, fica fora do lock do
 * kit (não é conteúdo que o time edita).
 */

import * as path from "path";
import * as fs from "fs/promises";
import { BRAND } from "../../data/brand.pure";
import { openCodeActivityPlugin, openCodeActivityPluginFile } from "../content/opencode-activity-plugin";

/** Pasta dos plugins locais do OpenCode. */
export const OPENCODE_PLUGINS_DIR = ".opencode/plugins";

export async function installOpenCodeActivity(targetDir: string): Promise<void> {
  const file = path.join(targetDir, ...OPENCODE_PLUGINS_DIR.split("/"), openCodeActivityPluginFile());
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, openCodeActivityPlugin(), "utf-8");
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao gravar o plugin de atividade ${openCodeActivityPluginFile()}:`, err);
  }
}
