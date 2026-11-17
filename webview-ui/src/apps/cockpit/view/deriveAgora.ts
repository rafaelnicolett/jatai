/**
 * deriveAgora.ts — a entrada "Agora" do Cockpit (DS v2 §4.3, F4.2): onde a
 * missão está, quem trabalha agora, o que espera VOCÊ e o que está bloqueado
 * ou falhou, com o motivo em texto. Tudo derivado do `ViewContext` por funções
 * puras (o componente só desenha) e tudo com fonte: nada é inventado.
 *
 * O que espera o operador, em ordem de peso: gates, fase de entrega em
 * revisão, tarefa que exige aprovação, item de sprint, fase do Foundation e a
 * decisão que um agente pediu.
 */
import { deriveColmeia, type RunEvent } from "@data";
import type { DecisionRef } from "./decisionRef";
import { refKey } from "./decisionRef";
import { decisionKeyOf, openDecisionRequest } from "./deriveDecision";
import { d1Rows, flowFor } from "./flows";
import { waveTask } from "./deriveBoard";
import type { TrackModel } from "./deriveTrack";
import { resolveGroupVocabulary } from "../../../features/delivery/computeModernizationBoard";
import type { ViewContext } from "./viewTarget";

export interface AgoraWaiting {
  id: string;
  ref: DecisionRef;
  /** "Gate D3 · Modernização X", "Titularidade do código". */
  title: string;
  detail: string;
}

export interface AgoraProblem {
  key: string;
  kind: "blocked" | "failed";
  title: string;
  reason: string;
}

export interface AgoraAgent {
  name: string;
  /** O que o agente faz, do último evento dele (só o texto curto do evento, nunca conteúdo). */
  task?: string;
}

export interface AgoraModel {
  where: {
    initiative: string | null;
    kind: string | null;
    stream: string | null;
    /** "Epic 0", a parada onde a missão está. */
    focus: string | null;
    isActive: boolean;
  };
  activity: { count: number; agents: AgoraAgent[]; lastEventAt: string | null };
  waiting: AgoraWaiting[];
  problems: AgoraProblem[];
}

const KIND_LABEL: Record<string, string> = { modernization: "Modernização", hotfix: "Hotfix", feature: "Feature", foundation: "Foundation" };

const RANK: Record<DecisionRef["kind"], number> = { gate: 0, phase: 1, approval: 2, "sprint-item": 3, "foundation-phase": 4, decision: 5 };

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function agentName(id: string | undefined): string | undefined {
  return id ? (id.startsWith("@") ? id : `@${id}`) : undefined;
}

/** Tudo o que espera o operador na iniciativa vista, em ordem de peso. */
export function waitingDecisions(ctx: ViewContext, track: TrackModel): AgoraWaiting[] {
  const list: AgoraWaiting[] = [];
  const add = (ref: DecisionRef, title: string, detail: string): void => {
    list.push({ id: refKey(ref), ref, title, detail });
  };
  const initiative = ctx.initiative;

  // Gates cujo trabalho anterior fechou e a decisão espera você.
  for (const bridge of track.bridges) {
    if (bridge.status !== "waiting") continue;
    if (bridge.gate === "D1") {
      for (const row of d1Rows(ctx).filter((r) => !r.approved && r.closed)) {
        add({ kind: "gate", gate: "d1", repoId: row.repoId }, `Gate D1 · ${row.repoId}`, "As fases do repositório fecharam; a decisão espera você.");
      }
    } else if (initiative && (bridge.gate === "D2" || bridge.gate === "D3")) {
      add({ kind: "gate", gate: bridge.gate === "D2" ? "d2" : "d3", initiativeId: initiative.id }, `Gate ${bridge.gate} · ${initiative.name}`, bridge.reason ?? "A decisão espera você.");
    }
  }

  // Fases de entrega em revisão e itens de sprint (só a iniciativa ativa carrega esse detalhe).
  if (track.kind === "greenfield" && ctx.isActive) {
    for (const item of ctx.snapshot.deliveryPlan?.items ?? []) {
      if (item.kind === "phase" && item.status === "review") add({ kind: "phase", phaseId: item.key }, `Fase "${item.label}"`, `${item.agent} terminou; confirme o checklist e aprove.`);
    }
    for (const sprint of ctx.snapshot.sprintBacklog?.sprints ?? []) {
      for (const it of sprint.items) if (it.status === "review") add({ kind: "sprint-item", sprintItemId: it.id }, `Item "${it.title}"`, `${sprint.name}: em revisão, espera a sua aprovação.`);
    }
  }

  // Tarefas concluídas que exigem a aprovação humana.
  if (initiative) {
    const vocab = resolveGroupVocabulary(initiative);
    for (const [wave, entry] of Object.entries(vocab.statusMap ?? {})) {
      for (const [itemKey, item] of Object.entries(entry.items ?? {})) {
        const task = waveTask(initiative.id, wave, itemKey, item, ctx.events);
        if (task.decision?.kind === "approval") add(task.decision, `Aprovar "${task.title}"`, `Tarefa ${task.key} concluída; exige a sua aprovação.`);
      }
    }
  }

  // Fases do Foundation que o agente terminou (só quando a Descoberta é o assunto).
  if (ctx.target.kind === "discovery" || track.currentSegmentId === "discovery") {
    for (const item of ctx.snapshot.foundationPlan?.items ?? []) {
      if (item.kind !== "phase" || item.status !== "review") continue;
      const phaseId = item.key.split("/").pop() ?? item.key;
      add({ kind: "foundation-phase", phaseId, ...(item.repoId ? { repoId: item.repoId } : {}) }, `Confirmar "${item.label}"${item.repoId ? ` · ${item.repoId}` : ""}`, `${item.agent} terminou; a confirmação é sua.`);
    }
  }

  // Decisões que um agente pediu e ainda não foram tomadas.
  const keys = new Set<string>();
  for (const e of ctx.events) if (e.event_type === "decision-requested") keys.add(decisionKeyOf(e));
  for (const key of keys) {
    const request = openDecisionRequest(ctx.events, key);
    if (request) add({ kind: "decision", key }, capitalize(request.message?.trim() || "Decisão pedida por um agente"), (typeof request.metadata?.reason === "string" && request.metadata.reason) || "Um agente pediu uma decisão humana.");
  }

  return list.map((w, i) => ({ w, i })).sort((a, b) => RANK[a.w.ref.kind] - RANK[b.w.ref.kind] || a.i - b.i).map(({ w }) => w);
}

/** O que está bloqueado ou falhou, com o motivo em texto (ADR-0022 §7). */
export function problemsOf(ctx: ViewContext): AgoraProblem[] {
  const out: AgoraProblem[] = [];
  const initiative = ctx.initiative;
  if (initiative) {
    const vocab = resolveGroupVocabulary(initiative);
    for (const [wave, entry] of Object.entries(vocab.statusMap ?? {})) {
      for (const [itemKey, item] of Object.entries(entry.items ?? {})) {
        const task = waveTask(initiative.id, wave, itemKey, item, ctx.events);
        if (task.condition && task.condition.kind !== "cancelled") out.push({ key: task.key, kind: task.condition.kind, title: task.title, reason: task.condition.reason });
      }
    }
  }
  if (ctx.isActive) {
    for (const e of ctx.snapshot.workStatus?.entries ?? []) {
      if (e.scope === "phase" && (e.status === "blocked" || e.status === "failed")) out.push({ key: e.key, kind: e.status, title: e.key, reason: e.reason ?? "sem motivo registrado" });
    }
  }
  return out;
}

function lastMessageOf(events: RunEvent[], agent: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (agentName(e.agent_id) === agent && e.message) return e.message;
  }
  return undefined;
}

function activityOf(ctx: ViewContext): AgoraModel["activity"] {
  const lastEventAt = ctx.events.length > 0 ? ctx.events[ctx.events.length - 1]!.timestamp : null;
  let names: Array<{ name: string | undefined; task?: string }>;
  if (ctx.initiative) {
    const colmeia = deriveColmeia(ctx.projected, ctx.events, flowFor(ctx.initiative));
    names = colmeia.bees.filter((b) => b.state === "working").map((b) => ({ name: b.agentId ?? undefined, ...(b.taskId ? { task: b.taskId } : {}) }));
  } else {
    names = ctx.snapshot.liveActivity.runningByKey.map((e) => ({ name: agentName(e.agent_id), ...(e.message ? { task: e.message } : {}) }));
  }
  const seen = new Set<string>();
  const agents: AgoraAgent[] = [];
  for (const n of names) {
    if (!n.name || seen.has(n.name)) continue;
    seen.add(n.name);
    const message = lastMessageOf(ctx.events, n.name);
    const task = message ?? n.task;
    agents.push({ name: n.name, ...(task ? { task } : {}) });
  }
  return { count: names.length, agents, lastEventAt };
}

export function deriveAgora(ctx: ViewContext, track: TrackModel): AgoraModel {
  const initiative = ctx.initiative;
  const current = track.segments.find((s) => s.id === track.currentSegmentId);
  const here = track.stops.find((s) => s.here);
  return {
    where: {
      initiative: initiative?.name ?? (ctx.target.kind === "discovery" ? "Descoberta do workspace" : null),
      kind: initiative ? (KIND_LABEL[initiative.type ?? "feature"] ?? null) : null,
      stream: current?.label ?? null,
      focus: here && track.kind !== "waves" ? `${here.unit} ${here.n}` : null,
      isActive: ctx.isActive,
    },
    activity: activityOf(ctx),
    waiting: waitingDecisions(ctx, track),
    problems: problemsOf(ctx),
  };
}

/**
 * O anúncio de decisão nova para a região `aria-live` (DS v2 §4.0 e §4.3):
 * anuncia só o que acabou de entrar, uma vez. `previous` é o conjunto de ids
 * já vistos; o primeiro estado (sem `previous`) nunca anuncia, para abrir o
 * Cockpit não ler em voz alta tudo o que já esperava.
 */
export function announceNewDecisions(previous: ReadonlySet<string> | null, waiting: AgoraWaiting[]): string | null {
  if (previous === null) return null;
  const fresh = waiting.filter((w) => !previous.has(w.id));
  if (fresh.length === 0) return null;
  if (fresh.length === 1) return `Nova decisão espera você: ${fresh[0]!.title}`;
  return `${fresh.length} novas decisões esperam você`;
}
