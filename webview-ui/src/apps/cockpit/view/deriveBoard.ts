/**
 * deriveBoard.ts — o quadro da parada selecionada (DS v2 §4.5): as 4 colunas
 * Fila ○ · Trabalhando ● · Espera você ■ · Feito ✓ e os cartões. Puro, sobre o
 * `ViewContext`.
 *
 * Status de trabalho (ADR-0022 §7), sem coluna nova:
 * - `blocked` e `failed` são CONDIÇÃO do cartão, que fica onde está (na Fila),
 *   com o motivo em texto;
 * - `cancelled` (e o `descoped` do sprint-backlog) vai para o Feito, riscado,
 *   com o motivo;
 * - texto fora do vocabulário não é rebaixado: o cartão diz "status
 *   desconhecido: <texto>".
 * Item concluído que exige aprovação humana vai para "Espera você".
 */
import {
  WORK_STATUSES,
  parseWaveContent,
  parseWaveLabel,
  readWorkStatus,
  type PlanItem,
  type PlanItemStatus,
  type RepoFoundationState,
  type RunEvent,
  type SprintItem,
  type WaveItemStatusEntry,
  type WaveStatusEntry,
} from "@data";
import { STATUS_COLUMN_ORDER, type ColumnStatus } from "../../../design-system/patterns";
import { resolveGroupVocabulary } from "../../../features/delivery/computeModernizationBoard";
import { greenfieldBoardCards } from "../../../features/delivery/computeGreenfieldBoard";
import { epicDescription, shortTitle, type TrackModel } from "./deriveTrack";
import type { DecisionRef } from "./decisionRef";
import type { ViewContext } from "./viewTarget";

export interface TaskCondition {
  kind: "blocked" | "failed" | "cancelled";
  reason: string;
}

export interface TaskModel {
  /** `epic-0/task-1`, `api/arch`, `S1-BKD-01`. */
  key: string;
  /** O que o cartão mostra no lugar do id (a parte depois da `/`). */
  id: string;
  title: string;
  column: ColumnStatus;
  condition?: TaskCondition;
  meta?: string;
  /** A decisão que o cartão da coluna "Espera você" abre. */
  decision?: DecisionRef;
  details: { commit?: string; artifacts: string[]; knownBugs: string[]; completedAt?: string };
}

export interface BoardColumn {
  status: ColumnStatus;
  tasks: TaskModel[];
  blockedCount: number;
}

export interface BoardModel {
  stopKey: string | null;
  title: string;
  description?: string;
  columns: BoardColumn[];
  total: number;
  /** Quadro sem nenhum cartão: o que mostrar no lugar das colunas (EmptyState inline). */
  empty?: { title: string; body: string };
  /** Muda a cada evento de agente da iniciativa: o ● de "Trabalhando" respira numa rajada. */
  activityKey?: string;
}

const NO_REASON = "sem motivo registrado";

/** O que a tela afirma tem fonte (DS v2, princípio 4): a tarefa tem evidência para abrir (commit, data, artefatos, pontos de atenção)? */
export function hasTaskDetails(task: TaskModel): boolean {
  const d = task.details;
  return !!d.commit || !!d.completedAt || d.artifacts.length > 0 || d.knownBugs.length > 0;
}

function emptyDetails(): TaskModel["details"] {
  return { artifacts: [], knownBugs: [] };
}

function agentOf(events: RunEvent[], taskKey: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.task_id === taskKey && e.agent_id) return e.agent_id.startsWith("@") ? e.agent_id : `@${e.agent_id}`;
  }
  return undefined;
}

/** Item de onda ou épico → cartão: a coluna, a condição e, quando for o caso, a decisão que ele pede. */
export function waveTask(initiativeId: string, wave: string, itemKey: string, item: WaveItemStatusEntry, events: RunEvent[]): TaskModel {
  const key = `${wave}/${itemKey}`;
  const read = readWorkStatus(item.status, WORK_STATUSES, "pending");
  const reason = item.reason?.trim() || undefined;
  const details: TaskModel["details"] = {
    artifacts: item.artifacts ?? [],
    knownBugs: item.known_bugs_pinned ?? [],
    ...(item.commit ? { commit: item.commit } : {}),
    ...(item.completed_at ? { completedAt: item.completed_at } : {}),
  };
  const base = { key, id: itemKey, title: item.summary ?? itemKey, details };
  const meta = agentOf(events, key) ?? item.repo;
  const withMeta = (extra: Partial<TaskModel>): TaskModel => ({ ...base, column: "queue", ...(meta ? { meta } : {}), ...extra });

  switch (read.status) {
    case "in-progress":
      return withMeta({ column: "working" });
    case "blocked":
      return withMeta({ condition: { kind: "blocked", reason: reason ?? NO_REASON } });
    case "failed":
      return withMeta({ condition: { kind: "failed", reason: reason ?? NO_REASON } });
    case "cancelled":
      return withMeta({ column: "done", condition: { kind: "cancelled", reason: reason ?? NO_REASON } });
    case "done":
    case "skipped":
      if (read.status === "done" && item.requires_approval === true && !item.human_approved_at) {
        return withMeta({ column: "you", decision: { kind: "approval", initiativeId, wave, item: itemKey } });
      }
      return withMeta({ column: "done" });
    case "unknown":
      return withMeta({ meta: `status desconhecido: ${read.text ?? item.status}` });
    default:
      // pending. Legado: `merge_block` num item ainda não feito é um bloqueio com o motivo no próprio campo.
      return item.merge_block ? withMeta({ condition: { kind: "blocked", reason: item.merge_block } }) : withMeta({});
  }
}

/** Os cartões de UM épico (ou onda): os itens relatados, mais os prometidos no rótulo que ainda não saíram. */
function epicTasks(ctx: ViewContext, stopKey: string, rawLabel: string, entry: WaveStatusEntry | undefined): TaskModel[] {
  const initiativeId = ctx.initiative!.id;
  const items = entry?.items;
  const catalog = parseWaveContent(parseWaveLabel(rawLabel).label.split(" — ")[0]!.trim()).items;

  const planned = (id: string, i: number): TaskModel => ({
    key: `${stopKey}/${id}`,
    id: String(i + 1),
    title: id,
    column: "queue",
    details: emptyDetails(),
  });

  if (items && Object.keys(items).length > 0) {
    const reported = (id: string): TaskModel => waveTask(initiativeId, stopKey, id, items[id]!, ctx.events);
    if (catalog.length === 0) return Object.keys(items).map(reported);
    const matched = new Set<string>();
    const tasks = catalog.map((id, i) => {
      if (items[id]) {
        matched.add(id);
        return reported(id);
      }
      return planned(id, i);
    });
    for (const id of Object.keys(items)) if (!matched.has(id)) tasks.push(reported(id));
    return tasks;
  }

  if (entry) {
    // Onda "plana": só o status no nível dela. Um cartão a representa (não há item para aprovar).
    const synthetic: WaveItemStatusEntry = { status: entry.status, ...(entry.note ? { summary: entry.note } : {}) };
    const task = waveTask(initiativeId, stopKey, stopKey, synthetic, ctx.events);
    return [{ ...task, title: shortTitle(parseWaveLabel(rawLabel).label), ...(entry.note ? { meta: entry.note } : {}) }];
  }

  return catalog.map(planned);
}

const PLAN_TO_COLUMN: Record<PlanItemStatus, ColumnStatus> = { pending: "queue", running: "working", review: "you", done: "done", blocked: "queue" };

function planTask(item: PlanItem, ref: DecisionRef | undefined, extra: { id: string; meta?: string }): TaskModel {
  const column = PLAN_TO_COLUMN[item.status];
  return {
    key: item.key,
    id: extra.id,
    title: item.label,
    column,
    ...(item.status === "blocked" ? { condition: { kind: "blocked" as const, reason: item.blockedBy ?? NO_REASON } } : {}),
    ...(extra.meta ? { meta: extra.meta } : item.agent ? { meta: item.agent } : {}),
    ...(column === "you" && ref ? { decision: ref } : {}),
    details: emptyDetails(),
  };
}

function findingsText(state: RepoFoundationState | undefined): string | undefined {
  const f = state?.findings_summary;
  if (!f) return undefined;
  const parts = [
    f.critical > 0 ? `${f.critical} críticos` : "",
    f.high > 0 ? `${f.high} altos` : "",
    f.medium > 0 ? `${f.medium} médios` : "",
    f.low > 0 ? `${f.low} baixos` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** As fases do Foundation de um repositório (ou do grupo cross-repo) como cartões. */
function repoTasks(ctx: ViewContext, repoId: string | null): TaskModel[] {
  const plan = ctx.snapshot.foundationPlan;
  const repoState = repoId ? ctx.snapshot.foundationState?.repos[repoId] : undefined;
  return (plan?.items ?? [])
    .filter((i) => i.kind === "phase" && (i.repoId ?? null) === repoId)
    .map((item) => {
      const phaseId = item.key.split("/").pop() ?? item.key;
      const severity = phaseId === "quality" || phaseId === "debt" ? findingsText(repoState) : undefined;
      const ref: DecisionRef = { kind: "foundation-phase", phaseId, ...(repoId ? { repoId } : {}) };
      return planTask(item, ref, { id: phaseId, ...(severity ? { meta: severity } : {}) });
    });
}

/** Os cartões de uma fase de entrega (as saídas dela) — só da iniciativa ativa, que é a que tem o plano. */
function phaseTasks(ctx: ViewContext, phaseKey: string): TaskModel[] {
  const plan = ctx.snapshot.deliveryPlan;
  const item = plan?.items.find((i) => i.key === phaseKey);
  if (!plan || !item) return [];
  const ref: DecisionRef = { kind: "phase", phaseId: phaseKey };
  return greenfieldBoardCards(phaseKey, plan, ctx.snapshot.deliveryState).map((card) =>
    planTask({ ...item, key: `${phaseKey}/${card.key}`, label: card.title, status: card.status ?? item.status }, ref, { id: card.id })
  );
}

function sprintTasks(ctx: ViewContext, sprintId: string): TaskModel[] {
  const sprint = ctx.snapshot.sprintBacklog?.sprints.find((s) => s.id === sprintId);
  return (sprint?.items ?? []).map((it: SprintItem): TaskModel => {
    const base = { key: it.id, id: it.id, title: it.title, details: emptyDetails(), ...(it.component ? { meta: it.component } : {}) };
    switch (it.status) {
      case "in-progress":
        return { ...base, column: "working" };
      case "review":
        return { ...base, column: "you", decision: { kind: "sprint-item", sprintItemId: it.id } };
      case "blocked":
        return { ...base, column: "queue", condition: { kind: "blocked", reason: it.blockedReason ?? NO_REASON } };
      case "done":
        return { ...base, column: "done" };
      case "descoped":
        return { ...base, column: "done", condition: { kind: "cancelled", reason: "fora do escopo da sprint" } };
      default:
        return { ...base, column: "queue" };
    }
  });
}

function activityKeyOf(events: RunEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const t = events[i]!.event_type;
    if (t === "agent-started" || t === "agent-progress" || t === "agent-done" || t === "artifact-written") return events[i]!.timestamp;
  }
  return undefined;
}

function group(tasks: TaskModel[]): BoardColumn[] {
  return STATUS_COLUMN_ORDER.map((status) => {
    const inColumn = tasks.filter((t) => t.column === status);
    return { status, tasks: inColumn, blockedCount: inColumn.filter((t) => t.condition && t.condition.kind !== "cancelled").length };
  });
}

/** O quadro da parada selecionada da trilha. */
export function deriveBoard(ctx: ViewContext, track: TrackModel): BoardModel {
  const key = track.selectedStopKey;
  const activityKey = activityKeyOf(ctx.events);
  const build = (title: string, tasks: TaskModel[], empty: { title: string; body: string }, description?: string): BoardModel => ({
    stopKey: key,
    title,
    ...(description ? { description } : {}),
    columns: group(tasks),
    total: tasks.length,
    ...(tasks.length === 0 ? { empty } : {}),
    ...(activityKey ? { activityKey } : {}),
  });

  if (!key) {
    return { stopKey: null, title: "", columns: group([]), total: 0, empty: { title: "Nada para mostrar ainda", body: track.stopsEmpty ?? "O quadro aparece quando houver o que acompanhar." } };
  }

  // Descoberta: um repositório por parada.
  if (key.startsWith("repo:")) {
    const repoId = key.slice("repo:".length);
    const tasks = repoTasks(ctx, repoId === "workspace" ? null : repoId);
    return build(`Repositório · ${repoId === "workspace" ? "Workspace" : repoId}`, tasks, {
      title: "Ainda sem fases mapeadas",
      body: "As fases da Descoberta aparecem quando o repositório entra no plano.",
    });
  }

  const initiative = ctx.initiative;
  if (!initiative) return { stopKey: key, title: "", columns: group([]), total: 0 };

  // Entrega: fases do Upstream e sprints do Downstream (só a iniciativa ativa carrega esse detalhe).
  if (track.kind === "greenfield") {
    const stop = track.stops.find((s) => s.key === key);
    const isSprint = stop?.unit === "Sprint";
    const tasks = isSprint ? sprintTasks(ctx, key) : phaseTasks(ctx, key);
    return build(stop ? `${stop.unit} ${stop.n} · ${stop.label}` : key, tasks, {
      title: "Ainda sem tarefas abertas",
      body: ctx.detailLoaded ? "Esta etapa ainda não tem o que mostrar." : "O detalhe das fases só carrega para a iniciativa ativa.",
    });
  }

  // Modernização e hotfix: o épico ou a onda guarda as tarefas no registro.
  const vocab = resolveGroupVocabulary(initiative);
  const index = vocab.labels.findIndex((raw, i) => `${vocab.prefix}-${parseWaveLabel(raw).index ?? i}` === key);
  const raw = vocab.labels[index];
  if (raw === undefined) return { stopKey: key, title: "", columns: group([]), total: 0 };
  const parsed = parseWaveLabel(raw);
  const stop = track.stops.find((s) => s.key === key);
  const tasks = epicTasks(ctx, key, raw, vocab.statusMap?.[key]);
  const n = parsed.index ?? index;
  const previous = index > 0 ? shortTitle(parseWaveLabel(vocab.labels[index - 1]!).label) : undefined;
  const waiting = stop?.status === "future" && previous;
  return build(
    `${vocab.groupLabel} ${n} · ${shortTitle(parsed.label)}`,
    tasks,
    {
      title: "Ainda sem tarefas abertas",
      body: waiting ? `Começa quando "${previous}" fechar.` : `Este ${vocab.groupLabel.toLowerCase()} ainda não tem tarefas registradas. Elas aparecem quando a Execução começa nele.`,
    },
    epicDescription(parsed.label)
  );
}
