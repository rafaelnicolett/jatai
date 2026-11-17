/**
 * StateRepository.ts
 *
 * Porta (Branch by Abstraction — roadmap `mod-state-service`, item 2.1) na
 * frente de TODA leitura/escrita de `initiatives.yaml` e `delivery-state.yaml`
 * feita hoje pelo CLI (`cli/commands/initiatives.ts`,
 * `cli/commands/delivery-state.ts`) e pelas actions do Cockpit
 * (`views/actions/{approval,greenfield,initiative}Actions.ts`).
 *
 * `YamlStateRepository` é a ÚNICA implementação e só encapsula o que
 * `atomic-write.ts` + `core/state/writers/*` já faziam chamados diretamente
 * por cada call-site. O espelho SQLite que existiu (roadmap
 * `mod-state-service`, item 2.2) saiu do Jataí pela ADR-0017.
 *
 * Escopo desta wave: só os 2 artefatos hoje escritos em produção pelo
 * runtime da extensão (`initiatives.yaml`, `delivery-state.yaml`). Os outros
 * 5 artefatos do schema de-para (`repos.yaml`, `context-repos.yaml`,
 * `repo-graph.yaml`, `foundation-state.yaml`, `sprint-backlog.yaml`) são
 * escritos só por agentes de Discovery/Planning fora do runtime desta
 * extensão — deliberadamente fora do escopo desta porta (ver
 * `refactor-report-helyx-vscode-state-repository-port.md`).
 *
 * Duas famílias de método por artefato. As duas escrevem sob o MESMO lock
 * de arquivo e de forma atômica (`atomicWrite`: lock `.lock`, temp + rename)
 * desde a correção do A10 / H-BUG-16 / D13 (F3.3, ADR-0017):
 *   - `*Atomic`: as operações do CLI, do State Service e do MCP;
 *   - `*InPlace`: as operações do Cockpit e do chat. O nome ficou por
 *     compatibilidade; antes gravavam com `writeFileSync` direto, sem lock, e
 *     um read-modify-write intercalado com o CLI apagava a escrita do outro.
 *     O `atomicWrite` também cria a pasta real do arquivo (antes
 *     `markDeliveryPhaseDoneInPlace` e `toggleDeliveryChecklistInPlace` só
 *     criavam a pasta de artefatos da raiz).
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { atomicWrite } from "../lock/atomic-write";
import {
  upsertInitiative,
  switchActive,
  bumpPhase,
  upsertWaveItem,
  upsertInitiativeGate,
  type InitiativeUpsertFields,
  type WaveItemUpsertFields,
} from "../../core/state/writers/initiatives-writer";
import {
  upsertPhaseStatusInYaml,
  upsertPhaseCompletedAtInYaml,
  upsertPhaseAgentInYaml,
  upsertPhaseReasonInYaml,
  upsertPhaseArtifactsInYaml,
  upsertChecklistItemInYaml,
  upsertPhaseInYaml,
  findPhaseHeaderIdx,
  yamlKey,
  asTwoSpaceIndent,
  type PhaseStatus,
  upsertGateD1InYaml,
} from "../../core/state/writers/yamlUpsert";
import { INITIATIVES_PATH, parseInitiativesYaml, readActiveInitiativeId, readInlineYamlString, type InitiativesState } from "../../core/contracts/initiatives-contract.pure";
import {
  DELIVERY_STATE_GLOBAL_PATH,
  initiativeDeliveryStatePath as initiativeDeliveryStateRelPath,
  parseDeliveryState,
  type DeliveryState,
} from "../../core/contracts/delivery-state-contract.pure";
import { canonicalDeliveryPhaseId } from "../../core/methodology/phase-catalog.pure";
import { FOUNDATION_STATE_PATH, parseFoundationState, type FoundationState } from "../../core/contracts/foundation-state-contract.pure";
import { REPOS_PATH, parseReposYaml, type ReposInventory } from "../../core/contracts/repos-contract.pure";

export type { InitiativeUpsertFields, WaveItemUpsertFields, PhaseStatus };

export interface DeliveryPhaseUpsertFields {
  status: PhaseStatus;
  /** Motivo de `blocked`, `failed` ou `cancelled` (ADR-0022). Ausente tira um `reason` antigo da fase. */
  reason?: string;
  agent?: string;
  completedAt?: string;
  artifacts?: string[];
}

export interface DeliveryNextPhase {
  id: string;
  agent?: string;
}

export interface StateRepository {
  // ---------------------------------------------------------------------
  // initiatives.yaml
  // ---------------------------------------------------------------------

  /** Caminho absoluto de `initiatives.yaml` no workspace `root`. */
  initiativesPath(root: string): string;

  /** `true` se `initiatives.yaml` existir no workspace `root`. */
  initiativesFileExists(root: string): boolean;

  /** `helyx-state initiatives create` — cria ou faz merge de campos, sob lock. */
  upsertInitiativeAtomic(root: string, fields: InitiativeUpsertFields): Promise<{ path: string; changed: boolean }>;

  /** `helyx-state initiatives switch-active` — sob lock. */
  switchActiveInitiativeAtomic(root: string, id: string): Promise<{ path: string; changed: boolean }>;

  /** `helyx-state initiatives bump-phase` — sob lock; `found:false` se `id` não existir em `initiatives.yaml`. */
  bumpInitiativePhaseAtomic(root: string, id: string, phase: string): Promise<{ path: string; changed: boolean; found: boolean }>;

  /**
   * `helyx-state initiatives upsert-wave-item` — sob lock; `found:false` se a
   * iniciativa não existir. `group` (default `"wave"`, ADR-0006) escreve em
   * `wave_status`/`epic_status` — retrocompat total, nenhum chamador
   * existente precisa passar o parâmetro.
   */
  upsertWaveItemAtomic(
    root: string,
    initiativeId: string,
    wave: string,
    item: string,
    fields: WaveItemUpsertFields,
    group?: "wave" | "epic"
  ): Promise<{ path: string; changed: boolean; found: boolean }>;

  /**
   * Troca `active:` a partir do pill-switcher do Cockpit — sob lock (A10), no-op
   * silencioso se `initiatives.yaml` ainda não existir (mesmo comportamento
   * do `switchInitiativeHandler` original).
   */
  setActiveInitiativeInPlace(root: string, id: string): Promise<void>;

  /**
   * Bump de `current_phase` da iniciativa ATIVA (lida de `active:` no topo
   * do arquivo) — usado só pelo avanço de fase greenfield
   * (`approveAndAdvancePhase`). Distinto de `bumpInitiativePhaseAtomic`
   * (que recebe `id` explícito e usa o parser estrutural `yaml`, sob lock):
   * este edita linha a linha via regex, sob o mesmo lock (A10), e não faz nada em
   * qualquer caso não-feliz (arquivo ausente, `active:` ausente, entrada não
   * encontrada) — mesmo comportamento de `updateInitiativeCurrentPhase` no
   * código original.
   */
  bumpActiveInitiativeCurrentPhaseInPlace(root: string, newPhase: string): Promise<void>;

  /**
   * Lê o item `wave_status.<wave>.items.<item>` de uma iniciativa —
   * `undefined` se a iniciativa/onda/item não existir. Assume que o arquivo
   * existe (checar com `initiativesFileExists` antes de chamar).
   */
  getWaveItem(root: string, initiativeId: string, wave: string, item: string): Record<string, unknown> | undefined;

  /**
   * Aprovação humana de um wave item (`human_approved_at`) — sob lock (A10).
   * `found:false` se a iniciativa não existir.
   */
  approveWaveItemHumanly(
    root: string,
    initiativeId: string,
    wave: string,
    item: string,
    approvedAt: string
  ): Promise<{ found: boolean }>;

  // ---------------------------------------------------------------------
  // delivery-state.yaml (global e por iniciativa)
  // ---------------------------------------------------------------------

  /** Caminho do `delivery-state.yaml` GLOBAL (workspace-wide). */
  globalDeliveryStatePath(root: string): string;

  /** Caminho do `delivery-state.yaml` de UMA iniciativa. */
  initiativeDeliveryStatePath(root: string, initiativeId: string): string;

  /**
   * `helyx-state delivery-state upsert-phase` — 1 transação atômica cobrindo
   * status + `completed_at` (opcional) + `artifacts` (opcional), na mesma
   * ordem do comando original.
   */
  upsertDeliveryPhaseAtomic(filePath: string, phaseId: string, fields: DeliveryPhaseUpsertFields): Promise<{ changed: boolean }>;

  /** `helyx-state delivery-state upsert-checklist` — sob lock. */
  upsertDeliveryChecklistItemAtomic(
    filePath: string,
    phaseId: string,
    itemId: string,
    checked: boolean,
    section: string
  ): Promise<{ changed: boolean }>;

  /** Lê os booleanos de um checklist de uma fase (best-effort) — usado pelo gate de avanço de fase greenfield. */
  readChecklistState(filePath: string, phaseId: string, section: string): Record<string, boolean>;

  /**
   * `markPhaseDone` do Cockpit — sob lock (A10); cria o arquivo com um bootstrap
   * mínimo se ainda não existir. Ver nota de topo sobre o `mkdirSync` restrito
   * a `.github/artifacts` (comportamento original preservado).
   */
  markDeliveryPhaseDoneInPlace(root: string, filePath: string, phaseId: string, completedAt: string): Promise<void>;

  /**
   * `toggleGuardRail` do Cockpit — sob lock (A10). Ver nota de topo sobre o
   * `mkdirSync` restrito a `.github/artifacts` (comportamento original
   * preservado).
   */
  toggleDeliveryChecklistInPlace(
    root: string,
    filePath: string,
    phaseId: string,
    itemId: string,
    checked: boolean,
    section: string
  ): Promise<void>;

  /**
   * `approveAndAdvancePhase` (Caminho B do HITL) — 1 escrita sob lock (A10)
   * cobrindo: marca `human-ok` no checklist da fase atual, marca a fase
   * atual como `done`, e (se houver próxima fase) marca a próxima como
   * `in-progress`.
   */
  advanceDeliveryPhaseInPlace(
    filePath: string,
    phaseId: string,
    completedAt: string,
    nextPhase?: DeliveryNextPhase
  ): Promise<void>;

  // ---------------------------------------------------------------------
  // Leitura de estado completo — roadmap item 2.2 (State Service API HTTP,
  // `GET /initiatives`/`GET /delivery-state`). Sempre do YAML (ADR-0017).
  // ---------------------------------------------------------------------

  /** Registro completo de iniciativas do workspace `root`. `null` = ainda não há nenhuma. */
  loadInitiativesState(root: string): InitiativesState | null;

  /** `delivery-state.yaml` completo — global (`initiativeId` ausente) ou de uma iniciativa. `null` = arquivo ainda não existe. */
  loadDeliveryState(root: string, initiativeId?: string): DeliveryState | null;

  // ---------------------------------------------------------------------
  // Gates (G2, ADR-0024 proposta): D1 por repositório no foundation-state,
  // D2 e D3 por iniciativa no initiatives.yaml. Aprovação sob lock.
  // ---------------------------------------------------------------------

  /** Caminho absoluto de `assessment/foundation-state.yaml`. */
  foundationStatePath(root: string): string;

  /** `foundation-state.yaml` parseado. `null` = arquivo ausente ou sem dado recuperável. */
  loadFoundationState(root: string): FoundationState | null;

  /** `repos.yaml` (inventário de repositórios), `null` se ainda não existe. A regra de fechamento do D1 lê `has_frontend` daqui (ADR-0024). */
  loadReposInventory(root: string): ReposInventory | null;

  /** Aprovação humana do Gate D1 de um repositório. `found:false` se o repositório não estiver no foundation-state. */
  approveGateD1Atomic(root: string, repoId: string, approval: GateApproval): Promise<{ path: string; changed: boolean; found: boolean }>;

  /** Aprovação humana do Gate D2 ou D3 de uma iniciativa. `found:false` se a iniciativa não existir. */
  approveInitiativeGateAtomic(
    root: string,
    initiativeId: string,
    gate: "d2" | "d3",
    approval: GateApproval
  ): Promise<{ path: string; changed: boolean; found: boolean }>;
}

/** O registro de uma aprovação humana de gate: `approved_at` e `human_approved_at` recebem `at`. */
export interface GateApproval {
  at: string;
  by?: string;
  note?: string;
}

export class YamlStateRepository implements StateRepository {
  // ---- initiatives.yaml ----

  initiativesPath(root: string): string {
    return path.join(root, ...INITIATIVES_PATH);
  }

  initiativesFileExists(root: string): boolean {
    return fs.existsSync(this.initiativesPath(root));
  }

  async upsertInitiativeAtomic(root: string, fields: InitiativeUpsertFields): Promise<{ path: string; changed: boolean }> {
    const filePath = this.initiativesPath(root);
    const { changed } = await atomicWrite(filePath, (current) => upsertInitiative(current, fields));
    return { path: filePath, changed };
  }

  async switchActiveInitiativeAtomic(root: string, id: string): Promise<{ path: string; changed: boolean }> {
    const filePath = this.initiativesPath(root);
    const { changed } = await atomicWrite(filePath, (current) => switchActive(current, id));
    return { path: filePath, changed };
  }

  async bumpInitiativePhaseAtomic(root: string, id: string, phase: string): Promise<{ path: string; changed: boolean; found: boolean }> {
    const filePath = this.initiativesPath(root);
    let found = true;
    const { changed } = await atomicWrite(filePath, (current) => {
      const result = bumpPhase(current, id, phase);
      found = result.found;
      return result.content;
    });
    return { path: filePath, changed, found };
  }

  async upsertWaveItemAtomic(
    root: string,
    initiativeId: string,
    wave: string,
    item: string,
    fields: WaveItemUpsertFields,
    group: "wave" | "epic" = "wave"
  ): Promise<{ path: string; changed: boolean; found: boolean }> {
    const filePath = this.initiativesPath(root);
    let found = true;
    const { changed } = await atomicWrite(filePath, (current) => {
      const result = upsertWaveItem(current, initiativeId, wave, item, fields, group);
      found = result.found;
      return result.content;
    });
    return { path: filePath, changed, found };
  }

  async setActiveInitiativeInPlace(root: string, id: string): Promise<void> {
    const filePath = this.initiativesPath(root);
    if (!fs.existsSync(filePath)) return;
    await atomicWrite(filePath, (content) => {
      const activeLine = /^active:\s*.+$/m;
      return activeLine.test(content) ? content.replace(activeLine, `active: ${id}`) : `active: ${id}\n${content}`;
    });
  }

  async bumpActiveInitiativeCurrentPhaseInPlace(root: string, newPhase: string): Promise<void> {
    const filePath = this.initiativesPath(root);
    if (!fs.existsSync(filePath)) return;
    await atomicWrite(filePath, (raw) => bumpActiveCurrentPhase(raw, newPhase));
  }

  getWaveItem(root: string, initiativeId: string, wave: string, item: string): Record<string, unknown> | undefined {
    const filePath = this.initiativesPath(root);
    const content = fs.readFileSync(filePath, "utf-8");
    const { state } = parseInitiativesYaml(content);
    const initiative = state?.initiatives.find((i) => i.id === initiativeId);
    return initiative?.wave_status?.[wave]?.items?.[item] as Record<string, unknown> | undefined;
  }

  async approveWaveItemHumanly(
    root: string,
    initiativeId: string,
    wave: string,
    item: string,
    approvedAt: string
  ): Promise<{ found: boolean }> {
    const filePath = this.initiativesPath(root);
    let found = false;
    await atomicWrite(filePath, (content) => {
      const result = upsertWaveItem(content, initiativeId, wave, item, { humanApprovedAt: approvedAt });
      found = result.found;
      return result.found ? result.content : content;
    });
    return { found };
  }

  // ---- delivery-state.yaml ----

  globalDeliveryStatePath(root: string): string {
    return path.join(root, ...DELIVERY_STATE_GLOBAL_PATH);
  }

  initiativeDeliveryStatePath(root: string, initiativeId: string): string {
    return path.join(root, ...initiativeDeliveryStateRelPath(initiativeId));
  }

  upsertDeliveryPhaseAtomic(filePath: string, phaseId: string, fields: DeliveryPhaseUpsertFields): Promise<{ changed: boolean }> {
    return atomicWrite(filePath, (current) => {
      let next = upsertPhaseStatusInYaml(current, phaseId, fields.status, fields.agent);
      next = upsertPhaseReasonInYaml(next, phaseId, fields.reason);
      // H-BUG-62: o agent explícito também vale numa fase que já existe.
      if (fields.agent) next = upsertPhaseAgentInYaml(next, phaseId, fields.agent);
      if (fields.completedAt) next = upsertPhaseCompletedAtInYaml(next, phaseId, fields.completedAt);
      if (fields.artifacts && fields.artifacts.length > 0) next = upsertPhaseArtifactsInYaml(next, phaseId, fields.artifacts);
      return guardDeliveryYaml(filePath, current, next);
    });
  }

  upsertDeliveryChecklistItemAtomic(
    filePath: string,
    phaseId: string,
    itemId: string,
    checked: boolean,
    section: string
  ): Promise<{ changed: boolean }> {
    return atomicWrite(filePath, (current) => guardDeliveryYaml(filePath, current, upsertChecklistItemInYaml(current, phaseId, itemId, checked, section)));
  }

  readChecklistState(filePath: string, phaseId: string, section: string): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (!fs.existsSync(filePath)) return out;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      // BUG-27: arquivo com 4 espaços é lido na mesma visão de 2 que os writers usam.
      const lines = (asTwoSpaceIndent(raw)?.normalized ?? raw).split("\n");
      // Alias-aware (A3/H-BUG-17): acha o bloco sob qualquer chave da fase (canônica ou id do agente).
      const phaseIdx = findPhaseHeaderIdx(lines, -1, phaseId);
      if (phaseIdx === -1) return out;
      let inSection = false;
      // A chave exata que o writer grava (yamlKey), comparada como texto: a seção pode vir de --section ou de YAML à mão.
      const sectionHeader = `    ${yamlKey(section)}:`;
      for (let i = phaseIdx + 1; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^ {2}\S/.test(line) || /^[^\s]/.test(line)) break;
        if (line.trimEnd() === sectionHeader) { inSection = true; continue; }
        if (inSection) {
          const m = line.match(/^ {6}([\w-]+):\s*(true|false)/);
          if (m) out[m[1]!] = m[2] === "true";
          else if (/^ {4}\S/.test(line)) inSection = false;
        }
      }
    } catch { /* ignore */ }
    return out;
  }

  async markDeliveryPhaseDoneInPlace(root: string, filePath: string, phaseId: string, completedAt: string): Promise<void> {
    fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
    await atomicWrite(filePath, (before) => {
      // Sob o lock o arquivo não muda: "existe" decide entre editar e o bootstrap mínimo, como antes.
      const content = fs.existsSync(filePath)
        ? upsertPhaseInYaml(before, phaseId, completedAt)
        : `initiative_id: default\nphases:\n  ${canonicalDeliveryPhaseId(phaseId)}:\n    status: done\n    completed_at: ${JSON.stringify(completedAt)}\n`;
      return guardDeliveryYaml(filePath, before, content);
    });
  }

  async toggleDeliveryChecklistInPlace(
    root: string,
    filePath: string,
    phaseId: string,
    itemId: string,
    checked: boolean,
    section: string
  ): Promise<void> {
    fs.mkdirSync(path.join(root, ".github/artifacts"), { recursive: true });
    await atomicWrite(filePath, (before) => guardDeliveryYaml(filePath, before, upsertChecklistItemInYaml(before, phaseId, itemId, checked, section)));
  }

  async advanceDeliveryPhaseInPlace(
    filePath: string,
    phaseId: string,
    completedAt: string,
    nextPhase?: DeliveryNextPhase
  ): Promise<void> {
    await atomicWrite(filePath, (before) => {
      let content = before;
      // A1/H-BUG-05: o human-ok vai para human_checklist, a seção que o gate HITL lê (antes caía em `checklist`).
      content = upsertChecklistItemInYaml(content, phaseId, "human-ok", true, "human_checklist");
      content = upsertPhaseInYaml(content, phaseId, completedAt);
      if (nextPhase) {
        content = upsertPhaseStatusInYaml(content, nextPhase.id, "in-progress", nextPhase.agent);
      }
      return guardDeliveryYaml(filePath, before, content);
    });
  }

  loadInitiativesState(root: string): InitiativesState | null {
    const filePath = this.initiativesPath(root);
    if (!fs.existsSync(filePath)) return null;
    const { state } = parseInitiativesYaml(fs.readFileSync(filePath, "utf-8"));
    return state;
  }

  loadDeliveryState(root: string, initiativeId?: string): DeliveryState | null {
    const filePath = initiativeId ? this.initiativeDeliveryStatePath(root, initiativeId) : this.globalDeliveryStatePath(root);
    if (!fs.existsSync(filePath)) return null;
    return parseDeliveryState(fs.readFileSync(filePath, "utf-8"));
  }

  // ---- gates ----

  foundationStatePath(root: string): string {
    return path.join(root, ...FOUNDATION_STATE_PATH);
  }

  loadFoundationState(root: string): FoundationState | null {
    const filePath = this.foundationStatePath(root);
    if (!fs.existsSync(filePath)) return null;
    return parseFoundationState(fs.readFileSync(filePath, "utf-8"));
  }

  loadReposInventory(root: string): ReposInventory | null {
    const filePath = path.join(root, ...REPOS_PATH);
    if (!fs.existsSync(filePath)) return null;
    return parseReposYaml(fs.readFileSync(filePath, "utf-8")).inventory;
  }

  async approveGateD1Atomic(root: string, repoId: string, approval: GateApproval): Promise<{ path: string; changed: boolean; found: boolean }> {
    const filePath = this.foundationStatePath(root);
    if (!fs.existsSync(filePath)) return { path: filePath, changed: false, found: false };
    let found = false;
    const { changed } = await atomicWrite(filePath, (current) => {
      found = parseFoundationState(current)?.repos[repoId] !== undefined;
      if (!found) return current;
      return upsertGateD1InYaml(current, repoId, "approved", approval.at, { humanApprovedAt: approval.at, by: approval.by, note: approval.note });
    });
    return { path: filePath, changed, found };
  }

  async approveInitiativeGateAtomic(
    root: string,
    initiativeId: string,
    gate: "d2" | "d3",
    approval: GateApproval
  ): Promise<{ path: string; changed: boolean; found: boolean }> {
    const filePath = this.initiativesPath(root);
    if (!fs.existsSync(filePath)) return { path: filePath, changed: false, found: false };
    let found = false;
    const { changed } = await atomicWrite(filePath, (current) => {
      const result = upsertInitiativeGate(current, initiativeId, gate === "d2" ? "gate_d2" : "gate_d3", {
        status: "approved",
        approvedAt: approval.at,
        humanApprovedAt: approval.at,
        by: approval.by,
        note: approval.note,
      });
      found = result.found;
      return result.content;
    });
    return { path: filePath, changed, found };
  }
}

/** `text` é YAML que o js-yaml (modo estrito, como os leitores de arquivo) consegue carregar? */
function yamlLoads(text: string): string | null {
  try {
    yaml.load(text);
    return null;
  } catch (err) {
    const e = err as { reason?: string; mark?: { line?: number }; message?: string };
    return e.reason ? `${e.reason}${typeof e.mark?.line === "number" ? ` na linha ${e.mark.line + 1}` : ""}` : String(e.message ?? err);
  }
}

/**
 * A9/H-BUG-15 — guarda de reparse antes de gravar um `delivery-state.yaml`:
 * se a escrita deixaria inválido um arquivo que era válido (ou novo), lança
 * em vez de gravar — o CLI responde `ok:false` (INTERNAL) e o Cockpit mostra
 * o erro, com o arquivo intacto. Um arquivo que já chegou inválido não é
 * bloqueado (a guarda só recusa o que a própria escrita quebra).
 */
/**
 * `current_phase` da iniciativa ATIVA, editado linha a linha (o mesmo
 * algoritmo de sempre do avanço de fase greenfield). Devolve `raw` intacto
 * nos casos não felizes: sem `active:`, ou a entrada ativa não encontrada.
 */
function bumpActiveCurrentPhase(raw: string, newPhase: string): string {
  const activeId = readActiveInitiativeId(raw);
  if (!activeId) return raw;
  const lines = raw.split("\n");
  // `active:` e `- id:` lidos como YAML: o writer grava os dois com aspas (C2 / H-BUG-02, H-BUG-26).
  const entryIdx = lines.findIndex((l) => {
    const idText = l.match(/^\s*-\s*id:(.*)$/)?.[1];
    return idText !== undefined && readInlineYamlString(idText) === activeId;
  });
  if (entryIdx === -1) return raw;
  for (let i = entryIdx + 1; i < lines.length; i++) {
    if (/^\s*-\s*id:/.test(lines[i]!)) break;
    const m = lines[i]!.match(/^(\s+)current_phase:\s*\S+/);
    if (m) {
      lines[i] = `${m[1]}current_phase: ${newPhase}`;
      return lines.join("\n");
    }
  }
  lines.splice(entryIdx + 1, 0, `    current_phase: ${newPhase}`);
  return lines.join("\n");
}

function guardDeliveryYaml(filePath: string, before: string, after: string): string {
  if (after === before) return after;
  const reason = yamlLoads(after);
  if (reason === null || yamlLoads(before) !== null) return after;
  throw new Error(`a escrita deixaria ${path.basename(filePath)} com YAML inválido (${reason}); nada foi gravado`);
}

/**
 * Singleton — mesmo padrão já usado no repo para dependências de
 * infraestrutura (ex.: `cockpitStore`).
 *
 * ADR-0017 (F3.3): o YAML é a única fonte. O espelho SQLite
 * (`DualWriteStateRepository`/`SqliteStateRepository`, Parallel Run do
 * `mod-state-service`) saiu do Jataí: não tinha leitor, e toda leitura já
 * vinha do YAML. O singleton volta a ser o `YamlStateRepository` direto.
 */
export const stateRepository: StateRepository = new YamlStateRepository();
