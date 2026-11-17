/**
 * computeModernizationBoard.ts
 *
 * Adapter puro do formato "modernization" de iniciativa (roadmap incremental
 * por ondas, não o PHASE_ORDER linear) — projeta `ModernizationWaveEntry[]`
 * (já parseado por `parseWaveLabel`/`wave_status`) no vocabulário genérico que
 * `PhaseMap`/`PhaseBoard` consomem. Nunca reparseia YAML — tudo aqui já
 * chegou pronto via `@data`.
 */

import { parseWaveContent, hasPlanningGate, type Initiative, type InitiativeKind, type ModernizationWaveEntry, type PlanItemStatus, type WaveItemStatusEntry, type WaveStatusEntry } from "@data";
import type { BoardCard, MapNode } from "../../design-system/patterns";

export const MODERNIZATION_OVERVIEW_KEY = "__overview__";

/**
 * Vocabulário de rótulo pra uma iniciativa (ADR-0006) — dado-driven, nunca
 * lê `helyx.deliveryHierarchy` diretamente (o Cockpit não tem acesso a essa
 * setting aqui, e o dado real da iniciativa é o sinal correto, igual ao
 * `@feature-adder`, item 2.3): `epics`/`epic_status` presentes vira "Epic";
 * senão, `waves`/`wave_status` (sempre existiu, sempre retrocompat).
 */
export interface GroupVocabulary {
  labels: string[];
  statusMap: Record<string, WaveStatusEntry> | undefined;
  prefix: "wave" | "epic";
  groupLabel: string;
  groupLabelPlural: string;
}

export function resolveGroupVocabulary(initiative: Initiative): GroupVocabulary {
  if (initiative.epics && initiative.epics.length > 0) {
    return { labels: initiative.epics, statusMap: initiative.epic_status, prefix: "epic", groupLabel: "Epic", groupLabelPlural: "epics" };
  }
  return { labels: initiative.waves ?? [], statusMap: initiative.wave_status, prefix: "wave", groupLabel: "Onda", groupLabelPlural: "ondas" };
}

/**
 * `wave_status.status`/`item.status` são texto livre do agente ("done"/
 * "in-progress" são os únicos valores reais até hoje) — qualquer outra coisa
 * cai em "pending" em vez de quebrar o mapa/board. Mesmo mapeamento que
 * `toPlanItemStatus()` já implementava, duplicado hoje em
 * `ModernizationSidebar.tsx`/`ModernizationWaveDetail.tsx` — este adapter
 * passa a ser a única fonte.
 */
function toPlanItemStatus(status: string | undefined): PlanItemStatus {
  if (status === "done") return "done";
  if (status === "in-progress") return "running";
  return "pending";
}

function isFilled(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/** A chave `wave-N` real do `wave_status` — mesma fórmula duplicada em `ModernizationProgress.tsx`/o antigo `ModernizationWaveDetail.tsx` (`wave.index` quando presente, senão a posição no array). */
export function modernizationWaveKey(wave: ModernizationWaveEntry, index: number, prefix: "wave" | "epic" = "wave"): string {
  return `${prefix}-${wave.index ?? index}`;
}

/**
 * Rótulo do badge de tipo na Visão Geral (ADR-0001) — cada `type` que usa
 * esta vista por ondas tem seu próprio rótulo; qualquer outro caso que
 * chegue aqui via `hasPlanningGate` sem ser modernization/hotfix (ex.: uma
 * `feature` com migração de schema via `@modernization-planner`) cai no
 * fallback "Planning", que já era o comportamento original.
 */
export function waveViewKindLabel(type: InitiativeKind | undefined): string {
  if (type === "modernization") return "Modernização";
  if (type === "hotfix") return "Hotfix";
  return "Planning";
}

/**
 * `DeliveryProgress.tsx` decide entre a vista por ondas (`ModernizationProgress`)
 * e a escadaria genérica de 16 fases (ADR-0001). `modernization`/`hotfix` sempre
 * usam a vista por ondas; qualquer outro `type` só usa se já passou por um gate
 * de Planning completo (`hasPlanningGate` — ex.: `feature` com migração de schema).
 */
export function usesWaveView(initiative: Initiative | null | undefined): boolean {
  if (!initiative) return false;
  return initiative.type === "modernization" || initiative.type === "hotfix" || hasPlanningGate(initiative);
}

/**
 * Nós do mapa horizontal de ondas — o nó `__overview__` sempre vem PRIMEIRO e
 * com `status: "done"` fixo (decisão confirmada no plano): é sempre
 * "disponível", nunca compete visualmente com pending/running de uma onda de
 * verdade. As demais ondas herdam o status derivado de `wave.status?.status`.
 */
export function modernizationMapNodes(waves: ModernizationWaveEntry[], groupLabel = "Onda", prefix: "wave" | "epic" = "wave"): MapNode[] {
  const overview: MapNode = { key: MODERNIZATION_OVERVIEW_KEY, label: "Visão geral", status: "done", kind: "phase" };
  const waveNodes: MapNode[] = waves.map((wave, i) => ({
    key: modernizationWaveKey(wave, i, prefix),
    label: wave.index !== null ? `${groupLabel} ${wave.index}` : `${groupLabel} ${i + 1}`,
    status: toPlanItemStatus(wave.status?.status),
  }));
  return [overview, ...waveNodes];
}

/**
 * Lane de um item de execution — mesmo mapeamento padrão (done/in-progress/
 * resto), MAS enriquecido: um item ainda não `done` que carrega
 * `merge_block` ou `known_bugs_pinned` é classificado `blocked` em vez de
 * `pending`/`running` — mais rico que o `toPlanItemStatus()` original, que
 * nunca produzia `blocked`.
 */
function itemLane(item: WaveItemStatusEntry): PlanItemStatus {
  const base = toPlanItemStatus(item.status);
  if (base !== "done" && (Boolean(item.merge_block) || (item.known_bugs_pinned?.length ?? 0) > 0)) return "blocked";
  return base;
}

/**
 * Cards de UMA onda (ou do que a onda promete, se Execution ainda não
 * chegou nela) — 3 formatos distintos:
 *
 *  - `wave.status.items` (item-a-item): 1 card por item. Aprovação reaproveita
 *    EXATAMENTE a mesma condição que `WaveItemApproveAction`
 *    (`ModernizationWaveDetail.tsx`, removido nesta entrega) já implementava,
 *    ADICIONADA de um requisito de produto (fix desta sessão): o botão só
 *    aparece em item explicitamente marcado como gate
 *    (`requires_approval: true`) — a maioria dos itens de execução comum
 *    NUNCA deveria mostrar "Aprovar" (aprovação de rotina acontece no nível
 *    de onda/iniciativa via `roadmap_gate`/`risk_matrix_gate`/`gate_d2`, não
 *    por item). Então: só um item com `status: "done"`, `requires_approval:
 *    true` e ainda sem `human_approved_at` ganha o botão — nunca um item
 *    `running`/`pending`, mesmo que sua `lane` (após o enriquecimento acima)
 *    seja outra. Fricção idêntica: campos de `approvalFrictionFields`
 *    preenchidos no item exigem o checkbox de reconhecimento antes de
 *    habilitar o botão.
 *
 *    Regressão corrigida nesta sessão (fix-report-helyx-vscode-wave-board-
 *    bugs.md): este ramo antes NUNCA fazia merge com o catálogo esperado da
 *    onda (`parseWaveContent(wave.label)`) — assim que 1 item aparecia em
 *    `wave.status.items`, qualquer item do catálogo AINDA não tocado pelo
 *    agente sumia do board (nenhum card "pending" pra ele). Agora, quando o
 *    catálogo é parseável, o card final é o merge por id: item do catálogo
 *    com entrada real em `items[id]` usa o status/summary real; item do
 *    catálogo sem entrada aparece como "pending" (mesmo formato do 3º ramo);
 *    a ORDEM do catálogo é preservada (não a ordem, possivelmente fora de
 *    ordem, de inserção de `wave.status.items`). Itens já reportados que não
 *    batem com nenhum texto do catálogo (nomes fora do padrão, ou rótulo da
 *    wave não-parseável) continuam aparecendo — nunca escondidos.
 *  - `wave.status` sem `items` (onda "plana", só `status` no nível da onda):
 *    1 card único representando a onda inteira. `WaveStatusEntry` não carrega
 *    `human_approved_at`/`merge_block` (só `WaveItemStatusEntry` carrega) e
 *    `approveWaveItemHandler` exige um item já existente em
 *    `wave_status.<wave>.items.<item>` — não há alvo real para aprovar uma
 *    onda inteira sem granularidade de item, então este card nunca ganha
 *    `approve` (evita fabricar um botão que só produziria "item não
 *    encontrado" no host).
 *  - Sem `wave.status` nenhum (Execution ainda não chegou nesta onda): cards
 *    vêm de `parseWaveContent(wave.label).items` — o que a onda PROMETE,
 *    sempre `lane: "pending"`, sem `approve`.
 *
 * `onToggleAcknowledged` é uma extensão da assinatura combinada com o
 * chamador (não fazia parte do vocabulário anterior de `WaveItemApproveAction`,
 * que guardava o checkbox em estado local do próprio componente): como este
 * adapter é puro, o checkbox de fricção (`BoardCard.approve.friction`) precisa
 * de um setter explícito vindo de fora — `acknowledgedByItem` é só leitura.
 */
export function modernizationBoardCards(
  waveKey: string,
  wave: ModernizationWaveEntry,
  approvalFrictionFields: string[],
  onApprove: (itemKey: string, acknowledged: boolean) => void,
  acknowledgedByItem: Record<string, boolean>,
  onToggleAcknowledged: (itemKey: string, acknowledged: boolean) => void
): BoardCard[] {
  const items = wave.status?.items;

  if (items && Object.keys(items).length > 0) {
    const realCard = (itemKey: string, item: WaveItemStatusEntry): BoardCard => {
      const lane = itemLane(item);
      const details = {
        ...(item.commit ? { commit: item.commit } : {}),
        ...(item.artifacts && item.artifacts.length > 0 ? { artifacts: item.artifacts } : {}),
        ...(item.known_bugs_pinned && item.known_bugs_pinned.length > 0 ? { knownBugs: item.known_bugs_pinned } : {}),
      };
      const card: BoardCard = {
        key: itemKey,
        id: itemKey,
        title: item.summary ?? itemKey,
        lane,
        status: lane,
        ...(item.completed_at ? { meta: item.completed_at } : {}),
        ...(Object.keys(details).length > 0 ? { details } : {}),
      };

      if (item.status === "done" && item.requires_approval === true && !item.human_approved_at) {
        const risky = approvalFrictionFields.filter((field) => isFilled((item as unknown as Record<string, unknown>)[field]));
        const acknowledged = acknowledgedByItem[itemKey] ?? false;
        card.approve = {
          onApprove: () => onApprove(itemKey, risky.length === 0 || acknowledged),
          ...(risky.length > 0
            ? {
                friction: {
                  label: `Vi ${risky.join(" e ")} antes de aprovar`,
                  acknowledged,
                  onAcknowledgedChange: (nextAcknowledged: boolean) => onToggleAcknowledged(itemKey, nextAcknowledged),
                },
              }
            : {}),
        };
      }

      return card;
    };

    const catalog = parseWaveContent(wave.label).items;
    if (catalog.length === 0) {
      // Rótulo da wave não parseável (sem "(item1, item2, ...)") — nada pra fazer merge, mesmo comportamento de antes: só os itens já em wave.status.items.
      return Object.entries(items).map(([itemKey, item]) => realCard(itemKey, item));
    }

    const matched = new Set<string>();
    const cards: BoardCard[] = catalog.map((catalogId, i) => {
      const item = items[catalogId];
      if (item) {
        matched.add(catalogId);
        return realCard(catalogId, item);
      }
      return {
        key: `${waveKey}-plan-${i}`,
        id: String(i + 1),
        title: catalogId,
        lane: "pending" as const,
        status: "pending" as const,
      };
    });
    // Itens já reportados que não batem com nenhuma entrada do catálogo (texto livre fora do padrão) continuam visíveis — nunca escondidos.
    for (const [itemKey, item] of Object.entries(items)) {
      if (!matched.has(itemKey)) cards.push(realCard(itemKey, item));
    }
    return cards;
  }

  if (wave.status) {
    const lane = toPlanItemStatus(wave.status.status);
    const card: BoardCard = {
      key: waveKey,
      id: waveKey,
      title: wave.label,
      lane,
      status: lane,
      ...(wave.status.note ? { meta: wave.status.note } : {}),
    };
    return [card];
  }

  const content = parseWaveContent(wave.label);
  return content.items.map((label, i) => ({
    key: `${waveKey}-plan-${i}`,
    id: String(i + 1),
    title: label,
    lane: "pending" as const,
    status: "pending" as const,
  }));
}
