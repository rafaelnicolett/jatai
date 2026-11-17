/**
 * foundation-plan.ts
 *
 * O plano completo do Foundation — o mesmo que o `@assessor` registra no
 * `TodoWrite`, mas **derivado**, não espelhado.
 *
 * **Por que derivar em vez de espelhar:** o `TodoWrite` vive no chat e a
 * extensão não tem como lê-lo. Mas o plano é inteiramente determinado por
 * coisas que já temos no disco:
 *
 *     repos.yaml (N repos) × FOUNDATION_CONTRACTS (fases e escopo)
 *   + foundation-state.yaml (o que concluiu)  + runs/*.jsonl (o que roda agora)
 *
 * Derivar tem uma vantagem que espelhar não tem: **não depende do agente
 * lembrar de sincronizar**. Se o `@assessor` esquecer o TodoWrite, o plano da
 * tela continua correto.
 *
 * É isto que responde "nunca sei onde está parado": o chat mostrava 22 itens e
 * o dashboard mostrava 4 barras.
 */

import {
  FOUNDATION_CONTRACTS,
  SKILL_LINKING_CONTRACT,
  resolveArtifactPath,
  type FoundationPhaseContract,
} from "../methodology/foundation-contracts";
import { scannableRepos, type ReposInventory } from "../contracts/repos-contract.pure";
import {
  phasesForRepo,
  gateD1ForRepo,
  isD1GlobalReady,
  type FoundationState,
} from "../contracts/foundation-state-contract.pure";
import type { LiveActivity } from "../contracts/run-events-contract.pure";

/**
 * - `pending`   — ainda não começou
 * - `running`   — sub-agente trabalhando agora (vem dos eventos)
 * - `review`    — terminou e **aguarda você** (o `agent-done`)
 * - `done`      — aprovado no gate
 * - `blocked`   — depende de algo que não aconteceu (ex.: domínio antes do D1 de todos)
 */
export type PlanItemStatus = "pending" | "running" | "review" | "done" | "blocked";

export interface PlanItem {
  /** Único na lista: `<repo>/<fase>` ou `<fase>` para cross-repo. */
  key: string;
  kind: "phase" | "gate";
  label: string;
  agent: string;
  icon: string;
  status: PlanItemStatus;
  scope: "repo" | "workspace";
  /** Ausente em item cross-repo. */
  repoId?: string;
  /** Artefato produzido, relativo a `.github/artifacts/`. */
  produces?: string;
  /** Por que esta fase existe — o learning, lido no contexto. */
  why?: string;
  /** Quando `blocked`, o que falta. */
  blockedBy?: string;
  /** Ausente no Foundation. Presente (upstream/downstream/operation) nos itens do Delivery. */
  stream?: "upstream" | "downstream" | "operation";
}

export interface FoundationPlan {
  items: PlanItem[];
  done: number;
  total: number;
  /** Primeiro item que exige ação humana, ou o próximo a rodar. */
  focus: PlanItem | null;
}

/** Fases cross-repo que só rodam depois que TODOS os repos fecham o D1. */
const AFTER_ALL_REPOS = [
  "dependency-graph", "domain", "wiki-synthesis",
  "business-context", "interview", "baseline", "skill-linking",
];

function statusFromState(
  contract: FoundationPhaseContract,
  state: FoundationState | null,
  activity: LiveActivity,
  repoId?: string
): PlanItemStatus {
  const matches = (e: { phase_id?: string; repo_id?: string } | null): boolean =>
    !!e && e.phase_id === contract.phaseId && (e.repo_id ?? undefined) === repoId;

  const phase = repoId
    ? phasesForRepo(state, repoId)[contract.phaseId]
    : state?.phases[contract.phaseId];

  // `done` no state é TERMINAL e autoritativo — é o registro da aprovação humana
  // (o gate). Um evento `agent-done` sem `gate-approved` correspondente (comum:
  // o agente aprovou e seguiu sem emitir o evento) NÃO pode rebaixar uma fase
  // concluída para "review". Estado de conclusão vence evento; evento só mostra
  // liveness (running) sobre o que ainda não terminou.
  if (phase?.status === "done") return "done";

  if (activity.runningByKey.some(matches)) return "running";
  if (activity.awaiting.some(matches)) return "review";

  switch (phase?.status) {
    case "agent-done":  return "review";
    case "in-progress": return "running";
    default:            return "pending";
  }
}

/**
 * Monta o plano inteiro: um bloco por repositório, depois o cross-repo.
 *
 * A ordem espelha o protocolo do `@assessor` — repo por repo, completo, e só
 * então o domínio. Não é decoração: é o que faz o operador entender que um repo
 * grande não trava os outros.
 */
export function buildFoundationPlan(
  inventory: ReposInventory | null,
  state: FoundationState | null,
  activity: LiveActivity
): FoundationPlan {
  const repos = scannableRepos(inventory);
  const items: PlanItem[] = [];

  const repoPhases = FOUNDATION_CONTRACTS.filter((c) => c.scope === "repo");
  const workspacePhases = [
    ...FOUNDATION_CONTRACTS.filter((c) => c.scope === "workspace"),
    SKILL_LINKING_CONTRACT,
  ];

  // ── Bloco por repositório ──
  for (const repo of repos) {
    for (const c of repoPhases) {
      // Fase condicional (design só em repo com UI): pula quando o tech-mapper
      // já determinou que não há frontend. Antes disso (has_frontend undefined)
      // a fase aparece — melhor mostrar e o agente pular do que esconder algo
      // que talvez precise rodar.
      if (c.appliesWhen === "frontend" && repo.has_frontend === false) continue;

      items.push({
        key: `${repo.id}/${c.phaseId}`,
        kind: "phase",
        label: c.label,
        agent: c.agent,
        icon: c.icon,
        scope: "repo",
        repoId: repo.id,
        status: statusFromState(c, state, activity, repo.id),
        produces: resolveArtifactPath(c, repo.id),
        why: c.why,
      });
    }

    const gate = gateD1ForRepo(state, repo.id);
    // Fase condicional que não se aplica a este repo não conta para o gate —
    // senão um repo sem UI nunca fecharia o D1 (design ficaria eternamente pendente).
    const applicable = repoPhases.filter(
      (c) => !(c.appliesWhen === "frontend" && repo.has_frontend === false)
    );
    const phasesDone = applicable.every(
      (c) => statusFromState(c, state, activity, repo.id) === "done"
    );
    items.push({
      key: `${repo.id}/gate-d1`,
      kind: "gate",
      label: "Gate D1 do repositório",
      agent: "@assessor",
      icon: "✋",
      scope: "repo",
      repoId: repo.id,
      status: gate === "approved" ? "done" : phasesDone ? "review" : "blocked",
      why: "Cada repositório fecha o seu D1 — um repo grande nunca trava os outros.",
      ...(gate !== "approved" && !phasesDone ? { blockedBy: "fases deste repositório" } : {}),
    });
  }

  // ── Cross-repo: só depois que todos os repos fecham o D1 ──
  const reposPending = repos.filter((r) => gateD1ForRepo(state, r.id) !== "approved").map((r) => r.id);

  for (const c of workspacePhases) {
    // dependency-graph só existe sentido com N > 1 — não mostra item nenhum
    // (nem "bloqueado") para o caso comum de workspace com 1 repositório.
    if (c.appliesWhen === "multi-repo" && repos.length <= 1) continue;

    const status = statusFromState(c, state, activity);
    const gatedByRepos = AFTER_ALL_REPOS.includes(c.phaseId) && reposPending.length > 0;
    items.push({
      key: c.phaseId,
      kind: "phase",
      label: c.label,
      agent: c.agent,
      icon: c.icon,
      scope: "workspace",
      status: status === "pending" && gatedByRepos ? "blocked" : status,
      produces: c.out,
      why: c.why,
      ...(gatedByRepos ? { blockedBy: `D1 de ${reposPending.join(", ")}` } : {}),
    });
  }

  // ── Gate final ──
  // O gate global só fecha quando todo repo tem D1 E todas as fases cross-repo
  // mandatory estão done — não só o domínio.
  const requiredWorkspacePhases = workspacePhases
    .filter((c) => c.mandatoryForF1)
    .map((c) => c.phaseId);
  const crossRepoPending = workspacePhases
    .filter((c) => c.mandatoryForF1 && statusFromState(c, state, activity) !== "done")
    .map((c) => c.label);
  items.push({
    key: "gate-d1-global",
    kind: "gate",
    label: "Gate D1 global — libera o Planning",
    agent: "@assessor",
    icon: "🏁",
    scope: "workspace",
    status: isD1GlobalReady(state, inventory, requiredWorkspacePhases) ? "done" : "blocked",
    why: "Fecha quando todo repositório tem D1 aprovado E as fases cross-repo (domínio, negócio, baseline, skill-linking) estão concluídas.",
    ...(reposPending.length > 0
      ? { blockedBy: `D1 de ${reposPending.join(", ")}` }
      : crossRepoPending.length > 0
        ? { blockedBy: crossRepoPending.join(", ") }
        : {}),
  });

  const done = items.filter((i) => i.status === "done").length;

  // Foco: o que exige você primeiro; senão o que está rodando; senão o próximo.
  const focus =
    items.find((i) => i.status === "review") ??
    items.find((i) => i.status === "running") ??
    items.find((i) => i.status === "pending") ??
    null;

  return { items, done, total: items.length, focus };
}

/** Agrupa por repositório para a tela — cross-repo cai em `workspace`. */
export function groupPlanByRepo(plan: FoundationPlan): Map<string, PlanItem[]> {
  const groups = new Map<string, PlanItem[]>();
  for (const item of plan.items) {
    const k = item.repoId ?? "workspace";
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}
