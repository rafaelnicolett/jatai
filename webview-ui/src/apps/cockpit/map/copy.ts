/**
 * copy.ts — os textos do mapa da colmeia em pt-BR (F5.3), em funções puras:
 * o que cada ilha diz de si, como o leitor de tela a lê e o que o estado de
 * uma abelha ou de um agente quer dizer. Voz da identidade visual: direta,
 * calma, sem exclamação nem emoji; "guarda", "ilha" e "pote" só no mapa, com o
 * termo literal ao lado quando é a primeira vez.
 *
 * Ficam fora dos componentes para o painel, a lista e o rótulo da cena dizerem
 * exatamente a mesma coisa (o teste de paridade da lista confere).
 */
import type { ColmeiaBridge, IslandAgentStatus, IslandDetail, IslandState } from "@data";
import type { WorkStatus } from "../../../design-system/status/workStatus";
import { describeWorkStatus } from "../../../design-system/status/workStatus";

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** O que a ilha é, em uma frase, para o painel e a lista. Vale para os 4 streams, os de greenfield e as ondas de um hotfix. */
const BLURB_BY_ID: Record<string, string> = {
  discovery: "Onde a colônia entende o terreno antes de construir: stack, arquitetura, domínio, qualidade, segurança, cobertura e dívida.",
  planning: "Onde a rota é decidida: épicos em ordem de dependência, matriz de risco e as decisões de arquitetura.",
  execution: "Onde a colônia constrói, um passo reversível de cada vez, com a rede de segurança de testes antes de qualquer mudança.",
  operation: "Onde o que foi entregue é publicado, observado e mantido: release, observabilidade, incidentes e sustentação.",
  upstream: "Onde a ideia vira produto: negócio, requisitos, domínio, cenários e arquitetura, até o gate G1.",
  downstream: "Onde o produto é construído e revisado, em ondas, até o gate G2.",
};

const BLURB_BY_LABEL: Record<string, string> = {
  diagnóstico: "Onde a causa raiz é encontrada, antes de qualquer correção.",
  correção: "Onde a correção entra, com o teste que reproduz o problema escrito antes.",
  validação: "Onde se confere que o problema sumiu e que nada regrediu.",
};

export function islandBlurb(island: { id: string; label: string }): string {
  return BLURB_BY_ID[island.id] ?? BLURB_BY_LABEL[island.label.toLocaleLowerCase("pt-BR")] ?? `Etapa ${island.label} da iniciativa.`;
}

/** Contagens do elenco de uma ilha, no que o rótulo, a legenda e o aria-label usam. */
export interface IslandCounts {
  working: number;
  blocked: number;
  failed: number;
  roster: number;
  guards: number;
}

export function countsOf(detail: Pick<IslandDetail, "agents" | "guards">): IslandCounts {
  const blocked = detail.agents.filter((a) => a.status === "blocked");
  const failed = blocked.filter((a) => a.reason?.startsWith("falhou"));
  return {
    working: detail.agents.filter((a) => a.status === "working").length,
    blocked: blocked.length - failed.length,
    failed: failed.length,
    roster: detail.agents.length,
    guards: detail.guards.length,
  };
}

/** A segunda metade do rótulo da ilha (a primeira é o nome) e o tom do texto. */
export function islandMeta(state: IslandState, counts: IslandCounts, wakesAfterGate?: string): { text: string; tone: "done" | "working" | "queue" | "future" } {
  if (state === "done") return { text: "concluída", tone: "done" };
  if (state === "sleeping") return { text: wakesAfterGate ? `depois do ${wakesAfterGate}` : "depois", tone: "future" };
  return counts.working > 0 ? { text: `${plural(counts.working, "agente trabalhando", "agentes trabalhando")}`, tone: "working" } : { text: "em andamento", tone: "queue" };
}

/** "Concluída · D1 aprovado", "Em andamento · Epic 0 · Fundação", "Ainda não começou": o eyebrow do painel. */
export function islandEyebrow(detail: Pick<IslandDetail, "state" | "focus">, gateAfter?: ColmeiaBridge): { status: WorkStatus; text: string } {
  if (detail.state === "done") return { status: "done", text: gateAfter?.state === "approved" ? `Concluída · ${gateAfter.gate} aprovado` : "Concluída" };
  if (detail.state === "sleeping") return { status: "future", text: "Ainda não começou" };
  return { status: "working", text: detail.focus ? `Em andamento · ${detail.focus}` : "Em andamento" };
}

/** O nome acessível do botão da ilha (DS v2 §4.8): o estado, quem trabalha e o que espera a pessoa. */
export function islandAriaLabel(detail: IslandDetail, counts: IslandCounts, gateAfter?: ColmeiaBridge): string {
  const head = `Ilha ${detail.label}`;
  if (detail.state === "sleeping") {
    return `${head}: ainda não começou${detail.wakesAfterGate ? `, acorda depois do gate ${detail.wakesAfterGate}` : ""}`;
  }
  const parts: string[] = [];
  if (detail.state === "done") {
    parts.push("concluída", plural(counts.roster, "agente", "agentes"));
    if (gateAfter?.state === "approved") parts.push(`gate ${gateAfter.gate} aprovado`);
  } else {
    parts.push(detail.focus ? `${detail.focus} em andamento` : "em andamento");
    parts.push(counts.working > 0 ? plural(counts.working, "agente trabalhando", "agentes trabalhando") : "ninguém trabalhando agora");
    if (counts.blocked > 0) parts.push(plural(counts.blocked, "bloqueado", "bloqueados"));
    if (counts.failed > 0) parts.push(plural(counts.failed, "falhou", "falharam"));
  }
  if (counts.guards > 0) parts.push(counts.guards === 1 ? "uma guarda espera você" : `${counts.guards} guardas esperam você`);
  return `${head}: ${parts.join(", ")}`;
}

/** O chip "■ 1 espera você" do rótulo da ilha. */
export const guardChip = (guards: number): string => (guards === 1 ? "1 espera você" : `${guards} esperam você`);

/** O status de trabalho (glifo e rótulo) de cada estado de agente na ilha; "na fila" e "adormecido" ficam no vocabulário da v2. */
export function agentStatusView(status: IslandAgentStatus, reason?: string): { status: WorkStatus; text: string } {
  switch (status) {
    case "working":
      return { status: "working", text: "trabalhando agora" };
    case "queued":
      return { status: "queue", text: "na fila" };
    case "sleeping":
      return { status: "future", text: "adormecido" };
    case "done":
      return { status: "done", text: "concluído" };
    case "blocked":
      return reason?.startsWith("falhou")
        ? { status: "failed", text: describeWorkStatus("failed", reason.replace(/^falhou:\s*/, "")) }
        : { status: "blocked", text: describeWorkStatus("blocked", reason) };
  }
}

/** A condição de uma abelha parada: bloqueio ou falha (ADR-0022: `falhou: <motivo>` no mesmo evento). */
export function beeCondition(state: "working" | "blocked", reason?: string): "working" | "blocked" | "failed" {
  if (state === "working") return "working";
  return reason?.startsWith("falhou") ? "failed" : "blocked";
}

/**
 * O chip "ao vivo" do cabeçalho (DS v2 §4.8): ao vivo, ou pausado com quantos
 * eventos esperam ("pausado · 3 novos"). Só pulsa quando alguém trabalha: com a
 * colmeia parada, nada se move.
 */
export function liveChip(input: { paused: boolean; waiting: number; working: number }): { state: "live" | "paused" | "idle"; text: string } {
  if (input.paused) return { state: "paused", text: input.waiting > 0 ? `pausado · ${input.waiting} ${input.waiting === 1 ? "novo" : "novos"}` : "pausado" };
  if (input.working > 0) return { state: "live", text: `ao vivo · ${plural(input.working, "agente trabalhando", "agentes trabalhando")}` };
  return { state: "idle", text: "ao vivo · ninguém trabalhando agora" };
}

/** O rótulo da entrega: o nome do arquivo, para o link do painel e da lista. */
export const potLabel = (artifactPath: string): string => artifactPath.split("/").pop() ?? artifactPath;

/** Linhas do checklist do gate, no texto de cada estado. */
export const CHECKLIST_TEXT: Record<string, { status: WorkStatus; text: string }> = {
  done: { status: "done", text: "feito" },
  "in-progress": { status: "working", text: "em andamento" },
  review: { status: "you", text: "espera você" },
  open: { status: "queue", text: "em aberto" },
  blocked: { status: "blocked", text: "bloqueado" },
  failed: { status: "failed", text: "falhou" },
  cancelled: { status: "cancelled", text: "cancelado" },
};
