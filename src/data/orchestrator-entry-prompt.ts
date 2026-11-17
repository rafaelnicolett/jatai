import { agentsDirFor, type HostId } from "./foundation-prompt";
import { BRAND } from "./brand.pure";

/**
 * Nome do arquivo do orquestrador rico, por host. Desde a ADR-0025 é o mesmo
 * nos dois: o `maestro.agent.md` do kit é instalado como `<marca>.agent.md`
 * (`renameKitOrchestrator`, em src/generator/harness/), o agente que é a
 * entrada da metodologia no Claude Code e no Copilot.
 */
export function orchestratorAgentFilename(host: HostId): string {
  return host === "opencode" ? `${BRAND.name}.md` : BRAND.files.orchestratorAgent;
}

/**
 * Orquestradores do Claude Code que identificam o host no disco: o da marca
 * atual e os de marcas anteriores (`brand.json › legacy.orchestratorAgents`).
 * Um workspace Claude migrado de outra marca guarda o orquestrador antigo
 * (o `migrateKit` não migra o orquestrador, BUG-11), e sem o nome legado o
 * host viraria Copilot (ADR-0013).
 */
export function claudeOrchestratorFilenames(): readonly string[] {
  return [orchestratorAgentFilename("claude"), ...BRAND.legacy.orchestratorAgents];
}

/**
 * Corpo do entry point do orquestrador — compartilhado pelos dois hosts.
 *
 * Delega para `<AGENTS_DIR>/<orquestrador>.agent.md` em vez de duplicar o
 * protocolo de roteamento/gates/HITL já definido ali. Mesmo princípio
 * adotado em `foundation-prompt.ts`: duas cópias do mesmo protocolo
 * divergem com o tempo — foi exatamente esse tipo de bug que deixou o
 * host Claude com um entry point quase vazio antes desta correção.
 */
export function orchestratorEntryBody(host: HostId, projectName: string): string {
  const agentsDir = agentsDirFor(host);
  const file = orchestratorAgentFilename(host);

  return `Você é o orquestrador da ${BRAND.displayName} no projeto **${projectName}**.

Leia \`${agentsDir}/${file}\` agora e siga o protocolo dele **integralmente**
— você é aquele agente nesta sessão. Esse arquivo cobre: detecção do tipo de
projeto, tracker de fases, roteamento Upstream → Downstream → Operation,
protocolo de transição entre fases, os gates G1/G2 e quando parar para
confirmação humana (HITL).

**Nunca execute trabalho de fase você mesmo** — para cada fase, leia o
arquivo do agente-fase correspondente (tabela em \`${file}\`) e faça o
role-play daquele agente, conforme instruído lá.
`;
}
