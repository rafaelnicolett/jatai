/**
 * foundation-state-contract.pure.ts
 *
 * A metade pura de `foundation-state-contract.ts` — zero `fs`/`path`, seguro
 * para bundle de webview (browser). Tipos, parsing e queries vivem aqui;
 * `loadFoundationState` (que toca disco) fica no arquivo original, que
 * re-exporta este módulo por inteiro para não quebrar nenhum consumidor
 * existente.
 */

import { loadStateYaml } from "./state-yaml.shared.pure";
import type { ReposInventory } from "./repos-contract.pure";
import { scannableRepos } from "./repos-contract.pure";
import { parsePhaseMapWith } from "./phase-map.shared.pure";
import { normalizeEnum } from "./enum-normalize.shared.pure";

/** Path canônico do tracker, relativo à raiz do workspace. */
export const FOUNDATION_STATE_PATH = [".github", "artifacts", "assessment", "foundation-state.yaml"] as const;
export const FOUNDATION_STATE_REL = FOUNDATION_STATE_PATH.join("/");

export type FoundationPhaseStatus = "done" | "agent-done" | "in-progress" | "pending";

/** Espelho runtime de `FoundationPhaseStatus` — fonte de validação pro CLI `helyx-state`. */
export const FOUNDATION_PHASE_STATUSES = ["done", "agent-done", "in-progress", "pending"] as const;

export interface FoundationPhaseState {
  status: FoundationPhaseStatus;
  agent?: string;
  completed_at?: string;
  human_checklist: Record<string, boolean>;
}

export type GateStatus = "pending" | "approved";

/** Espelho runtime de `GateStatus` — fonte de validação pro CLI `helyx-state`. */
export const GATE_STATUSES = ["pending", "approved"] as const;

export interface FindingsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Gate D1 de um repositório. `approved_at` é o que o agente ou o Cockpit
 * gravam; `human_approved_at` (G2, ADR-0024 proposta) marca que a aprovação
 * foi registrada como decisão humana (`jatai-state gates approve`), com `by`
 * e `note` opcionais.
 */
export interface GateD1Record {
  status: GateStatus;
  approved_at?: string;
  human_approved_at?: string;
  by?: string;
  note?: string;
}

/** Estado do assessment de UM repositório. */
export interface RepoFoundationState {
  phases: Record<string, FoundationPhaseState>;
  /** Resumo por severidade — evita o dashboard ter que parsear `tech-debt.md`. */
  findings_summary?: FindingsSummary;
  /** Gate D1 **deste** repo. Aprovar um não aprova os outros. */
  gate_d1: GateD1Record;
}

export interface FoundationState {
  version?: number;
  /** Fases cross-repo (domínio, negócio). Também acomoda o formato v1 (single-repo). */
  phases: Record<string, FoundationPhaseState>;
  /** Fases técnicas por repositório. Vazio em workspaces v1. */
  repos: Record<string, RepoFoundationState>;
}

/**
 * Normaliza o `status` gravado pelo `@assessor`. `agent-done` precisa
 * sobreviver à leitura — é o estado "aguardando você aprovar".
 */
export function toFoundationStatus(raw: unknown): FoundationPhaseStatus {
  return normalizeEnum(raw, FOUNDATION_PHASE_STATUSES, "pending");
}

function toGateStatus(raw: unknown): GateStatus {
  return String(raw ?? "").trim() === "approved" ? "approved" : "pending";
}

/**
 * Chaves de fase que um agente já gravou em produção, divergentes do `phaseId`
 * canônico — mapeadas para a chave certa na leitura.
 *
 * `design-system` é o caso real que motivou isto: ao rodar `@design-archaeologist`
 * retroativamente num repositório cujo Gate D1 já tinha sido aprovado (o kit
 * ganhou a fase depois), o agente improvisou uma chave batendo com o nome do
 * artefato/skill em vez do `phaseId` oficial (`design`). Sem este mapa, a fase
 * fica concluída e aprovada no disco e **invisível na tela**: o estado existe,
 * só não é encontrado pela chave certa.
 *
 * Uma chave literal e canônica sempre vence — o alias só preenche quando o
 * canônico ainda não foi escrito (ver uso abaixo).
 */
const PHASE_KEY_ALIASES: Record<string, string> = {
  "design-system": "design",
  "domain-extraction": "domain",
};

function parsePhaseMap(raw: unknown): Record<string, FoundationPhaseState> {
  return parsePhaseMapWith(raw, PHASE_KEY_ALIASES, (_canonicalId, p, checklist) => ({
    status: toFoundationStatus(p.status),
    human_checklist: checklist,
    ...(typeof p.agent === "string" ? { agent: p.agent } : {}),
    ...(typeof p.completed_at === "string" ? { completed_at: p.completed_at } : {}),
  }));
}

function toFindingsSummary(raw: unknown): FindingsSummary | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && v >= 0 ? v : 0);
  return { critical: num(f.critical), high: num(f.high), medium: num(f.medium), low: num(f.low) };
}

/**
 * Parseia o `foundation-state.yaml` (v1 e v2).
 *
 * v1 (single-repo) só tem `phases:` — continua sendo lido, sem migração.
 * v2 adiciona `repos:`. Por isso o parser lê `phases:` **explicitamente**: o
 * parser antigo casava "qualquer chave de 2 espaços" como fase, e no multi-repo
 * `repos: > billing-api:` viraria uma "fase" fantasma.
 *
 * **Degradação:** o arquivo é escrito por um agente, e uma indentação errada num
 * único repositório não pode apagar o progresso de todos os outros. Se o YAML
 * inteiro falha, recuperamos repo a repo — um bloco quebrado some, o resto
 * aparece. Melhor um dashboard 80% certo do que um dashboard cego.
 */
export function parseFoundationState(raw: string): FoundationState | null {
  let doc: unknown;
  try {
    doc = loadStateYaml(raw);
  } catch {
    doc = recoverPartial(raw);
    if (!doc) return null;
  }
  if (!doc || typeof doc !== "object") return null;

  const root = doc as { version?: unknown; phases?: unknown; repos?: unknown };
  const phases = parsePhaseMap(root.phases);

  const repos: Record<string, RepoFoundationState> = {};
  if (root.repos && typeof root.repos === "object") {
    for (const [repoId, value] of Object.entries(root.repos as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const r = value as Record<string, unknown>;
      const gate = (r.gate_d1 ?? {}) as Record<string, unknown>;
      repos[repoId] = {
        phases: parsePhaseMap(r.phases),
        gate_d1: {
          status: toGateStatus(gate.status),
          ...(typeof gate.approved_at === "string" ? { approved_at: gate.approved_at } : {}),
          ...(typeof gate.human_approved_at === "string" ? { human_approved_at: gate.human_approved_at } : {}),
          ...(typeof gate.by === "string" ? { by: gate.by } : {}),
          ...(typeof gate.note === "string" ? { note: gate.note } : {}),
        },
        ...(toFindingsSummary(r.findings_summary) ? { findings_summary: toFindingsSummary(r.findings_summary)! } : {}),
      };
    }
  }

  if (Object.keys(phases).length === 0 && Object.keys(repos).length === 0) return null;

  return {
    phases,
    repos,
    ...(typeof root.version === "number" ? { version: root.version } : {}),
  };
}

/**
 * Recupera o máximo possível de um `foundation-state.yaml` que não parseia.
 *
 * Fatia por entrada de repositório (`  <id>:` sob `repos:`) e tenta parsear cada
 * uma como um documento isolado. O bloco que estiver malformado é descartado; os
 * demais sobrevivem. É o que impede uma indentação errada num repo de zerar a
 * tela dos outros três já concluídos.
 *
 * Best-effort e heurístico de propósito — só roda quando o parse normal já
 * falhou, então qualquer coisa recuperada é ganho líquido.
 */
function recoverPartial(raw: string): { repos: Record<string, unknown> } | null {
  const lines = raw.split("\n");

  // Localiza o bloco `repos:` de topo (coluna 0). O outro `repos:` (dentro de
  // `foundation:`) é indentado, então não casa.
  const reposIdx = lines.findIndex((l) => /^repos:\s*$/.test(l));
  if (reposIdx === -1) return null;

  // Cabeçalhos de repo: `  <id>:` com 2 espaços exatos.
  const repoHeader = /^ {2}([a-z0-9][a-z0-9-]*):\s*$/;
  const recovered: Record<string, unknown> = {};

  let i = reposIdx + 1;
  while (i < lines.length) {
    const header = lines[i]!.match(repoHeader);
    if (!header) {
      // saiu do bloco repos: (linha na coluna 0 que não é continuação)
      if (/^\S/.test(lines[i]!)) break;
      i++;
      continue;
    }

    const repoId = header[1]!;
    const start = i;
    i++;
    // Corpo do repo: tudo indentado com mais de 2 espaços até o próximo header.
    while (i < lines.length && !repoHeader.test(lines[i]!) && !/^\S/.test(lines[i]!)) i++;

    const block = lines.slice(start, i).join("\n");
    try {
      const parsed = loadStateYaml(block) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object" && parsed[repoId]) {
        recovered[repoId] = parsed[repoId];
      }
    } catch {
      // repo malformado — descarta este, mantém os outros
    }
  }

  return Object.keys(recovered).length > 0 ? { repos: recovered } : null;
}

// ── Consultas ───────────────────────────────────────────────────────────────

/** Fases técnicas de um repo. */
export function phasesForRepo(state: FoundationState | null, repoId: string): Record<string, FoundationPhaseState> {
  return state?.repos[repoId]?.phases ?? {};
}

/**
 * Estado de uma fase. Procura no repo quando `repoId` é dado, senão nas
 * cross-repo. Cai para as cross-repo se o repo ainda não tem a fase — assim um
 * workspace v1 (sem `repos:`) continua funcionando.
 */
export function phaseState(
  state: FoundationState | null,
  phaseId: string,
  repoId?: string
): FoundationPhaseState | undefined {
  if (repoId) {
    const fromRepo = state?.repos[repoId]?.phases[phaseId];
    if (fromRepo) return fromRepo;
  }
  return state?.phases[phaseId];
}

/** Gate D1 deste repo. Ausente = ainda pendente. */
export function gateD1ForRepo(state: FoundationState | null, repoId: string): GateStatus {
  return state?.repos[repoId]?.gate_d1.status ?? "pending";
}

/**
 * Repos que ainda não tiveram o D1 aprovado (ignora `scan_profile: ignore`).
 * É o que trava o D1 global — e o que o dashboard mostra como "faltam estes".
 */
export function d1BlockedBy(state: FoundationState | null, inventory: ReposInventory | null): string[] {
  return scannableRepos(inventory)
    .filter((r) => gateD1ForRepo(state, r.id) !== "approved")
    .map((r) => r.id);
}

/**
 * D1 global — **derivado**, nunca armazenado (um campo `blocked_by` no arquivo
 * dessincronizaria na primeira vez que o agente esquecesse de atualizar).
 *
 * Fecha quando todo repo scannable teve seu D1 aprovado **e** o domínio foi
 * aprovado — o domínio é cross-repo e só roda depois do último scan.
 */
export function isD1GlobalReady(
  state: FoundationState | null,
  inventory: ReposInventory | null,
  requiredWorkspacePhases: string[] = ["domain"]
): boolean {
  if (scannableRepos(inventory).length === 0) return false;
  // Todos os repos com D1 aprovado…
  if (d1BlockedBy(state, inventory).length > 0) return false;
  // …E todas as fases cross-repo exigidas concluídas. Antes checava só `domain`,
  // e o gate global acendia enquanto business/baseline/skill-linking ainda
  // faltavam — o Discovery parecia terminado no meio do cross-repo.
  return requiredWorkspacePhases.every((p) => state?.phases[p]?.status === "done");
}
