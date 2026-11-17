/**
 * approvalActions.ts — aprovar de verdade DENTRO do Cockpit (Onda 1), sem
 * sair pro chat. Cobre os dois lugares que hoje só tinham um link "ir pro
 * gate": itens de `wave_status` (modernização) e o Gate D1 por repositório
 * (Discovery/brownfield).
 *
 * Fricção proporcional ao risco (Mecanismo H): se o item tem algum campo
 * listado em `helyx.approvalFriction.riskFields` preenchido, o handler
 * recusa a aprovação sem `acknowledged: true` — checagem no SERVIDOR, nunca
 * confia só no checkbox que a UI já mostra antes de habilitar o botão.
 *
 * Gate D1 não tem essa fricção extra — aprovar o gate JÁ É o checkpoint
 * humano por definição, uma segunda camada ali seria fricção sem sinal novo.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { upsertSprintItemStatus } from "../../cli/writers/sprint-backlog-writer";
import { atomicWrite } from "../../cli/lib/atomic-write";
import { readActiveInitiativeId } from "../../data/initiatives-contract.pure";
import type { CommandHandler } from "./CommandHandler";
import { cockpitStateCommands, recordHumanEvent } from "./stateCommands";
import { BRAND } from "../../data/brand.pure";

const DEFAULT_RISK_FIELDS = ["merge_block", "known_bugs_pinned"];

function riskFields(): string[] {
  return vscode.workspace.getConfiguration(BRAND.configSection).get<string[]>("approvalFriction.riskFields", DEFAULT_RISK_FIELDS);
}

function isFilled(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export const approveWaveItemHandler: CommandHandler = {
  type: "approveWaveItem",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const initiativeId = msg.initiativeId as string;
    const wave = msg.wave as string;
    const item = msg.item as string;
    const acknowledged = msg.acknowledged as boolean;

    if (!ctx.repository.initiativesFileExists(root)) return;
    const current = ctx.repository.getWaveItem(root, initiativeId, wave, item);
    if (!current) {
      void vscode.window.showWarningMessage(`${BRAND.displayName}: item \`${item}\` não encontrado em \`${wave}\` de \`${initiativeId}\`.`);
      return;
    }

    const filledRiskFields = riskFields().filter((field) => isFilled(current[field]));
    if (filledRiskFields.length > 0 && !acknowledged) {
      void vscode.window.showWarningMessage(
        `${BRAND.displayName}: \`${item}\` tem ${filledRiskFields.join("/")} preenchido — confirme que você viu antes de aprovar.`
      );
      return;
    }

    const approvedAt = new Date().toISOString();
    const { found } = await ctx.repository.approveWaveItemHumanly(root, initiativeId, wave, item, approvedAt);
    if (!found) return;
    await recordHumanEvent(root, ctx, {
      event_type: "item-approved",
      initiative_id: initiativeId,
      phase_id: wave,
      ...(typeof current.repo === "string" ? { repo_id: current.repo } : {}),
      message: `${item} aprovado`,
    });
    await ctx.requestRefresh();
  },
};

/**
 * Candidatos de path pra `sprint-backlog.yaml`, na mesma ordem de prioridade
 * de `loadSprintBacklog` (`src/data/sprint-backlog-contract.ts`): primeiro o
 * da iniciativa ativa (lida de `active:` em `initiatives.yaml`), depois o
 * global na raiz do workspace. Duplicado aqui (em vez de importado) porque
 * `loadSprintBacklog` já RETORNA o backlog parseado — o handler precisa do
 * PATH do arquivo de verdade pra reescrever, não do dado parseado.
 */
function sprintBacklogCandidates(root: string): string[] {
  const globalPath = path.join(root, ".github/artifacts/sprint-backlog.yaml");
  const initYaml = path.join(root, ".github/artifacts/initiatives.yaml");
  if (!fs.existsSync(initYaml)) return [globalPath];
  const activeId = readActiveInitiativeId(fs.readFileSync(initYaml, "utf-8"));
  if (!activeId) return [globalPath];
  return [path.join(root, `.github/artifacts/initiatives/${activeId}/sprint-backlog.yaml`), globalPath];
}

/**
 * Aprova UM `SprintItem` (`sprint-run` do greenfield) — grava `status: done`
 * em `sprint-backlog.yaml` preservando o resto do arquivo (ver
 * `upsertSprintItemStatus`). Sem fricção — `SprintItem` não carrega nenhum
 * campo de risco hoje (diferente de `WaveItemStatusEntry`).
 */
export const approveSprintItemHandler: CommandHandler = {
  type: "approveSprintItem",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const sprintItemId = msg.sprintItemId as string;

    for (const filePath of sprintBacklogCandidates(root)) {
      if (!fs.existsSync(filePath)) continue;
      // Sob o mesmo lock do CLI, gravação atômica (A10 / H-BUG-16).
      let found = false;
      await atomicWrite(filePath, (content) => {
        const result = upsertSprintItemStatus(content, sprintItemId, "done");
        found = result.found;
        return result.found ? result.content : content;
      });
      if (!found) continue;

      await recordHumanEvent(root, ctx, {
        event_type: "item-approved",
        phase_id: "sprint-run",
        message: `${sprintItemId} aprovado`,
      });
      await ctx.requestRefresh();
      return;
    }

    void vscode.window.showWarningMessage(`${BRAND.displayName}: item de sprint \`${sprintItemId}\` não encontrado em sprint-backlog.yaml.`);
  },
};

/**
 * Aprova o Gate D1 de um repositório pelo `StateCommands` (ADR-0024, F4.2): o
 * aprovador é o `user.name` do git (só o nome), a regra de fechamento recusa o
 * D1 com fase do Foundation aberta, a escrita roda sob o lock e o evento
 * `gate-approved` entra em `runs/` pelo escritor validado. Antes, o handler
 * gravava direto: sem o nome de quem aprovou, sem a regra e sem evento
 * padronizado. A recusa (sem nome no git, trabalho aberto) é avisada aqui; o
 * painel de decisão usa `gates/approve`, que devolve o motivo estruturado.
 */
export const approveGateD1Handler: CommandHandler = {
  type: "approveGateD1",
  async handle(msg, ctx) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const result = await cockpitStateCommands(root, ctx).approveGate({ gate: "d1", repoId: msg.repoId as string });
    if (!result.ok) {
      void vscode.window.showWarningMessage(`${BRAND.displayName}: ${result.error.message}`);
      return;
    }
    await ctx.requestRefresh();
  },
};
