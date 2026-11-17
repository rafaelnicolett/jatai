import { Compass } from "lucide-react";
import { parseWaveLabel, type Initiative, type InitiativeKind } from "@data";
import { KIND_ICON } from "../../../../design-system/initiativeKindIcons";
import type { StatChipItem, StatChipTone } from "../../../../design-system/patterns";
import { resolveGroupVocabulary } from "../../../../features/delivery/computeModernizationBoard";

/**
 * Resumo de iniciativa do `ContextBar` — rótulo do tipo, progresso de ondas,
 * metadado do combo e a composição do workspace. Lógica pura, extraída do
 * `ContextBar.tsx` na F3.9 (convenção `compute*` do webview: o `.tsx` só
 * exporta componente, e o lint `react-refresh/only-export-components` fica
 * limpo).
 */

/** `feature` é o default implícito (campo ausente) — mesma regra de `InitiativeKind` em `initiatives-contract.pure.ts`. */
export function initiativeKindLabel(type: InitiativeKind | undefined): string {
  if (type === "hotfix") return "Hotfix";
  if (type === "modernization") return "Modernização";
  return "Feature";
}

/**
 * Ondas (ou epics) concluídas/totais de UMA iniciativa hotfix/modernization —
 * mesmo vocabulário da vista por ondas (`resolveGroupVocabulary`: `epics` +
 * `epic_status` quando existem, senão `waves` + `wave_status`) e a mesma
 * chave de `modernizationWaveKey` (`<prefixo>-<índice do texto>`, senão a
 * posição no array). Antes da F3.9 a chave era sempre `wave-N`, e iniciativa
 * com epics aparecia sem progresso. Reaproveitado por `initiativeMeta` (uma
 * iniciativa) e `workspaceComposition` (soma de várias).
 */
export function waveProgress(i: Initiative): { done: number; total: number } {
  const { labels, statusMap, prefix } = resolveGroupVocabulary(i);
  const done = labels.filter((raw, idx) => statusMap?.[`${prefix}-${parseWaveLabel(raw).index ?? idx}`]?.status === "done").length;
  return { done, total: labels.length };
}

export function initiativeMeta(i: Initiative): string {
  const kind = initiativeKindLabel(i.type);
  if (i.type === "modernization" || i.type === "hotfix") {
    const { done, total } = waveProgress(i);
    // ADR-0006: o vocabulário é o da hierarquia da própria iniciativa ("epic 1/5" com épicos, "onda 1/3" com ondas).
    const word = resolveGroupVocabulary(i).groupLabel.toLowerCase();
    return total > 0 ? `${kind} · ${word} ${done}/${total}` : kind;
  }
  return `${kind} · ${i.mode === "greenfield" ? "Greenfield" : "Brownfield"}`;
}

/**
 * Composição do workspace inteiro pra tira de estatísticas ao lado do combo
 * do `ContextBar` — pedido do usuário, 2ª volta: a 1ª versão contava
 * iniciativas por STATUS (features/em execução/novas), o que soa sem
 * sentido quando o workspace não tem nenhuma feature (aparecia "0
 * features" à toa) e não refletia a estrutura real de cada tipo. Esta
 * versão usa a unidade CERTA de cada tipo — repositórios pra Descoberta,
 * ondas concluídas/totais pra Hotfix/Modernização (mesmo dado que
 * `initiativeMeta` já usa por iniciativa, aqui somado) — e só mostra um
 * chip pro tipo que EXISTE no workspace, nunca um "0 X" vazio.
 *
 * Sprint/upstream de Feature ficam de fora de propósito: essa granularidade
 * só existe no `sprintBacklog` da iniciativa ATIVA (não em `Initiative`, que
 * é o único dado disponível aqui pra TODAS as iniciativas) — mostrar isso
 * pra qualquer feature específica é o trabalho do `SecondaryCombo` +
 * `StatChips` de `DeliveryProgress.tsx`, não deste resumo workspace-wide.
 */
export function workspaceComposition(initiatives: Initiative[], repoCount: number): StatChipItem[] {
  const chips: StatChipItem[] = [];

  if (repoCount > 0) {
    chips.push({ icon: Compass, value: repoCount, label: repoCount === 1 ? "repositório" : "repositórios" });
  }

  const byType = new Map<InitiativeKind, Initiative[]>();
  for (const i of initiatives) {
    const type = i.type ?? "feature";
    byType.set(type, [...(byType.get(type) ?? []), i]);
  }

  const features = byType.get("feature") ?? [];
  if (features.length > 0) {
    chips.push({ icon: KIND_ICON.feature, value: features.length, label: features.length === 1 ? "feature" : "features", tone: "accent" });
  }

  const waveChip = (type: "hotfix" | "modernization", tone: StatChipTone, singular: string, plural: string, wavesLabel: string): StatChipItem | null => {
    const list = byType.get(type) ?? [];
    if (list.length === 0) return null;
    const totals = list.reduce((acc, i) => {
      const { done, total } = waveProgress(i);
      return { done: acc.done + done, total: acc.total + total };
    }, { done: 0, total: 0 });
    if (totals.total > 0) return { icon: KIND_ICON[type], value: `${totals.done}/${totals.total}`, label: wavesLabel, tone };
    return { icon: KIND_ICON[type], value: list.length, label: list.length === 1 ? singular : plural, tone };
  };

  const hotfixChip = waveChip("hotfix", "danger", "hotfix", "hotfixes", "ondas hotfix");
  if (hotfixChip) chips.push(hotfixChip);
  const modernizationChip = waveChip("modernization", "violet", "modernização", "modernizações", "ondas modernização");
  if (modernizationChip) chips.push(modernizationChip);

  return chips;
}
