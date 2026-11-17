/**
 * orchestrator.ts
 *
 * O nome do orquestrador instalado (ADR-0025). No kit ele é
 * `maestro.agent.md`, um nome neutro de marca; nos dois harnesses ele é
 * instalado como `<marca>.agent.md` (`brand.json › files.orchestratorAgent`),
 * o agente que é a entrada da metodologia: `@jatai` no Claude Code e o custom
 * agent `jatai` no seletor de agentes do Copilot.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { BRAND } from "../../data/brand.pure";

/** O orquestrador no kit (`kit/variants/<edição>/agents/maestro.agent.md`). */
export const KIT_ORCHESTRATOR = "maestro.agent.md";

/**
 * Renomeia o orquestrador recém-copiado do kit para o nome da marca. Sem o
 * arquivo (instalação parcial), não faz nada.
 */
export async function renameKitOrchestrator(agentsDir: string): Promise<void> {
  if (BRAND.files.orchestratorAgent === KIT_ORCHESTRATOR) return;
  try {
    await fs.rename(path.join(agentsDir, KIT_ORCHESTRATOR), path.join(agentsDir, BRAND.files.orchestratorAgent));
  } catch {
    // o kit desta instalação não trouxe o orquestrador
  }
}
