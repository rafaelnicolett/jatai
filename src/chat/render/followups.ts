/**
 * followups.ts — o `ChatResult` do turno e os chips de continuação do
 * Concierge (F3.7, cluster K7). Sem I/O.
 */

import type { ChatFollowup, ChatResult } from "vscode";
import type { WorkspaceState } from "../WorkspaceStateReader";
import { canonicalDeliveryPhaseId, chatPhaseMeta } from "../../core/methodology/phase-catalog.pure";
import { BRAND } from "../../data/brand.pure";

// ── Result + followups ────────────────────────────────────────────────────────

export function buildResult(state: WorkspaceState | null): ChatResult {
  const init = state?.activeInitiative;
  const phase = init ? chatPhaseMeta(canonicalDeliveryPhaseId(init.current_phase)) : null;

  const followups: ChatFollowup[] = [];

  if (!init) {
    if (state?.mode === "brownfield") {
      if (state.brownfieldAssessmentReady) {
        followups.push(
          { prompt: `@${BRAND.guide.name} quero abrir uma nova feature`,      label: "📦 Nova Feature" },
          { prompt: `@${BRAND.guide.name} quero refatorar / modernizar`,       label: "🔧 Modernização" },
          { prompt: `@${BRAND.guide.name} tenho um incidente em produção`,     label: "🚨 Hotfix" }
        );
      } else {
        followups.push(
          { prompt: `@${BRAND.guide.name} rodar @assessor agora`,              label: "▶ Iniciar Foundation" },
          { prompt: `@${BRAND.guide.name} como funciona o stream Foundation?`, label: "❓ O que é Foundation" }
        );
      }
    } else {
      followups.push(
        // Note: followups are sent immediately — keep them as routing messages, not templates.
        // Templates are handled via stream.button → <marca>.concierge.startWithTemplate.
        { prompt: `@${BRAND.guide.name} qual o estado do projeto?`, label: "📊 Status geral" },
        { prompt: `@${BRAND.guide.name} como funciona a ${BRAND.displayName}?`, label: "❓ Como funciona" }
      );
    }
  } else {
    // HITL: nunca oferecemos chip de "avançar para próxima fase". Transição só via
    // checklist do cockpit. Aqui só damos opções de continuar o trabalho da fase atual.
    if (phase) {
      followups.push({
        prompt: `qual o próximo passo na fase ${phase.label}?`,
        label: `➡️ Próximo passo`,
      });
      followups.push({
        prompt: `quais itens do checklist da fase ${phase.label} ainda faltam?`,
        label: `☑ Ver checklist`,
      });
    }
    followups.push({ prompt: "status de todas as iniciativas", label: "📊 Status geral" });
  }

  return { metadata: { followups } };
}
