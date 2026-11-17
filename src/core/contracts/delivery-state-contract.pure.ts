/**
 * delivery-state-contract.pure.ts
 *
 * A metade pura de `delivery-state-contract.ts` — zero `fs`/`path`, segura
 * para o bundle do webview. Tipos, parsing e helpers de merge/síntese vivem
 * aqui; `loadDeliveryState` (que toca disco) fica no arquivo irmão.
 *
 * `delivery-state.yaml` é escrito 100% por convenção de prompt (nenhum
 * schema-writer existe) — arquivos reais deste repo já foram observados com:
 * chave de topo duplicada (`stream:` aparece duas vezes; ver a fixture
 * `delivery-state-chave-duplicada.yaml`), fases chaveadas pelo NOME do
 * agente em vez do `phaseId` canônico (`domain-modeler` em vez de `domain`),
 * e `status: "planned"` (fora do enum documentado). O parser aqui nunca
 * lança exceção — na pior hipótese devolve `null`.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";
import { canonicalDeliveryPhaseId, deliveryPhaseIds, deliveryPhaseKeyAliases } from "../methodology/phase-catalog.pure";
import { parsePhaseMapWith } from "./phase-map.shared.pure";
import { readWorkStatus, WORK_STATUSES, type ReadWorkStatus } from "./work-status.pure";

/** Path canônico do delivery-state.yaml global (workspace inteiro, sem iniciativa). */
export const DELIVERY_STATE_GLOBAL_PATH = [".github", "artifacts", "delivery-state.yaml"] as const;
export const DELIVERY_STATE_GLOBAL_REL = DELIVERY_STATE_GLOBAL_PATH.join("/");

/** Path do delivery-state.yaml de UMA iniciativa. */
export function initiativeDeliveryStatePath(initiativeId: string): string[] {
  return [".github", "artifacts", "initiatives", initiativeId, "delivery-state.yaml"];
}

/**
 * Status de uma fase de delivery: o vocabulário de trabalho da ADR-0022
 * (`pending`, `in-progress`, `blocked`, `failed`, `done`, `skipped`,
 * `cancelled`) e, só na LEITURA, `unknown` para texto fora dele (com o
 * original em `status_text`). A escrita aceita só o vocabulário.
 */
export type DeliveryPhaseStatus = ReadWorkStatus;

/** Vocabulário aceito na escrita (CLI, State Service e MCP). Fora dele é erro de uso; `blocked`, `failed` e `cancelled` exigem `reason` (ADR-0022). */
export const DELIVERY_PHASE_STATUSES = WORK_STATUSES;

export interface DeliveryArtifactRef {
  path: string;
  exists?: boolean;
  note?: string;
  /**
   * Wave-3 (`mod-cockpit-flow-model`, item 3.8) — status PRÓPRIO do
   * artefato, independente do status da fase inteira. Opcional e aditivo:
   * nenhum agente escreve isto ainda (delivery-state.yaml é convenção de
   * prompt, não schema forçado — ver topo do arquivo), então todo card
   * hoje continua caindo no fallback (status da fase, `item.status`) até
   * os agentes de fase passarem a reportar por artefato. Habilita o board
   * a mostrar N itens de uma fase em lanes DIFERENTES (ex.: 3 cenários de
   * BDD, um done/um running/um pending) em vez de todos empilhados na
   * mesma lane só porque a fase-mãe está "running".
   */
  status?: DeliveryPhaseStatus;
}

export interface DeliveryPhaseState {
  status: DeliveryPhaseStatus;
  /** Texto original quando `status` é `unknown` (ADR-0022 §5): preservado, nunca reescrito. */
  status_text?: string;
  /** Motivo de `blocked`, `failed` ou `cancelled` (ADR-0022). */
  reason?: string;
  agent?: string;
  completed_at?: string;
  artifacts?: DeliveryArtifactRef[];
  human_checklist: Record<string, boolean>;
}

export interface DeliveryState {
  version?: number;
  phases: Record<string, DeliveryPhaseState>;
}

/**
 * Chaves de fase já vistas gravadas com o NOME do agente em vez do `phaseId`
 * canônico de `PHASE_CONTRACTS` — mesmo espírito do `PHASE_KEY_ALIASES` do
 * Foundation. Um alias nunca sobrescreve uma entrada já gravada sob a chave
 * canônica. Os aliases vêm do catálogo único (`phase-catalog.pure.ts`).
 */
const PHASE_KEY_ALIASES: Record<string, string> = deliveryPhaseKeyAliases();

/**
 * Ordem canônica das fases (a mesma `PHASE_ORDER` de `phase-contracts.ts`),
 * lida direto do catálogo para que o parser — e o CLI/MCP que o embutem — não
 * dependa do módulo dos contratos inteiros.
 */
const PHASE_ORDER: readonly string[] = deliveryPhaseIds();

// ADR-0022 §5: sem rebaixamento silencioso. Antes, um texto fora do enum
// (ex.: "planned", já visto em produção) virava "pending"; agora vira
// "unknown" e o texto original fica em `status_text`. Ausente continua "pending".
function toDeliveryStatus(raw: unknown, statusText?: unknown): { status: DeliveryPhaseStatus; text?: string } {
  return readWorkStatus(raw, WORK_STATUSES, "pending", statusText);
}

function toArtifactRefs(raw: unknown): DeliveryArtifactRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const refs = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as Record<string, unknown>).path === "string")
    .map((r) => ({
      path: r.path as string,
      ...(typeof r.exists === "boolean" ? { exists: r.exists } : {}),
      ...(typeof r.note === "string" ? { note: r.note } : {}),
      ...(typeof r.status === "string" ? { status: toDeliveryStatus(r.status).status } : {}),
    }));
  return refs.length > 0 ? refs : undefined;
}

function parsePhaseMap(raw: unknown): Record<string, DeliveryPhaseState> {
  return parsePhaseMapWith(raw, PHASE_KEY_ALIASES, (_canonicalId, p, checklist) => {
    const artifacts = toArtifactRefs(p.artifacts);
    const status = toDeliveryStatus(p.status, p.status_text);
    return {
      status: status.status,
      ...(status.text !== undefined ? { status_text: status.text } : {}),
      ...(typeof p.reason === "string" && p.reason.trim() ? { reason: p.reason.trim() } : {}),
      human_checklist: checklist,
      ...(typeof p.agent === "string" ? { agent: p.agent } : {}),
      ...(typeof p.completed_at === "string" ? { completed_at: p.completed_at } : {}),
      ...(artifacts ? { artifacts } : {}),
    };
  });
}

/**
 * Parseia `delivery-state.yaml`. `{ json: true }` é obrigatório, não
 * cosmético — é o que faz um arquivo real com chave de topo duplicada
 * (ver `delivery-state-chave-duplicada.yaml`) parsear em vez de lançar `duplicated mapping
 * key`. Nunca lança — na pior hipótese devolve `null`.
 */
export function parseDeliveryState(raw: string): DeliveryState | null {
  let doc: unknown;
  try {
    doc = loadStateYaml(raw, { json: true });
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;

  const root = doc as { version?: unknown; phases?: unknown };
  const phases = parsePhaseMap(root.phases);
  if (Object.keys(phases).length === 0) return null;

  return {
    phases,
    ...(typeof root.version === "number" ? { version: root.version } : {}),
  };
}

/**
 * Funde o `delivery-state.yaml` global com o de uma iniciativa — por fase,
 * o arquivo mais recente (por mtime) vence quando as duas fontes têm a
 * mesma fase; fases presentes só de um lado sempre entram.
 */
export function mergeDeliveryStates(
  global: DeliveryState | null,
  perInit: DeliveryState | null,
  globalMtimeMs: number,
  perInitMtimeMs: number
): DeliveryState | null {
  if (!global) return perInit;
  if (!perInit) return global;

  const [older, newer] = globalMtimeMs <= perInitMtimeMs ? [global, perInit] : [perInit, global];
  return {
    phases: { ...older.phases, ...newer.phases },
    version: newer.version ?? older.version,
  };
}

/**
 * Fallback quando não existe `delivery-state.yaml` nenhum (a maioria das
 * iniciativas reais deste repo hoje) — infere a partir de `current_phase`
 * da iniciativa: fases antes dela em `PHASE_ORDER` viram `done`, a atual
 * vira `in-progress`, o resto `pending`. É uma inferência de exibição, não
 * um dado atestado por agente nenhum.
 */
export function synthesizeDeliveryStateFromPhase(currentPhaseId: string | undefined): DeliveryState {
  const phases: Record<string, DeliveryPhaseState> = {};
  // Alias-aware (F3.1): `sprint-planner` ou o `review` legado contam como a fase canônica.
  const idx = currentPhaseId ? PHASE_ORDER.indexOf(canonicalDeliveryPhaseId(currentPhaseId)) : -1;

  PHASE_ORDER.forEach((phaseId, i) => {
    if (idx === -1) {
      phases[phaseId] = { status: "pending", human_checklist: {} };
    } else if (i < idx) {
      phases[phaseId] = { status: "done", human_checklist: {} };
    } else if (i === idx) {
      phases[phaseId] = { status: "in-progress", human_checklist: {} };
    } else {
      phases[phaseId] = { status: "pending", human_checklist: {} };
    }
  });

  return { phases };
}
