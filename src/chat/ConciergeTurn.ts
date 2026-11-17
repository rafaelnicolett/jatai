/**
 * ConciergeTurn.ts — um turno do chat (F3.7, cluster K3 do
 * `ConciergeParticipant.ts`): ler o estado, decidir o gate HITL, renderizar o
 * card com o próximo passo e, se houver modelo, a conversa do guia.
 *
 * Desde a ADR-0025 o chat é guia: não aciona agentes nem grava arquivos. Por
 * isso não há releitura do estado depois do modelo: nada no turno escreve.
 *
 * Recebe as portas (raiz do workspace e modelo de linguagem) e escreve numa
 * saída de chat; não conhece o `ChatResponseStream` nem `vscode.lm`.
 */

import type { ChatResult } from "vscode";
import { WorkspaceStateReader } from "./WorkspaceStateReader";
import { PhaseAgentLoader } from "./PhaseAgentLoader";
import { canonicalDeliveryPhaseId } from "../core/methodology/phase-catalog.pure";
import { BRAND } from "../data/brand.pure";
import { findPendingHitlPhase } from "./hitl/HitlPolicy";
import { renderContinueCard, renderHitlGateCard, renderNewInitiativeCard, renderRoutingCard } from "./render/cards";
import { buildResult } from "./render/followups";
import { buildSystemPrompt } from "./prompt/SystemPromptBuilder";
import type { ChatSink } from "./render/ChatSink";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import type { CancellationSignal, LanguageModel } from "../adapters/lm/LanguageModel";

/** O que o turno escreve: os cards (`ChatSink`) e a linha de progresso. */
export interface ConciergeOutput extends ChatSink {
  progress(text: string): void;
}

/** O pedido do usuário, na forma que o `ChatRequest` do VS Code já tem. */
export interface ConciergeRequest {
  readonly prompt: string;
  readonly command?: string;
}

export interface ConciergeTurnDeps {
  workspaceRoot: WorkspaceRoot;
  languageModel: LanguageModel;
}

export type ConciergeTurn = (request: ConciergeRequest, out: ConciergeOutput, cancel: CancellationSignal) => Promise<ChatResult>;

export function createConciergeTurn({ workspaceRoot, languageModel }: ConciergeTurnDeps): ConciergeTurn {
  return async (request, out, token) => {
    const root = workspaceRoot.current();

    // ── 1. Read workspace state (sync, fast) ─────────────────────────────────
    out.progress("Lendo estado do workspace…");
    const reader = root ? new WorkspaceStateReader(root) : null;
    const state = reader?.read() ?? null;
    const ctxStr = state ? reader!.toContextString(state) : `Workspace sem configuração ${BRAND.displayName}.`;

    // ── /nova: quem abre a iniciativa é o agente orquestrador (H-BUG-23) ──────
    if (request.command === "nova") {
      renderNewInitiativeCard(out);
      return buildResult(state);
    }

    // ── 2a. HITL gate check — se há fase done sem human-ok, bloqueia e exige aprovação ──
    const pendingHitl = findPendingHitlPhase(state);
    if (pendingHitl) {
      renderHitlGateCard(out, pendingHitl.phaseId, pendingHitl.checklist);
      return buildResult(state);
    }

    // ── 2b. Card com o próximo passo (determinístico, sem modelo) ────────────
    // A persona do agente da fase (do kit) diz o que ele entrega e o que se aprova.
    const active = root ? state?.activeInitiative ?? null : null;
    const persona = root && active ? new PhaseAgentLoader(root).load(canonicalDeliveryPhaseId(active.current_phase)) : null;
    // Slash commands (H-BUG-23): respondem só com o determinístico, sem modelo.
    switch (request.command) {
      case "status":
        renderRoutingCard(out, state, root ?? null, persona);
        return buildResult(state);
      case "continuar":
        renderContinueCard(out, state, root ?? null, persona);
        return buildResult(state);
      case "nova": // tratado antes do gate HITL
      default:
        break;
    }
    renderRoutingCard(out, state, root ?? null, persona);

    // ── 3. Conversa do guia, se houver modelo ─────────────────────────────────
    out.progress("Consultando o guia…");

    const model = await languageModel.select();
    if (!model) {
      // Sem modelo o guia segue com o determinístico (H-BUG-24): card, próximo passo e o botão para o agente.
      out.markdown(`\n> ℹ️ O editor está sem modelo de linguagem, então o guia mostra o estado e o próximo passo, sem conversa. O trabalho segue com o agente **${BRAND.participant.name}**.`);
      return buildResult(state);
    }

    const prompt = buildSystemPrompt({ workspaceCtx: ctxStr, userMessage: request.prompt });

    try {
      const chunks = await model.send(prompt, token);
      out.markdown("\n\n");
      for await (const chunk of chunks) {
        if (token.isCancellationRequested) break;
        out.markdown(chunk);
      }
    } catch (err) {
      out.markdown(`\n> ⚠️ Erro ao consultar o modelo: ${String(err)}`);
    }

    return buildResult(state);
  };
}
