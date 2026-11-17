/**
 * gateActions.ts — as decisões humanas do painel de decisão do Cockpit
 * (F4.2, ADR-0024): aprovar um gate (`gates/approve`) e registrar a decisão
 * que um agente pediu (`decisions/record`). As duas rodam pelo `StateCommands`,
 * o mesmo caso de uso do CLI e do State Service:
 *
 * - quem decide é o `by` do pedido ou o `user.name` do git (só o nome, nunca o
 *   e-mail). Sem nenhum dos dois, o resultado é `MISSING_FLAG` com
 *   `field: "by"`, e o painel pergunta o nome e reenvia;
 * - o gate só aprova com o trabalho anterior fechado: D1 com as fases do
 *   Foundation do repositório, D2 com o roadmap e a matriz de risco, D3 com os
 *   itens de execução. A recusa (`GATE_NOT_CLOSED`) leva `open`, a lista do que
 *   falta, para o checklist do painel;
 * - a escrita e o evento em `runs/` saem sob o lock de sempre.
 *
 * Nenhuma tool MCP aprova gate, e isto não muda: só um humano, aqui ou no CLI.
 */
import * as vscode from "vscode";
import type { DecisionRecordResult, GateApprovalOpenItem, GateApprovalResult } from "../../shared/cockpit-protocol";
import type { StateCommandResult } from "../../state/application/StateCommands";
import type { CommandHandler } from "./CommandHandler";
import { cockpitStateCommands } from "./stateCommands";

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);

function gateResult(gate: "d1" | "d2" | "d3", result: StateCommandResult): GateApprovalResult {
  if (result.ok) {
    const cancelled = result.body.cancelled;
    return {
      type: "gates/approve-result",
      ok: true,
      gate,
      human_approved_at: String(result.body.human_approved_at),
      by: String(result.body.by),
      ...(Array.isArray(cancelled) ? { cancelled: cancelled as Array<{ item: string; reason?: string }> } : {}),
    };
  }
  const { code, message, field, open } = result.error;
  return {
    type: "gates/approve-result",
    ok: false,
    error: { code, message, ...(typeof field === "string" ? { field } : {}), ...(Array.isArray(open) ? { open: open as GateApprovalOpenItem[] } : {}) },
  };
}

export const gatesApproveHandler: CommandHandler = {
  type: "gates/approve",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const gate = msg.gate as "d1" | "d2" | "d3";
    const result = await cockpitStateCommands(root, ctx).approveGate({
      gate,
      repoId: text(msg.repoId),
      initiativeId: text(msg.initiativeId),
      by: text(msg.by),
      note: text(msg.note),
    });
    ctx.reply?.(gateResult(gate, result));
    if (result.ok) await ctx.requestRefresh();
  },
};

export const decisionsRecordHandler: CommandHandler = {
  type: "decisions/record",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const taskId = text(msg.taskId);
    const reply = (result: DecisionRecordResult): void => ctx.reply?.(result);
    if (!taskId) {
      // A chave que apaga a guarda é a tarefa: sem ela a decisão gravada não fecharia o pedido.
      reply({ type: "decisions/record-result", ok: false, error: { code: "MISSING_FLAG", message: "flag obrigatória ausente: --task", field: "taskId" } });
      return;
    }
    const result = await cockpitStateCommands(root, ctx).recordDecision({
      taskId,
      initiativeId: text(msg.initiativeId),
      phaseId: text(msg.phaseId),
      message: text(msg.message),
      by: text(msg.by),
    });
    if (!result.ok) {
      const { code, message, field } = result.error;
      reply({ type: "decisions/record-result", ok: false, error: { code, message, ...(typeof field === "string" ? { field } : {}) } });
      return;
    }
    const event = result.body.event as { by?: string } | undefined;
    reply({ type: "decisions/record-result", ok: true, taskId, by: event?.by ?? "" });
    await ctx.requestRefresh();
  },
};
