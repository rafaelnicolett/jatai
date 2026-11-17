/**
 * deriveDecision.ts — o painel de decisão (DS v2 §4.7), um só para tudo o que
 * o operador decide: gates (D1, D2, D3), fase de entrega em revisão, tarefa
 * que exige aprovação, item de sprint, fase do Foundation e a decisão que um
 * agente pediu. Puro, sobre o `ViewContext`.
 *
 * Para um gate (ADR-0024), o painel mostra ANTES do clique a regra de
 * fechamento (`gate-readiness` e `gateClosure`, as mesmas que o `StateCommands`
 * aplica ao aprovar) e o checklist humano, com o que o operador pode marcar.
 * O botão de aprovar fica desabilitado, com o motivo em texto, enquanto o
 * trabalho anterior não fechou. O host é quem decide de verdade: se o estado
 * mudou no meio do caminho, a recusa dele (`GATE_NOT_CLOSED`) chega no painel.
 */
import {
  BRAND,
  FOUNDATION_CONTRACTS,
  PHASE_CONTRACTS,
  MISSING_REQUIREMENT,
  d1RequiredPhases,
  d2Readiness,
  executionGateItems,
  gateClosure,
  type GateItem,
  type RunEvent,
} from "@data";
import { d1RepoIds, repoEntry } from "./flows";
import { refKey, type DecisionRef } from "./decisionRef";
import type { ViewContext } from "./viewTarget";

/** O que o botão principal pede ao host quando o operador confirma. */
export type PrimaryRequest =
  | { type: "gates/approve"; gate: "d1" | "d2" | "d3"; repoId?: string; initiativeId?: string }
  | { type: "approveAndAdvancePhase"; phaseId: string }
  | { type: "approveWaveItem"; initiativeId: string; wave: string; item: string }
  | { type: "approveSprintItem"; sprintItemId: string }
  | { type: "decisions/record"; initiativeId?: string; taskId: string; phaseId?: string };

/** Quem persiste a marca de um item do checklist: o host (estado) ou só a tela (reconhecimento de risco). */
export type ChecklistToggle =
  | { via: "host"; type: "toggleGuardRail"; phaseId: string }
  | { via: "host"; type: "toggleFoundationGuardRail"; phaseId: string }
  | { via: "local" };

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
  required: boolean;
  checked: boolean;
  /** Ausente: o item só se lê (a marca por repositório do Foundation é feita no chat com o agente). */
  toggle?: ChecklistToggle;
}

export interface Requirement {
  key: string;
  /** Status em texto ("em andamento", "bloqueada", "sem registro"). */
  status: string;
  reason?: string;
}

export interface DecisionFact {
  label: string;
  /** `null`: o dado não está registrado (a tela mostra "—" e "sem dado registrado"). */
  value: string | null;
}

export interface DecisionModel {
  ref: DecisionRef;
  id: string;
  variant: "gate" | "decision";
  eyebrow: string;
  question: string;
  context: string;
  facts: DecisionFact[];
  checklist: ChecklistItem[];
  /** A regra de fechamento: o que impede o gate e o que foi cortado. Só nos gates. */
  closure: { open: Requirement[]; cancelled: Requirement[]; closedCount: number; total: number } | null;
  primary: { label: string; request: PrimaryRequest; disabledReason?: string } | null;
  /** A decisão pede texto de quem decide (o que foi decidido, curto). */
  needsText: boolean;
  /** Sem `primary` e sem caminho no Cockpit: por que a decisão se resolve no chat. */
  chatOnly?: string;
  /** Caminhos de evidência (relativos ao workspace) que o operador pode abrir. */
  evidence: string[];
  chatPrompt: string;
}

const STATUS_TEXT: Record<string, string> = {
  done: "concluída",
  "agent-done": "espera a sua confirmação",
  "in-progress": "em andamento",
  pending: "pendente",
  missing: "sem registro",
  blocked: "bloqueada",
  failed: "falhou",
  cancelled: "cancelada",
  skipped: "pulada",
  approved: "aprovado",
};

export function requirementStatusText(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function foundationLabel(phaseId: string): string {
  return FOUNDATION_CONTRACTS.find((c) => c.phaseId === phaseId)?.label ?? phaseId;
}

function closureOf(items: GateItem[]): NonNullable<DecisionModel["closure"]> {
  const closure = gateClosure(items);
  const req = (i: GateItem): Requirement => ({ key: i.key, status: requirementStatusText(i.status), ...(i.reason ? { reason: i.reason } : {}) });
  return { open: closure.open.map(req), cancelled: closure.cancelled.map(req), closedCount: items.length - closure.open.length, total: items.length };
}

const NOTE_PROMPT = (text: string): string => `@${BRAND.participant.name} ${text}`;

/** Motivo do botão desabilitado de um gate: o que falta, em texto. */
function closureDisabledReason(unit: { one: string; many: string }, count: number): string | undefined {
  return count === 0 ? undefined : `Falta fechar ${plural(count, unit.one, unit.many)}`;
}

function gateD1(ctx: ViewContext, repoId: string): DecisionModel {
  const foundation = ctx.snapshot.foundationState;
  const entry = repoEntry(ctx, repoId);
  const repoState = foundation?.repos[repoId];
  // A regra de fechamento do D1 (gate-readiness): toda fase do Foundation do repositório concluída.
  const closure = closureOf(d1RequiredPhases(entry).map((id) => ({ key: foundationLabel(id), status: repoState?.phases[id]?.status ?? MISSING_REQUIREMENT })));
  // O checklist humano das fases que o agente terminou e esperam a confirmação (a marca por repositório é do chat).
  const checklist: ChecklistItem[] = Object.entries(repoState?.phases ?? {})
    .filter(([, phase]) => phase.status === "agent-done")
    .flatMap(([phaseId, phase]) =>
      (FOUNDATION_CONTRACTS.find((c) => c.phaseId === phaseId)?.checklist ?? []).map((item) => ({
        id: `${phaseId}/${item.id}`,
        label: `${foundationLabel(phaseId)}: ${item.label}`,
        ...(item.hint ? { hint: item.hint } : {}),
        required: item.mandatory,
        checked: phase.human_checklist[item.id] === true,
      }))
    );
  const ref: DecisionRef = { kind: "gate", gate: "d1", repoId };
  const missing = closureDisabledReason({ one: "fase do Foundation", many: "fases do Foundation" }, closure.open.length);
  return {
    ref,
    id: refKey(ref),
    variant: "gate",
    eyebrow: "Gate D1 · Descoberta → Planejamento",
    question: `Aprovar o D1 de ${repoId}?`,
    context: "O D1 confirma que a Descoberta deste repositório está completa. Aprovar um repositório não aprova os outros.",
    facts: [
      { label: "O que está em jogo", value: `A Descoberta de ${repoId}` },
      { label: "O que a decisão libera", value: "O Planejamento com este repositório" },
      { label: "O que não trava", value: "A Descoberta dos outros repositórios" },
    ],
    checklist,
    closure,
    primary: { label: "Aprovar o D1", request: { type: "gates/approve", gate: "d1", repoId }, ...(missing ? { disabledReason: missing } : {}) },
    needsText: false,
    evidence: [],
    chatPrompt: NOTE_PROMPT(`Quero decidir o Gate D1 do repositório ${repoId}. O que ainda falta para aprovar?`),
  };
}

function gateD2(ctx: ViewContext, initiativeId: string): DecisionModel | null {
  const initiative = ctx.snapshot.initiatives?.initiatives.find((i) => i.id === initiativeId);
  if (!initiative) return null;
  const readiness = d2Readiness(initiative);
  const labels: Record<string, string> = { roadmap_gate: "Roadmap aprovado", risk_matrix_gate: "Matriz de risco aprovada" };
  const open: Requirement[] = readiness.open.map((o) => ({ key: labels[o.key] ?? o.key, status: requirementStatusText(o.status) }));
  const checklist: ChecklistItem[] = (["roadmap_gate", "risk_matrix_gate"] as const).map((key) => ({
    id: key,
    label: labels[key]!,
    required: true,
    checked: initiative[key]?.status === "approved",
  }));
  const total = checklist.length;
  return {
    ref: { kind: "gate", gate: "d2", initiativeId },
    id: refKey({ kind: "gate", gate: "d2", initiativeId }),
    variant: "gate",
    eyebrow: "Gate D2 · Planejamento → Execução",
    question: `Aprovar o D2 de "${initiative.name}"?`,
    context: "O D2 confirma o roadmap e a matriz de risco antes de a Execução começar, épico por épico.",
    facts: [
      { label: "O que está em jogo", value: "O roadmap e a matriz de risco" },
      { label: "O que a decisão libera", value: "A Execução, por épicos" },
    ],
    checklist,
    closure: { open, cancelled: [], closedCount: total - open.length, total },
    primary: {
      label: "Aprovar o D2",
      request: { type: "gates/approve", gate: "d2", initiativeId },
      ...(open.length > 0 ? { disabledReason: `Falta fechar ${plural(open.length, "aprovação", "aprovações")}` } : {}),
    },
    needsText: false,
    evidence: initiative.planning_artifacts ?? [],
    chatPrompt: NOTE_PROMPT(`Quero decidir o Gate D2 da iniciativa ${initiativeId}. Revise comigo o roadmap e a matriz de risco.`),
  };
}

function gateD3(ctx: ViewContext, initiativeId: string): DecisionModel | null {
  const initiative = ctx.snapshot.initiatives?.initiatives.find((i) => i.id === initiativeId);
  if (!initiative) return null;
  const closure = closureOf(executionGateItems(initiative));
  const done = closure.closedCount - closure.cancelled.length;
  return {
    ref: { kind: "gate", gate: "d3", initiativeId },
    id: refKey({ kind: "gate", gate: "d3", initiativeId }),
    variant: "gate",
    eyebrow: "Gate D3 · Execução → Operação",
    question: `Aprovar o D3 de "${initiative.name}"?`,
    context: "O D3 confirma que a Execução terminou. Cada tarefa cancelada aparece abaixo, com o motivo, para você ver o que foi cortado.",
    facts: [
      { label: "O que está em jogo", value: `${plural(done, "tarefa feita", "tarefas feitas")} e ${plural(closure.cancelled.length, "cancelada", "canceladas")}` },
      { label: "O que a decisão libera", value: "A Operação" },
    ],
    checklist: [],
    closure,
    primary: {
      label: "Aprovar o D3",
      request: { type: "gates/approve", gate: "d3", initiativeId },
      ...(closure.open.length > 0 ? { disabledReason: `Falta fechar ${plural(closure.open.length, "tarefa", "tarefas")}` } : {}),
    },
    needsText: false,
    evidence: [],
    chatPrompt: NOTE_PROMPT(`Quero decidir o Gate D3 da iniciativa ${initiativeId}. Confira comigo as tarefas fechadas e as canceladas.`),
  };
}

/** Marcas que o painel já mostra e o estado gravado ainda não alcançou (otimista, até o snapshot novo chegar). */
export type MarkOverrides = Readonly<Record<string, boolean>>;

/** A fase de entrega em revisão: o checklist humano marcável e a aprovação que abre a próxima fase (só a iniciativa ativa). */
function phaseDecision(ctx: ViewContext, phaseId: string, overrides: MarkOverrides): DecisionModel | null {
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract) return null;
  const state = ctx.snapshot.deliveryState?.phases[phaseId];
  const marks = { ...(state?.human_checklist ?? {}), ...overrides };
  const toggle: ChecklistToggle | undefined = ctx.isActive ? { via: "host", type: "toggleGuardRail", phaseId } : undefined;
  const checklist: ChecklistItem[] = contract.guardRailChecklist.map((item) => ({
    id: item.id,
    label: item.label,
    ...(item.hint ? { hint: item.hint } : {}),
    required: item.mandatory,
    checked: marks[item.id] === true,
    ...(toggle ? { toggle } : {}),
  }));
  const missing = checklist.filter((c) => c.required && !c.checked).length;
  const disabledReason = !ctx.isActive
    ? "Torne esta iniciativa ativa para aprovar a fase"
    : missing > 0
      ? `Marque ${plural(missing, "item obrigatório", "itens obrigatórios")} para aprovar`
      : undefined;
  return {
    ref: { kind: "phase", phaseId },
    id: refKey({ kind: "phase", phaseId }),
    variant: "gate",
    eyebrow: `Fase · ${contract.agent}`,
    question: `Aprovar a fase "${contract.label}"?`,
    context: "O agente terminou a fase. Confirme o checklist: a aprovação é sua e abre a próxima fase.",
    facts: [
      { label: "O que está em jogo", value: contract.outputs[0]?.label ?? contract.label },
      { label: "O que a decisão libera", value: "A próxima fase do fluxo" },
    ],
    checklist,
    closure: null,
    primary: { label: "Aprovar fase e abrir a próxima", request: { type: "approveAndAdvancePhase", phaseId }, ...(disabledReason ? { disabledReason } : {}) },
    needsText: false,
    evidence: contract.outputs.map((o) => o.relPath).filter((p): p is string => !!p),
    chatPrompt: NOTE_PROMPT(`Quero revisar a fase ${contract.label} antes de aprovar.`),
  };
}

function approvalDecision(ctx: ViewContext, ref: Extract<DecisionRef, { kind: "approval" }>, overrides: MarkOverrides): DecisionModel | null {
  const initiative = ctx.snapshot.initiatives?.initiatives.find((i) => i.id === ref.initiativeId);
  const group = initiative?.epic_status?.[ref.wave] ?? initiative?.wave_status?.[ref.wave];
  const item = group?.items?.[ref.item];
  if (!initiative || !item) return null;
  const risky = ctx.snapshot.approvalFrictionFields.filter((f) => {
    const value = (item as unknown as Record<string, unknown>)[f];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  const acknowledged = overrides.friction === true;
  const checklist: ChecklistItem[] = risky.length > 0 ? [{ id: "friction", label: `Vi ${risky.join(" e ")} antes de aprovar`, required: true, checked: acknowledged, toggle: { via: "local" } }] : [];
  return {
    ref,
    id: refKey(ref),
    variant: "gate",
    eyebrow: `Tarefa · ${ref.wave}/${ref.item}`,
    question: `Aprovar "${item.summary ?? ref.item}"?`,
    context: "A tarefa está concluída e exige a sua aprovação antes de contar como fechada.",
    facts: [
      { label: "Entregue em", value: item.completed_at ?? null },
      { label: "Commit", value: item.commit ?? null },
      { label: "Pontos de atenção", value: risky.length > 0 ? risky.join(", ") : "nenhum" },
    ],
    checklist,
    closure: null,
    primary: { label: "Aprovar a tarefa", request: { type: "approveWaveItem", initiativeId: ref.initiativeId, wave: ref.wave, item: ref.item }, ...(risky.length > 0 && !acknowledged ? { disabledReason: "Marque que viu os pontos de atenção para aprovar" } : {}) },
    needsText: false,
    evidence: item.artifacts ?? [],
    chatPrompt: NOTE_PROMPT(`Quero revisar a tarefa ${ref.wave}/${ref.item} antes de aprovar.`),
  };
}

function sprintItemDecision(ctx: ViewContext, sprintItemId: string): DecisionModel | null {
  const item = ctx.snapshot.sprintBacklog?.sprints.flatMap((s) => s.items).find((i) => i.id === sprintItemId);
  if (!item) return null;
  return {
    ref: { kind: "sprint-item", sprintItemId },
    id: refKey({ kind: "sprint-item", sprintItemId }),
    variant: "gate",
    eyebrow: `Item de sprint · ${sprintItemId}`,
    question: `Aprovar "${item.title}"?`,
    context: "O item está em revisão. Aprovar o marca como feito na sprint.",
    facts: [{ label: "Componente", value: item.component ?? null }],
    checklist: [],
    closure: null,
    primary: { label: "Aprovar o item", request: { type: "approveSprintItem", sprintItemId }, ...(ctx.isActive ? {} : { disabledReason: "Torne esta iniciativa ativa para aprovar o item" }) },
    needsText: false,
    evidence: [],
    chatPrompt: NOTE_PROMPT(`Quero revisar o item de sprint ${sprintItemId} antes de aprovar.`),
  };
}

function foundationPhaseDecision(ctx: ViewContext, ref: Extract<DecisionRef, { kind: "foundation-phase" }>): DecisionModel | null {
  const contract = FOUNDATION_CONTRACTS.find((c) => c.phaseId === ref.phaseId);
  if (!contract) return null;
  const foundation = ctx.snapshot.foundationState;
  const phase = ref.repoId ? foundation?.repos[ref.repoId]?.phases[ref.phaseId] : foundation?.phases[ref.phaseId];
  const toggle: ChecklistToggle | undefined = ref.repoId ? undefined : { via: "host", type: "toggleFoundationGuardRail", phaseId: ref.phaseId };
  return {
    ref,
    id: refKey(ref),
    variant: "decision",
    eyebrow: `Descoberta · ${ref.repoId ?? "Workspace"}`,
    question: `Confirmar "${contract.label}"${ref.repoId ? ` de ${ref.repoId}` : ""}?`,
    context: `${contract.agent} terminou a fase. A fase só conta como concluída quando você confirma o checklist com o agente.`,
    facts: [],
    checklist: contract.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      ...(item.hint ? { hint: item.hint } : {}),
      required: item.mandatory,
      checked: phase?.human_checklist[item.id] === true,
      ...(toggle ? { toggle } : {}),
    })),
    closure: null,
    primary: null,
    needsText: false,
    chatOnly: "A confirmação da fase é feita no chat com o agente; ele grava a fase como concluída.",
    evidence: [],
    chatPrompt: NOTE_PROMPT(`Vamos confirmar a fase ${contract.label}${ref.repoId ? ` do repositório ${ref.repoId}` : ""}.`),
  };
}

/** A chave que apaga a guarda do mapa para uma decisão: a mesma do `deriveColmeia` (tarefa, `metadata.task` ou `run_id`). */
export function decisionKeyOf(e: RunEvent): string {
  return e.task_id ?? (typeof e.metadata?.task === "string" ? e.metadata.task : undefined) ?? e.run_id;
}

/** O pedido de decisão ainda aberto para `key`, ou `undefined` se já foi tomada. */
export function openDecisionRequest(events: RunEvent[], key: string): RunEvent | undefined {
  let request: RunEvent | undefined;
  for (const e of events) {
    if (decisionKeyOf(e) !== key) continue;
    if (e.event_type === "decision-requested") request = e;
    if (e.event_type === "decision-made") request = undefined;
  }
  return request;
}

function requestedDecision(ctx: ViewContext, key: string): DecisionModel | null {
  const request = openDecisionRequest(ctx.events, key);
  if (!request) return null;
  const topic = request.message?.trim() || "Decisão pedida por um agente";
  const reason = typeof request.metadata?.reason === "string" ? request.metadata.reason : undefined;
  // Só uma decisão com tarefa (ou `metadata.task`) pode ser registrada daqui: é a chave que apaga a guarda.
  const taskId = request.task_id ?? (typeof request.metadata?.task === "string" ? request.metadata.task : undefined);
  const agent = request.agent_id ? (request.agent_id.startsWith("@") ? request.agent_id : `@${request.agent_id}`) : null;
  return {
    ref: { kind: "decision", key },
    id: refKey({ kind: "decision", key }),
    variant: "decision",
    eyebrow: `Decisão${taskId ? ` · ${taskId}` : ""}`,
    question: topic.charAt(0).toUpperCase() + topic.slice(1),
    context: reason && reason !== topic ? reason : "Um agente pediu uma decisão humana e espera a sua resposta.",
    facts: [
      { label: "Pedida por", value: agent },
      { label: "Pedida em", value: request.timestamp },
      { label: "Ligada à tarefa", value: taskId ?? null },
    ],
    checklist: [],
    closure: null,
    primary: taskId
      ? { label: "Registrar a decisão", request: { type: "decisions/record", ...(request.initiative_id ? { initiativeId: request.initiative_id } : {}), taskId, ...(request.phase_id ? { phaseId: request.phase_id } : {}) } }
      : null,
    needsText: !!taskId,
    ...(taskId ? {} : { chatOnly: "Esta decisão não está ligada a uma tarefa, então ela se resolve no chat com o agente." }),
    evidence: request.artifact_path ? [request.artifact_path] : [],
    chatPrompt: NOTE_PROMPT(`Quero responder a decisão pedida: ${topic}.`),
  };
}

/**
 * O painel de decisão para `ref`, ou `null` se o pedido deixou de existir (o
 * estado mudou). `overrides` são as marcas do checklist que a tela já mostra
 * e o snapshot ainda não trouxe: o botão de aprovar as considera.
 */
export function deriveDecision(ctx: ViewContext, ref: DecisionRef, overrides: MarkOverrides = {}): DecisionModel | null {
  switch (ref.kind) {
    case "gate":
      if (ref.gate === "d1") return d1RepoIds(ctx).includes(ref.repoId) || ctx.snapshot.foundationState?.repos[ref.repoId] ? gateD1(ctx, ref.repoId) : null;
      return ref.gate === "d2" ? gateD2(ctx, ref.initiativeId) : gateD3(ctx, ref.initiativeId);
    case "phase":
      return phaseDecision(ctx, ref.phaseId, overrides);
    case "approval":
      return approvalDecision(ctx, ref, overrides);
    case "sprint-item":
      return sprintItemDecision(ctx, ref.sprintItemId);
    case "foundation-phase":
      return foundationPhaseDecision(ctx, ref);
    case "decision":
      return requestedDecision(ctx, ref.key);
  }
}
