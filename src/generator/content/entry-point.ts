/**
 * entry-point.ts
 *
 * O ponto de entrada da metodologia nas instruções geradas no greenfield
 * (ADR-0025): o agente orquestrador da marca, nos dois harnesses. O kit
 * brownfield diz o mesmo em `kit/content/{claude,copilot}-instructions.md` e
 * `kit/content/AGENTS.md`, com placeholders `{{brand.*}}`.
 *
 * Funções puras, sem fs.
 */

import type { HostId } from "../../data/foundation-prompt";
import { agentsDirFor } from "../../data/foundation-prompt";
import { BRAND } from "../../data/brand.pure";

/** Como chamar o orquestrador em cada harness, dado o arquivo instalado (dado, não condicional). */
const HOW_TO_CALL: Record<HostId, (file: string) => string> = {
  claude: (file) => `No Claude Code, chame \`@${BRAND.name}\` (o agente em \`${file}\`).`,
  copilot: (file) => `No Copilot, escolha o agente \`${BRAND.name}\` no seletor de agentes do chat (o custom agent em \`${file}\`).`,
};

function howToCall(host: HostId): string {
  return HOW_TO_CALL[host](`${agentsDirFor(host)}/${BRAND.files.orchestratorAgent}`);
}

/** Parágrafo "Ponto de entrada único" das instruções de um harness (CLAUDE.md, copilot-instructions.md). */
export function entryPointParagraph(host: HostId): string {
  return `**Sempre comece pelo agente orquestrador \`${BRAND.name}\`.** ${howToCall(host)}
Nunca invoque agentes especialistas diretamente — o \`${BRAND.name}\` valida pré-requisitos e roteia para a fase correta.`;
}

/** Seção do AGENTS.md, que é lido nos dois harnesses: diz como entrar em cada um. */
export function entryPointBothHarnesses(): string {
  return `Comece sempre pelo agente orquestrador \`${BRAND.name}\`, nos dois harnesses:

- **Claude Code:** chame \`@${BRAND.name}\` (\`${agentsDirFor("claude")}/${BRAND.files.orchestratorAgent}\`);
- **GitHub Copilot:** escolha o agente \`${BRAND.name}\` no seletor de agentes do chat (\`${agentsDirFor("copilot")}/${BRAND.files.orchestratorAgent}\`).`;
}
