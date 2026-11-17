/**
 * claudeCommand.ts — garante o slash command `/<marca>` do Claude Code no
 * workspace aberto (F3.6, Extract Module de `extension.ts`). Quem decide se
 * roda é a ativação (`shouldEnsureClaudeCommand`, C7).
 */

import * as fs from "fs/promises";
import * as path from "path";
import { helyxCommandContent } from "../../data/foundation-prompt";
import { BRAND } from "../../data/brand.pure";
import type { HostPorts } from "../ports";

export async function ensureClaudeSlashCommand(ports: Pick<HostPorts, "workspaceRoot">): Promise<void> {
  const root = ports.workspaceRoot.current();
  if (!root) { return; }
  const commandFile = path.join(root, ".claude", "commands", BRAND.files.slashCommand);
  try {
    await fs.access(commandFile);
    // Already exists — nothing to do
  } catch {
    try {
      await fs.mkdir(path.dirname(commandFile), { recursive: true });
      // Este arquivo só existe no layout do Claude (.claude/commands/), então o
      // prompt é gerado com os paths desse host.
      await fs.writeFile(commandFile, helyxCommandContent("claude"), "utf-8");
    } catch {
      // Non-fatal
    }
  }
}
