/**
 * deriveTrack.ts — a trilha de fase (DS v2 §4.2) da iniciativa vista: os
 * segmentos (streams, ondas do hotfix ou fases de entrega), as pontes de gate
 * entre eles e as paradas (épicos, repositórios, fases ou sprints) do segmento
 * atual. Função pura sobre o `ViewContext`: o componente só desenha.
 *
 * Os segmentos e o "onde a missão está" vêm do `deriveColmeia` do núcleo (o
 * mesmo que o Mapa usa); o estado das pontes vem de `flows.ts`, com a regra de
 * fechamento de gate. Nada de progresso é inventado: o do épico é tarefa
 * fechada sobre o total que o estado conhece.
 */
import {
  deriveColmeia,
  groupPlanByRepo,
  isClosedStatus,
  parseWaveContent,
  parseWaveLabel,
  type ColmeiaVM,
  type DeliveryPlan,
  type Initiative,
  type PlanItem,
  type PlanItemStatus,
  type SprintGroup,
  type WaveItemStatusEntry,
  type WaveStatusEntry,
} from "@data";
import type { EpicStopStatus } from "../../../design-system/patterns";
import { resolveGroupVocabulary } from "../../../features/delivery/computeModernizationBoard";
import { sprintAggregateStatus } from "../../../features/delivery/computeGreenfieldBoard";
import { DISCOVERY_FLOW, bridgeModel, d1Rows, flowFor, type BridgeModel } from "./flows";
import type { ViewContext } from "./viewTarget";

export type SegmentStatus = "done" | "current" | "future";

export interface TrackSegmentModel {
  id: string;
  label: string;
  status: SegmentStatus;
  /** "Concluído", "Você está aqui · Epic 0" ou "Depois". */
  eyebrow: string;
}

export type StopUnit = "Epic" | "Onda" | "Repositório" | "Fase" | "Sprint";

export interface StopModel {
  key: string;
  /** Número da parada (a posição que o rótulo mostra). */
  n: number;
  label: string;
  status: EpicStopStatus;
  /** 0–100, derivado de tarefas fechadas sobre o total; `null` quando o estado não permite contar. */
  progress: number | null;
  /** "18% · em andamento". */
  tag: string;
  here: boolean;
  unit: StopUnit;
}

export interface TrackModel {
  kind: "streams" | "greenfield" | "waves" | "discovery" | "empty";
  segments: TrackSegmentModel[];
  /** `bridges[i]` fica entre `segments[i]` e `segments[i + 1]`; vazio no hotfix. */
  bridges: BridgeModel[];
  stops: StopModel[];
  unit: StopUnit;
  /** Nome da lista de paradas ("Épicos da Execução"). */
  stopsLabel: string;
  /** Por que não há paradas, e quando passa a haver. */
  stopsEmpty?: string;
  currentSegmentId: string | null;
  /** A parada mostrada no quadro: a escolhida, se ainda existe; senão onde a missão está. */
  selectedStopKey: string | null;
}

const STOP_STATUS_TEXT: Record<EpicStopStatus, string> = {
  done: "concluído",
  working: "em andamento",
  you: "espera você",
  blocked: "bloqueado",
  queue: "na fila",
  future: "começa depois",
};

function tagOf(status: EpicStopStatus, progress: number | null): string {
  return progress === null ? STOP_STATUS_TEXT[status] : `${progress}% · ${STOP_STATUS_TEXT[status]}`;
}

/** "Fundação — provisionar o repositório (…)" → "Fundação": o rótulo curto da parada. */
export function shortTitle(label: string): string {
  return parseWaveContent(label.split(" — ")[0]!.trim()).title;
}

/** O que vem depois do " — " do rótulo do épico: a descrição do quadro. */
export function epicDescription(label: string): string | undefined {
  const rest = label.split(" — ").slice(1).join(" — ").trim();
  return rest || undefined;
}

function waveClosed(entry: WaveStatusEntry | undefined): boolean {
  if (!entry) return false;
  const items = Object.values(entry.items ?? {});
  return items.length > 0 ? items.every((i) => isClosedStatus(i.status)) : isClosedStatus(entry.status);
}

/** Tarefa concluída que ainda espera a aprovação humana que ela mesma exige. */
function needsApproval(item: WaveItemStatusEntry): boolean {
  return item.status === "done" && item.requires_approval === true && !item.human_approved_at;
}

/** O épico está assentado quando fechou e nenhuma tarefa dele espera aprovação: só então a missão segue adiante. */
function epicSettled(entry: WaveStatusEntry | undefined): boolean {
  return waveClosed(entry) && !Object.values(entry?.items ?? {}).some(needsApproval);
}

/** Progresso do épico: tarefas fechadas sobre o total que o estado conhece (as relatadas mais as prometidas no rótulo). */
export function epicProgress(entry: WaveStatusEntry | undefined, rawLabel: string): number | null {
  const reported = Object.entries(entry?.items ?? {});
  const planned = parseWaveContent(parseWaveLabel(rawLabel).label).items.filter((p) => !(entry?.items && p in entry.items));
  const total = reported.length + planned.length;
  if (total === 0) return entry && isClosedStatus(entry.status) ? 100 : null;
  const done = reported.filter(([, i]) => isClosedStatus(i.status)).length;
  return Math.round((done / total) * 100);
}

function epicStatus(entry: WaveStatusEntry | undefined, here: boolean): EpicStopStatus {
  const items = Object.values(entry?.items ?? {});
  if (items.some(needsApproval)) return "you";
  if (waveClosed(entry)) return "done";
  if (items.some((i) => i.status === "blocked" || i.status === "failed")) return "blocked";
  if (entry && (entry.status === "in-progress" || items.some((i) => i.status === "in-progress"))) return "working";
  if (entry) return "queue";
  return here ? "queue" : "future";
}

/** As paradas de épico (ou onda) da iniciativa, na ordem do roadmap. */
export function epicStops(initiative: Initiative): StopModel[] {
  const vocab = resolveGroupVocabulary(initiative);
  const firstOpen = vocab.labels.findIndex((raw, i) => !epicSettled(vocab.statusMap?.[`${vocab.prefix}-${parseWaveLabel(raw).index ?? i}`]));
  return vocab.labels.map((raw, i) => {
    const parsed = parseWaveLabel(raw);
    const n = parsed.index ?? i;
    const key = `${vocab.prefix}-${n}`;
    const entry = vocab.statusMap?.[key];
    const here = i === firstOpen;
    const status = epicStatus(entry, here);
    const progress = epicProgress(entry, raw);
    return { key, n, label: shortTitle(parsed.label), status, progress, tag: tagOf(status, progress), here, unit: vocab.prefix === "epic" ? "Epic" : "Onda" };
  });
}

const PLAN_TO_STOP: Record<PlanItemStatus, EpicStopStatus> = { pending: "queue", running: "working", review: "you", done: "done", blocked: "blocked" };

function repoStopStatus(items: PlanItem[], approved: boolean): EpicStopStatus {
  if (approved) return "done";
  if (items.some((i) => i.status === "blocked")) return "blocked";
  if (items.some((i) => i.status === "review")) return "you";
  if (items.some((i) => i.status === "running")) return "working";
  return items.length > 0 && items.every((i) => i.status === "done") ? "you" : "queue";
}

/** As paradas da Descoberta: um repositório cada, mais o grupo cross-repo, com o progresso das fases dele. */
export function repoStops(ctx: ViewContext): StopModel[] {
  const plan = ctx.snapshot.foundationPlan;
  const groups = plan ? groupPlanByRepo(plan) : new Map<string, PlanItem[]>();
  const rows = d1Rows(ctx);
  const ids = [...new Set([...rows.map((r) => r.repoId), ...[...groups.keys()].filter((k) => k !== "workspace")])];
  const firstOpen = ids.findIndex((id) => !rows.find((r) => r.repoId === id)?.approved);
  const stop = (id: string, label: string, n: number, here: boolean, approved: boolean): StopModel => {
    const phases = (groups.get(id) ?? []).filter((p) => p.kind === "phase");
    const status = repoStopStatus(phases, approved);
    const progress = approved ? 100 : phases.length > 0 ? Math.round((phases.filter((p) => p.status === "done").length / phases.length) * 100) : null;
    return { key: `repo:${id}`, n, label, status, progress, tag: tagOf(status, progress), here, unit: "Repositório" };
  };
  const stops = ids.map((id, i) => stop(id, id, i + 1, i === firstOpen, rows.find((r) => r.repoId === id)?.approved === true));
  // As fases que rodam uma vez para o workspace inteiro (domínio, ligação de skills) formam a última parada.
  if ((groups.get("workspace") ?? []).some((p) => p.kind === "phase")) stops.push(stop("workspace", "Workspace", ids.length + 1, false, false));
  return stops;
}

function phaseStops(plan: DeliveryPlan | null, stream: "upstream"): StopModel[] {
  const phases = (plan?.items ?? []).filter((i) => i.kind === "phase" && i.stream === stream);
  const firstOpen = phases.findIndex((p) => p.status !== "done");
  return phases.map((p, i) => {
    const status = PLAN_TO_STOP[p.status];
    const progress = p.status === "done" ? 100 : null;
    return { key: p.key, n: i + 1, label: p.label, status, progress, tag: tagOf(status, progress), here: i === firstOpen, unit: "Fase" };
  });
}

function sprintStops(sprints: SprintGroup[]): StopModel[] {
  const firstOpen = sprints.findIndex((s) => sprintAggregateStatus(s) !== "done");
  return sprints.map((s, i) => {
    const items = s.items.filter((it) => it.status !== "descoped");
    const status = PLAN_TO_STOP[sprintAggregateStatus(s)];
    const progress = items.length > 0 ? Math.round((items.filter((it) => it.status === "done").length / items.length) * 100) : null;
    return { key: s.id, n: i + 1, label: s.name, status, progress, tag: tagOf(status, progress), here: i === firstOpen, unit: "Sprint" };
  });
}

interface Selectable {
  key: string;
  here: boolean;
  done: boolean;
}

/** A parada mostrada no quadro: a escolhida, se ainda existe; senão onde a missão está; senão a primeira não concluída. */
function pickSelection(options: Selectable[], wanted: string | null): string | null {
  if (wanted && options.some((s) => s.key === wanted)) return wanted;
  return (options.find((s) => s.here) ?? options.find((s) => !s.done) ?? options[0])?.key ?? null;
}

const selectable = (stops: StopModel[]): Selectable[] => stops.map((s) => ({ key: s.key, here: s.here, done: s.status === "done" }));

function segmentsOf(colmeia: ColmeiaVM): TrackSegmentModel[] {
  return colmeia.islands.map((island) => {
    const status: SegmentStatus = island.state === "done" ? "done" : island.state === "current" ? "current" : "future";
    const focus = island.focus?.split(" · ")[0];
    const eyebrow = status === "done" ? "Concluído" : status === "current" ? `Você está aqui${focus ? ` · ${focus}` : ""}` : "Depois";
    return { id: island.id, label: island.label, status, eyebrow };
  });
}

const EMPTY: TrackModel = { kind: "empty", segments: [], bridges: [], stops: [], unit: "Epic", stopsLabel: "", currentSegmentId: null, selectedStopKey: null };

/** A trilha da Descoberta do workspace: os 4 streams, com a Descoberta como o ponto atual. */
function discoveryTrack(ctx: ViewContext, selectedKey: string | null): TrackModel {
  const stops = repoStops(ctx);
  const segments: TrackSegmentModel[] = DISCOVERY_FLOW.islands.map((island, i) => ({
    id: island.id,
    label: island.label,
    status: i === 0 ? "current" : "future",
    eyebrow: i === 0 ? "Você está aqui · Descoberta" : "Depois",
  }));
  const bridges = DISCOVERY_FLOW.bridges.map((b) => bridgeModel(b.gate, ctx));
  return {
    kind: "discovery",
    segments,
    bridges,
    stops,
    unit: "Repositório",
    stopsLabel: "Repositórios da Descoberta",
    ...(stops.length === 0 ? { stopsEmpty: "Os repositórios aparecem quando a Descoberta mapear o projeto." } : {}),
    currentSegmentId: "discovery",
    selectedStopKey: pickSelection(selectable(stops), selectedKey),
  };
}

export function deriveTrack(ctx: ViewContext, selectedKey: string | null): TrackModel {
  if (ctx.target.kind === "discovery") return discoveryTrack(ctx, selectedKey);
  const initiative = ctx.initiative;
  if (!initiative) return EMPTY;

  const flow = flowFor(initiative);
  const colmeia = deriveColmeia(ctx.projected, ctx.events, flow);
  if (colmeia.empty) return EMPTY;
  const segments = segmentsOf(colmeia);
  const current = segments.find((s) => s.status === "current")?.id ?? null;

  if (colmeia.flow === "waves") {
    // No hotfix os segmentos SÃO as ondas: cada um abre o quadro dela.
    const vocab = resolveGroupVocabulary(initiative);
    return {
      kind: "waves",
      segments,
      bridges: [],
      stops: [],
      unit: vocab.prefix === "epic" ? "Epic" : "Onda",
      stopsLabel: "",
      currentSegmentId: current,
      selectedStopKey: pickSelection(segments.map((s) => ({ key: s.id, here: s.status === "current", done: s.status === "done" })), selectedKey),
    };
  }

  const bridges = colmeia.bridges.map((b) => bridgeModel(b.gate, ctx));
  const base = { kind: colmeia.flow === "greenfield" ? ("greenfield" as const) : ("streams" as const), segments, bridges, currentSegmentId: current };

  let stops: StopModel[] = [];
  let unit: StopUnit = "Epic";
  let stopsLabel = "";
  let stopsEmpty: string | undefined;
  switch (current) {
    case "discovery":
      stops = repoStops(ctx);
      unit = "Repositório";
      stopsLabel = "Repositórios da Descoberta";
      stopsEmpty = "Os repositórios aparecem quando a Descoberta mapear o projeto.";
      break;
    case "planning":
      stopsLabel = "Épicos do Planejamento";
      stopsEmpty = "Os épicos aparecem quando o Planejamento terminar.";
      break;
    case "execution":
      stops = epicStops(initiative);
      unit = stops[0]?.unit ?? "Epic";
      stopsLabel = `${unit === "Epic" ? "Épicos" : "Ondas"} da Execução`;
      stopsEmpty = "Esta iniciativa ainda não tem épicos. Eles entram quando o Planejamento os define.";
      break;
    case "upstream":
      stops = phaseStops(ctx.isActive ? ctx.snapshot.deliveryPlan : null, "upstream");
      unit = "Fase";
      stopsLabel = "Fases do Upstream";
      stopsEmpty = ctx.detailLoaded ? "As fases aparecem quando a iniciativa começa." : "O detalhe das fases só carrega para a iniciativa ativa.";
      break;
    case "downstream":
      stops = sprintStops(ctx.isActive ? (ctx.snapshot.sprintBacklog?.sprints ?? []) : []);
      unit = "Sprint";
      stopsLabel = "Sprints do Downstream";
      stopsEmpty = ctx.detailLoaded ? "As sprints aparecem quando o sprint-plan terminar." : "O detalhe das sprints só carrega para a iniciativa ativa.";
      break;
    default:
      stopsEmpty = "A Operação é contínua e fica no painel de Operações.";
  }
  // O "você está aqui" do segmento segue as paradas (uma tarefa que espera aprovação mantém a missão no épico dela).
  const here = stops.find((s) => s.here);
  const segs = current === "execution" && here ? segments.map((s) => (s.id === "execution" ? { ...s, eyebrow: `Você está aqui · ${here.unit} ${here.n}` } : s)) : segments;
  return { ...base, segments: segs, stops, unit, stopsLabel, ...(stops.length === 0 && stopsEmpty ? { stopsEmpty } : {}), selectedStopKey: pickSelection(selectable(stops), selectedKey) };
}
