/**
 * stateCommands.ts — o `StateCommands` das ações do Cockpit (F4.2, ADR-0024).
 *
 * O Cockpit aprova gate e registra decisão pelo MESMO caso de uso do CLI e do
 * State Service: o aprovador é o `user.name` do git (só o nome, nunca o
 * e-mail), a regra de fechamento recusa o gate com trabalho aberto, e a
 * escrita (estado e evento em `runs/`) roda sob o lock de sempre. Nenhuma tool
 * MCP aprova gate, e isto não muda.
 */
import { StateCommands } from "../../state/application/StateCommands";
import { gitUserName } from "../../state/identity/git-user-name";
import { appendRunEvent } from "../../state/runs/run-event-log";
import { BRAND } from "../../data/brand.pure";
import type { ActionContext } from "./CommandHandler";

export function cockpitStateCommands(root: string, ctx: ActionContext): StateCommands {
  return new StateCommands({ root, repository: ctx.repository, approverName: ctx.approverName ?? gitUserName, recordEvent: appendRunEvent });
}

/**
 * Grava o evento de uma aprovação humana que não é de gate (item de onda ou
 * de sprint) em `runs/`, pelo escritor do contrato `agent-activity`: validado
 * (lista fechada de campos, 140 caracteres) e sob o lock do arquivo. Antes, o
 * Cockpit anexava a `human-actions.jsonl` sem lock, sem validação e sem o nome
 * de quem aprovou. Falha em gravar o evento é logada e não desfaz a aprovação,
 * como no `StateCommands`.
 */
export async function recordHumanEvent(
  root: string,
  ctx: ActionContext,
  event: { event_type: "item-approved"; initiative_id?: string; phase_id?: string; repo_id?: string; message: string }
): Promise<void> {
  const by = (await (ctx.approverName ?? gitUserName)(root))?.trim();
  const result = await appendRunEvent(root, {
    run_id: "human",
    agent_id: "você",
    actor: "human",
    timestamp: new Date().toISOString(),
    ...event,
    ...(by ? { by } : {}),
  });
  if (!result.ok) console.error(`[${BRAND.name}] evento de aprovação não gravado em runs/: ${result.error.message}`);
}
