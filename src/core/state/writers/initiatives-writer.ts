/**
 * initiatives-writer.ts
 *
 * Escrita estrutural de `initiatives.yaml` via `yaml` (eemeli) — diferente de
 * `yamlUpsert.ts` (regex/splice, usado por `delivery-state.yaml` e
 * `foundation-state.yaml`), aqui o patch é feito no `Document` parseado
 * (`setIn`/`getIn`/`addIn`), porque `wave_status.<wave>.<item>` é um
 * mapa-de-mapas com campos opcionais variados — regex ficaria frágil demais.
 * Serializa sempre com a formatação default do `yaml` — não preserva
 * comentários byte-a-byte como `yamlUpsert.ts`, é uma troca deliberada em
 * favor de patches estruturais seguros nesta parte do arquivo.
 *
 * Dois cuidados verificados na prática (ambos pegos por
 * `tests/cli/golden-round-trip.test.ts`, que relê com o parser real):
 *
 * 1. `doc.createNode(value)`/`doc.setIn(path, value)` para um objeto/array
 *    plano deixam `.flow` como `undefined`, e nesse caso o stringifier do
 *    `yaml` renderiza flow-style (`{ a: 1 }`/`[1, 2]`) em vez de
 *    block-style — inclusive para um `{}` vazio, que sequer vira um nó
 *    `YAMLMap` de verdade (vira um Scalar cujo valor é o objeto JS, e um
 *    `setIn` seguinte tentando navegar "para dentro" dele lança `Expected
 *    YAML collection at <key>`).
 * 2. Um scalar string sem aspas que "parece" outra coisa (data, bool, null,
 *    número) é reinterpretado como esse outro tipo por `js-yaml` na leitura
 *    — `completed_at: 2026-07-28` sem aspas vira um `Date` JS pro parser,
 *    não a string `"2026-07-28"`, e o campo inteiro é descartado por
 *    `toWaveItemStatus` (que exige `typeof v.completed_at === "string"`).
 *
 * `blockNode()` abaixo resolve os dois de uma vez: força `flow = false` em
 * toda coleção e `type = QUOTE_DOUBLE` em todo scalar string, recursivamente.
 */

import { parseDocument, isCollection, isScalar, isPair, Scalar, type Document, type Node } from "yaml";

type YamlDoc = Document.Parsed;

function deepFormat(node: Node): Node {
  if (isCollection(node)) {
    node.flow = false;
    for (const item of node.items) {
      if (isPair(item)) {
        if (item.value !== null && (isCollection(item.value) || isScalar(item.value))) deepFormat(item.value as Node);
      } else if (isCollection(item) || isScalar(item)) {
        deepFormat(item as Node);
      }
    }
  } else if (isScalar(node) && typeof node.value === "string") {
    node.type = Scalar.QUOTE_DOUBLE;
  }
  return node;
}

/** Envolve `value` num Node de verdade, block-style e com strings sempre entre aspas — ver nota de topo. */
function blockNode(doc: YamlDoc, value: unknown): Node {
  return deepFormat(doc.createNode(value));
}

/** Todo scalar string escrito por este módulo passa por aqui — nunca `doc.setIn(path, umaString)` direto (ver nota 2 de topo). */
function strNode(doc: YamlDoc, value: string): Node {
  return blockNode(doc, value);
}

function loadDoc(content: string): YamlDoc {
  return parseDocument(content.trim() ? content : "");
}

function initiativesLength(doc: YamlDoc): number {
  const node = doc.get("initiatives", true);
  return isCollection(node) ? node.items.length : 0;
}

function ensureInitiativesSeq(doc: YamlDoc): void {
  if (!isCollection(doc.get("initiatives", true))) {
    doc.set("initiatives", blockNode(doc, []));
  }
}

/** `-1` se nenhuma iniciativa com esse `id` existir no documento. */
function findInitiativeIndex(doc: YamlDoc, id: string): number {
  const len = initiativesLength(doc);
  for (let i = 0; i < len; i++) {
    if (doc.getIn(["initiatives", i, "id"]) === id) return i;
  }
  return -1;
}

/** Garante que `path` seja uma coleção de verdade, criando-a em block-style se ainda não existir. */
/**
 * `reason` (ADR-0022): grava quando vem; com um `status` novo e sem motivo,
 * tira o `reason` que tenha ficado do status anterior. Sem `status`, não toca.
 */
function setReason(doc: YamlDoc, path: (string | number)[], status: string | undefined, reason: string | undefined): void {
  if (reason) doc.setIn([...path, "reason"], strNode(doc, reason));
  else if (status && doc.hasIn([...path, "reason"])) doc.deleteIn([...path, "reason"]);
}

function ensureCollectionAt(doc: YamlDoc, path: (string | number)[]): void {
  if (!isCollection(doc.getIn(path, true))) {
    doc.setIn(path, blockNode(doc, {}));
  }
}

export interface InitiativeUpsertFields {
  id: string;
  name?: string;
  status?: string;
  stream?: string;
  currentPhase?: string;
  mode?: string;
  type?: string;
  owner?: string;
  priority?: string;
  createdAt?: string;
  /**
   * Motivo do status (ADR-0022): `cancelled` exige. Junto de um `status`, sem
   * motivo, tira um `reason` antigo; sem `status`, não toca no campo.
   */
  reason?: string;
  /** Também seta o `active:` de topo para este id — opt-in, nunca implícito (ver `switchActive` para o caso isolado). */
  setActive?: boolean;
}

/** Cria a iniciativa se `id` não existir, ou faz merge dos campos informados se já existir — nunca duplica entrada. */
export function upsertInitiative(content: string, fields: InitiativeUpsertFields): string {
  const doc = loadDoc(content);
  ensureInitiativesSeq(doc);
  const idx = findInitiativeIndex(doc, fields.id);

  if (idx === -1) {
    const entry: Record<string, unknown> = { id: fields.id, name: fields.name ?? fields.id, status: fields.status ?? "planned" };
    if (fields.stream) entry.stream = fields.stream;
    if (fields.currentPhase) entry.current_phase = fields.currentPhase;
    if (fields.mode) entry.mode = fields.mode;
    if (fields.type) entry.type = fields.type;
    if (fields.owner) entry.owner = fields.owner;
    if (fields.priority) entry.priority = fields.priority;
    if (fields.createdAt) entry.created_at = fields.createdAt;
    if (fields.reason) entry.reason = fields.reason;
    doc.addIn(["initiatives"], blockNode(doc, entry));
  } else {
    const set = (key: string, value: string | undefined): void => {
      if (value !== undefined) doc.setIn(["initiatives", idx, key], strNode(doc, value));
    };
    set("name", fields.name);
    set("status", fields.status);
    set("stream", fields.stream);
    set("current_phase", fields.currentPhase);
    set("mode", fields.mode);
    set("type", fields.type);
    set("owner", fields.owner);
    set("priority", fields.priority);
    set("created_at", fields.createdAt);
    setReason(doc, ["initiatives", idx], fields.status, fields.reason);
  }

  if (fields.setActive) doc.set("active", strNode(doc, fields.id));

  return String(doc);
}

/** Troca só o `active:` de topo — equivalente estrutural do `switchInitiativeHandler` (UI), usado pelo CLI. */
export function switchActive(content: string, id: string): string {
  const doc = loadDoc(content);
  doc.set("active", strNode(doc, id));
  return String(doc);
}

/** Bump de `current_phase` de UMA iniciativa por `id`. `found: false` se o `id` não existir — o comando decide como reportar isso. */
export function bumpPhase(content: string, id: string, phase: string): { content: string; found: boolean } {
  const doc = loadDoc(content);
  const idx = findInitiativeIndex(doc, id);
  if (idx === -1) return { content, found: false };
  doc.setIn(["initiatives", idx, "current_phase"], strNode(doc, phase));
  return { content: String(doc), found: true };
}

export interface WaveItemUpsertFields {
  /**
   * Opcional de propósito: `undefined` faz upsert SEM tocar no `status`
   * atual — é o caso de uma aprovação humana (`humanApprovedAt`), que nunca
   * deve sobrescrever o status que o agente já reportou.
   */
  status?: string;
  repo?: string;
  completedAt?: string;
  artifacts?: string[];
  summary?: string;
  commit?: string;
  knownBugsPinned?: string[];
  mergeBlock?: string;
  /** Carimbo de aprovação HUMANA — distinto do `status` do agente (ver `WaveItemStatusEntry.human_approved_at`). */
  humanApprovedAt?: string;
  /** Motivo de `blocked`, `failed` ou `cancelled` (ADR-0022). Mesma regra de `InitiativeUpsertFields.reason`. */
  reason?: string;
  /**
   * Marca o item como gate que exige aprovação humana antes de contar como
   * fechado (ver `WaveItemStatusEntry.requires_approval`) — raro, opt-in.
   * `undefined` não toca no campo (upsert normal); só `true`/`false`
   * explícitos escrevem.
   */
  requiresApproval?: boolean;
}

/**
 * Upsert de `wave_status.<wave>.<item>` (ou `epic_status.<epic>.<task>`,
 * ADR-0006, quando `group: "epic"`) para uma iniciativa — a operação
 * central do Maestro ao agregar relatórios de execução. O item entra como
 * filho DIRETO da onda (sem wrapper `items:` — `toWaveStatusEntry` em
 * `initiatives-contract.pure.ts` trata qualquer chave da onda que não seja
 * `status/completed_at/artifacts/note` como um item; um `items:` literal
 * quebraria esse parse). Cria `<group>_status`/`<wave>` conforme necessário,
 * um nível de cada vez. `found: false` se a iniciativa não existir.
 * `group` default `"wave"` — retrocompat total, todo chamador existente
 * continua escrevendo em `wave_status` exatamente como antes.
 */
export function upsertWaveItem(
  content: string,
  initiativeId: string,
  wave: string,
  item: string,
  fields: WaveItemUpsertFields,
  group: "wave" | "epic" = "wave"
): { content: string; found: boolean } {
  const doc = loadDoc(content);
  const idx = findInitiativeIndex(doc, initiativeId);
  if (idx === -1) return { content, found: false };

  const statusField = `${group}_status`;
  const initPath: (string | number)[] = ["initiatives", idx];
  ensureCollectionAt(doc, [...initPath, statusField]);
  const wavePath = [...initPath, statusField, wave];
  ensureCollectionAt(doc, wavePath);
  const itemPath = [...wavePath, item];
  ensureCollectionAt(doc, itemPath);

  if (fields.status) doc.setIn([...itemPath, "status"], strNode(doc, fields.status));
  setReason(doc, itemPath, fields.status, fields.reason);
  if (fields.repo) doc.setIn([...itemPath, "repo"], strNode(doc, fields.repo));
  if (fields.completedAt) doc.setIn([...itemPath, "completed_at"], strNode(doc, fields.completedAt));
  if (fields.artifacts && fields.artifacts.length > 0) doc.setIn([...itemPath, "artifacts"], blockNode(doc, fields.artifacts));
  if (fields.summary) doc.setIn([...itemPath, "summary"], strNode(doc, fields.summary));
  if (fields.commit) doc.setIn([...itemPath, "commit"], strNode(doc, fields.commit));
  if (fields.knownBugsPinned && fields.knownBugsPinned.length > 0) {
    doc.setIn([...itemPath, "known_bugs_pinned"], blockNode(doc, fields.knownBugsPinned));
  }
  if (fields.mergeBlock) doc.setIn([...itemPath, "merge_block"], strNode(doc, fields.mergeBlock));
  if (fields.humanApprovedAt) doc.setIn([...itemPath, "human_approved_at"], strNode(doc, fields.humanApprovedAt));
  if (fields.requiresApproval !== undefined) doc.setIn([...itemPath, "requires_approval"], blockNode(doc, fields.requiresApproval));

  return { content: String(doc), found: true };
}

export interface InitiativeGateApprovalFields {
  status: string;
  approvedAt: string;
  /** Carimbo da aprovação registrada como decisão humana (G2, ADR-0024 proposta). */
  humanApprovedAt: string;
  by?: string;
  note?: string;
}

/**
 * Registra a aprovação de um gate da iniciativa (`gate_d2`/`gate_d3`), com
 * merge estrutural: só os campos informados mudam; o resto da entrada (e de
 * um gate já gravado, como um `note` antigo) fica. `found:false` se a
 * iniciativa não existir.
 */
export function upsertInitiativeGate(
  content: string,
  initiativeId: string,
  gateKey: "gate_d2" | "gate_d3",
  fields: InitiativeGateApprovalFields
): { content: string; found: boolean } {
  const doc = loadDoc(content);
  const idx = findInitiativeIndex(doc, initiativeId);
  if (idx === -1) return { content, found: false };
  const gatePath = ["initiatives", idx, gateKey];
  ensureCollectionAt(doc, gatePath);
  doc.setIn([...gatePath, "status"], strNode(doc, fields.status));
  doc.setIn([...gatePath, "approved_at"], strNode(doc, fields.approvedAt));
  doc.setIn([...gatePath, "human_approved_at"], strNode(doc, fields.humanApprovedAt));
  if (fields.by) doc.setIn([...gatePath, "by"], strNode(doc, fields.by));
  if (fields.note) doc.setIn([...gatePath, "note"], strNode(doc, fields.note));
  return { content: String(doc), found: true };
}
