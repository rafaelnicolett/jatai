/**
 * initiatives-contract.pure.ts
 *
 * Registro multi-iniciativa (`initiatives.yaml`).
 *
 * Um workspace pode ter mais de uma iniciativa de delivery em paralelo (uma
 * `modernization`, uma `new-feature`, etc.) — este arquivo é o registro de
 * quais existem, qual está ativa (o pill-switcher do Cockpit troca este
 * campo), e o progresso resumido de cada uma.
 *
 * Extraído de tipos e de um parser regex que viviam privados dentro de
 * `CockpitController.ts` — reescrito para seguir o mesmo padrão dos outros
 * módulos de `src/data/` (parse via `js-yaml`, validação com `errors[]`, zero
 * `fs`/`path`, seguro para o bundle do webview). `loadInitiatives` (que toca
 * disco) vive em `initiatives-contract.ts`, que re-exporta este módulo por
 * inteiro.
 */

import * as yaml from "js-yaml";
import { loadStateYaml } from "./state-yaml.shared.pure";
import { isClosedStatus, readWorkStatus, type UNKNOWN_STATUS } from "./work-status.pure";

/** Path canônico do registro, relativo à raiz do workspace. */
export const INITIATIVES_PATH = [".github", "artifacts", "initiatives.yaml"] as const;
export const INITIATIVES_REL = INITIATIVES_PATH.join("/");

/** `cancelled` (ADR-0022): terminal, decisão humana, exige `reason`. O bloqueio de uma iniciativa é derivado dos itens dela, não é status próprio. */
export type InitiativeStatus = "planned" | "in-progress" | "done" | "paused" | "cancelled";
export type InitiativeMode = "greenfield" | "brownfield";
/** `feature` é o default implícito (campo ausente) — as demais mudam qual visão de Progresso o Cockpit renderiza. */
export type InitiativeKind = "feature" | "modernization" | "hotfix" | "foundation";

/** Espelhos runtime dos unions acima — fonte de validação pro CLI `helyx-state` (recusa valor fora do enum, diferente do parser abaixo, que degrada). */
export const INITIATIVE_STATUSES = ["planned", "in-progress", "done", "paused", "cancelled"] as const;
export const INITIATIVE_MODES = ["greenfield", "brownfield"] as const;
export const INITIATIVE_KINDS = ["feature", "modernization", "hotfix", "foundation"] as const;

/**
 * Template padrão de `waves` para `type: hotfix` (ADR-0001,
 * `docs/adr/0001-fluxos-de-delivery-por-tipo-de-iniciativa.md`) — as mesmas
 * 3 fases que qualquer bug reportado passa na prática: entender a causa
 * raiz e o escopo antes de mexer em código, corrigir com characterization
 * tests (regra de ouro do CLAUDE.md), confirmar que resolveu sem
 * regressão. Reaproveita o MESMO mecanismo de `waves`/`wave_status` que
 * `modernization` já usa — nenhum campo novo no schema.
 *
 * Sem isto, uma iniciativa `hotfix` registrada sem `waves:` cai na
 * escadaria genérica de 16 fases (Business Brief → ... → Sustentação), que
 * não faz sentido pra ela e nunca fecha — foi exatamente o erro cometido
 * ao registrar `hotfix-cockpit-sidebar-routing` antes desta iniciativa
 * existir. Use como ponto de partida; ajuste o texto conforme o bug real,
 * mas mantenha as 3 ondas.
 */
export const HOTFIX_WAVE_TEMPLATE = [
  "wave-1: Diagnóstico — causa raiz e escopo do bug, antes de qualquer mudança de código",
  "wave-2: Fix + Testes — correção com characterization tests cobrindo o comportamento corrigido",
  "wave-3: Validação — confirma que resolveu, sem regressão, no ambiente real",
] as const;

/**
 * Mesmo template acima, vocabulário `epic-N` — usado quando
 * `helyx.deliveryHierarchy` está em `"epic-feature-backlog-task"`
 * (ADR-0006/ADR-0007). `HOTFIX_WAVE_TEMPLATE` NUNCA é removido nem alterado —
 * retrocompatibilidade permanente com iniciativas hotfix já registradas.
 */
export const HOTFIX_EPIC_TEMPLATE = [
  "epic-1: Diagnóstico — causa raiz e escopo do bug, antes de qualquer mudança de código",
  "epic-2: Fix + Testes — correção com characterization tests cobrindo o comportamento corrigido",
  "epic-3: Validação — confirma que resolveu, sem regressão, no ambiente real",
] as const;

export interface Initiative {
  id: string;
  name: string;
  mode?: InitiativeMode;
  /** `unknown` só na leitura, para texto fora do vocabulário (ADR-0022 §5), com o original em `status_text`. */
  status: InitiativeStatus | typeof UNKNOWN_STATUS;
  status_text?: string;
  /** Motivo do `cancelled` (ADR-0022). */
  reason?: string;
  stream?: string;
  current_phase?: string;
  owner?: string;
  created_at?: string;
  priority?: string;
  /** Onda de rollout — só ordena prioridade entre iniciativas, não bloqueia nada sozinha. */
  wave?: number;
  /** IDs de outras iniciativas que devem estar concluídas antes desta. */
  depends_on?: string[];
  /** Caminhos de artefatos já produzidos por esta iniciativa. */
  artifacts?: string[];
  /** Nota de contexto livre — o que já foi decidido/produzido, lido pelo humano. */
  context?: string;
  /** Ausente = `feature` (fluxo padrão de 16 fases). `@modernization-planner` escreve `modernization`. */
  type?: InitiativeKind;
  /** Só `modernization` — ids de repositório que esta iniciativa toca/trava (nunca global). */
  scope?: string[];
  /** Só `modernization` — arquitetura-alvo declarada AQUI, nunca em `repos.yaml` (que só guarda fato descoberto). */
  arch_target?: string;
  /** Só `modernization` — achados (ids de débito) que justificam a modernização; nunca proposta sem isto. */
  driven_by?: string[];
  /** Só `modernization` — ondas do roadmap incremental, texto livre tipicamente "wave-N: descrição". */
  waves?: string[];
  /**
   * Equivalente a `waves`, vocabulário `epic-N` (ADR-0006). Aditivo — nunca
   * escrito na mesma iniciativa que `waves`; qual dos dois existe depende de
   * `helyx.deliveryHierarchy` no momento em que a iniciativa foi criada. Uma
   * iniciativa satisfaz o requisito de "tem waves preenchido" (ver
   * `parseInitiativesYaml`) com QUALQUER um dos dois.
   */
  epics?: string[];
  /**
   * Sinal de que a iniciativa passou por um gate de Planning (roadmap +
   * risk-matrix + ADRs) antes da Execution — independente do `type`. Uma
   * `feature` que exige migração de schema (`migration_strategy:
   * expand-contract`) pode usar exatamente o mesmo fluxo de Planning que uma
   * `modernization`, sem ser uma. Ver `hasPlanningGate`.
   */
  roadmap_gate?: PlanningGateStatus;
  risk_matrix_gate?: PlanningGateStatus;
  gate_d2?: PlanningGateStatus;
  /** Gate D3 (Execution → Operation), mesmo formato do `gate_d2` (G2, ADR-0024 proposta). Não conta como gate de Planning. */
  gate_d3?: PlanningGateStatus;
  /** Caminhos dos artefatos de Planning (roadmap, risk-matrix, ADRs) — abertos via `openFile`. */
  planning_artifacts?: string[];
  /** Estratégia de migração declarada no Planning (ex.: `expand-contract`) — nunca em `repos.yaml`. */
  migration_strategy?: string;
  /**
   * Status de Execution por onda, chave `wave-N` (mesmo índice de `waves`).
   * Sem isto, `waves` é só uma lista de rótulos estáticos — nenhuma onda
   * nunca aparece como concluída/em andamento, mesmo com Execution real
   * acontecendo. Chaves fora do padrão `wave-N` (ex.: `wave-4-pendente-
   * negocio`) são preservadas no mapa mas não têm onda correspondente em
   * `waves` pra exibir — nunca fabricado, só o que o agente escreveu.
   */
  wave_status?: Record<string, WaveStatusEntry>;
  /** Equivalente a `wave_status`, chave `epic-N` (ADR-0006) — mesmo parser (`toWaveStatusMap`), mesma semântica de derivação item-a-item. Aditivo, nunca substitui `wave_status`. */
  epic_status?: Record<string, EpicStatusEntry>;
}

/**
 * Alias de `WaveItemStatusEntry`/`WaveStatusEntry` — mesmo shape, vocabulário
 * novo (ADR-0006). Alias, não cópia: uma única implementação de parsing serve
 * os dois nomes, evitando repetir o erro já catalogado em D16/D17 (duas
 * implementações da mesma regra divergindo silenciosamente).
 */
export type TaskStatusEntry = WaveItemStatusEntry;
/** Ver `TaskStatusEntry`. */
export type EpicStatusEntry = WaveStatusEntry;

export interface PlanningGateStatus {
  status: string;
  approved_at?: string;
  note?: string;
  /** Carimbo da aprovação registrada como decisão humana (`jatai-state gates approve`, G2), distinto do `approved_at` que um agente pode gravar. */
  human_approved_at?: string;
  /** Quem aprovou, quando informado. */
  by?: string;
}

/** Os gates da metodologia brownfield que o CLI lê e aprova (G2): D1 por repositório, D2 e D3 por iniciativa. */
export const GATE_IDS = ["d1", "d2", "d3"] as const;
export type GateId = (typeof GATE_IDS)[number];

/**
 * Status de UM item dentro de uma onda (ex.: `item-1.1`, `item-1.2-1.3-1.5`)
 * — a granularidade real que o Maestro escreve ao agregar relatórios de
 * `@test-backfill-agent`/`@migration-agent`/`@refactor-agent`/`@feature-adder`.
 * Campos além de `status` são só o que já foi observado em uso real; nenhum
 * é obrigatório além dele — tolerante a itens mais simples.
 */
export interface WaveItemStatusEntry {
  status: string;
  repo?: string;
  completed_at?: string;
  artifacts?: string[];
  summary?: string;
  commit?: string;
  known_bugs_pinned?: string[];
  merge_block?: string;
  side_finding?: string;
  /**
   * Distinto de `status` (o agente reporta `done`) — este é o carimbo de
   * quando um HUMANO aprovou o item dentro do Cockpit. Mesma separação
   * status-do-agente vs. `human_checklist` já usada em `delivery-state.yaml`;
   * sem isto, "aprovar" não teria onde persistir.
   */
  human_approved_at?: string;
  /** Motivo de `blocked`, `failed` ou `cancelled` (ADR-0022). O `status` do item usa o vocabulário de trabalho na escrita. */
  reason?: string;
  /**
   * Marca este item como um GATE que exige aprovação humana explícita antes
   * de contar como fechado — ausente/`false` (o padrão, e o caso de quase
   * todo item de execução comum) nunca mostra o botão "Aprovar" no Cockpit,
   * mesmo com `status: "done"`. Distinto de aprovação no nível de
   * onda/iniciativa (`roadmap_gate`/`risk_matrix_gate`/`gate_d2`), que já
   * cobre o caso comum de sign-off de Planning; isto aqui é granularidade de
   * ITEM, reservada pro raro item que precisa de sign-off humano próprio
   * (ver `helyx-state initiatives upsert-wave-item --requires-approval`).
   */
  requires_approval?: boolean;
}

export interface WaveStatusEntry {
  /**
   * Sempre presente — escrito diretamente pelo agente (formato "plano",
   * ex.: `mod-android-to-flutter`) OU derivado de `items` quando ausente
   * (`done` só se TODOS os itens estiverem `done`, senão `in-progress`).
   * Nunca fabricado do nada: só existe quando há `status` explícito ou
   * pelo menos um item válido.
   */
  status: string;
  completed_at?: string;
  artifacts?: string[];
  note?: string;
  /** Granularidade item-a-item dentro da onda, quando o agente escreve nesse formato (ver `WaveItemStatusEntry`). */
  items?: Record<string, WaveItemStatusEntry>;
}

/** Forma comum consumida por `ModernizationSidebar`/`ModernizationWaveDetail` — uma linha de `parseWaveLabel` + status real, quando existir. */
export interface ModernizationWaveEntry {
  index: number | null;
  label: string;
  raw: string;
  status?: WaveStatusEntry;
}

export interface InitiativesState {
  version?: number;
  /** id da iniciativa ativa — o pill-switcher do Cockpit troca este campo. */
  active: string;
  initiatives: Initiative[];
}

// ADR-0022 §5: texto fora do vocabulário vira "unknown" (antes: "planned"), com o original preservado.
function toStatus(raw: unknown, statusText?: unknown): { status: InitiativeStatus | typeof UNKNOWN_STATUS; text?: string } {
  return readWorkStatus(raw, INITIATIVE_STATUSES, "planned", statusText);
}

function toMode(raw: unknown): InitiativeMode | undefined {
  const v = String(raw ?? "").trim();
  return v === "greenfield" || v === "brownfield" ? v : undefined;
}

function toKind(raw: unknown): InitiativeKind | undefined {
  const v = String(raw ?? "").trim();
  return v === "modernization" || v === "hotfix" || v === "foundation" || v === "feature" ? v : undefined;
}

function toGateStatus(raw: unknown): PlanningGateStatus | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as Record<string, unknown>;
  if (typeof g.status !== "string" || !g.status.trim()) return undefined;
  return {
    status: g.status.trim(),
    ...(typeof g.approved_at === "string" ? { approved_at: g.approved_at.trim() } : {}),
    ...(typeof g.note === "string" ? { note: g.note.trim() } : {}),
    ...(typeof g.human_approved_at === "string" ? { human_approved_at: g.human_approved_at.trim() } : {}),
    ...(typeof g.by === "string" ? { by: g.by.trim() } : {}),
  };
}

const WAVE_STATUS_OWN_FIELDS = new Set(["status", "completed_at", "artifacts", "note", "reason"]);

function toWaveItemStatus(raw: unknown): WaveItemStatusEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.status !== "string" || !v.status.trim()) return undefined;
  const artifacts = Array.isArray(v.artifacts) ? v.artifacts.filter((a): a is string => typeof a === "string") : undefined;
  const knownBugs = Array.isArray(v.known_bugs_pinned) ? v.known_bugs_pinned.filter((a): a is string => typeof a === "string") : undefined;
  return {
    status: v.status.trim(),
    ...(typeof v.repo === "string" ? { repo: v.repo.trim() } : {}),
    ...(typeof v.completed_at === "string" ? { completed_at: v.completed_at.trim() } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
    ...(typeof v.summary === "string" ? { summary: v.summary.trim() } : {}),
    ...(typeof v.commit === "string" ? { commit: v.commit.trim() } : {}),
    ...(knownBugs && knownBugs.length > 0 ? { known_bugs_pinned: knownBugs } : {}),
    ...(typeof v.merge_block === "string" ? { merge_block: v.merge_block.trim() } : {}),
    ...(typeof v.side_finding === "string" ? { side_finding: v.side_finding.trim() } : {}),
    ...(typeof v.human_approved_at === "string" ? { human_approved_at: v.human_approved_at.trim() } : {}),
    ...(typeof v.reason === "string" && v.reason.trim() ? { reason: v.reason.trim() } : {}),
    ...(v.requires_approval === true ? { requires_approval: true } : {}),
  };
}

/**
 * Uma entrada de `wave_status.<wave-N>` vem em 2 formatos reais, ambos
 * válidos: "plano" (`mod-android-to-flutter` — `status` direto na onda) ou
 * "item-a-item" (`feat-multi-loja-pre-pago` — cada chave sob a onda é
 * um item do roadmap com seu próprio `status`). Sem `status` explícito na
 * onda, deriva de `items`: só `done` se TODOS os itens forem `done`.
 *
 * M3: o formato do MODELO (`items:` como invólucro dos itens, o JSON do
 * Cockpit) também é lido. Invólucro é o mapa `items` sem `status` próprio;
 * um item que se chama `items` e tem `status` continua sendo um item. Se o
 * mesmo id aparecer nos dois lugares, vale o filho direto (o formato do arquivo).
 */
function toWaveStatusEntry(raw: unknown): WaveStatusEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;

  const items: Record<string, WaveItemStatusEntry> = {};
  const wrapped = v.items;
  const isWrapper = !!wrapped && typeof wrapped === "object" && !Array.isArray(wrapped) && toWaveItemStatus(wrapped) === undefined;
  if (isWrapper) {
    for (const [key, value] of Object.entries(wrapped as Record<string, unknown>)) {
      const item = toWaveItemStatus(value);
      if (item) items[key] = item;
    }
  }
  for (const [key, value] of Object.entries(v)) {
    if (WAVE_STATUS_OWN_FIELDS.has(key) || (isWrapper && key === "items")) continue;
    const item = toWaveItemStatus(value);
    if (item) items[key] = item;
  }
  const hasItems = Object.keys(items).length > 0;
  const flatStatus = typeof v.status === "string" && v.status.trim() ? v.status.trim() : undefined;

  if (!flatStatus && !hasItems) return undefined;

  const artifacts = Array.isArray(v.artifacts) ? v.artifacts.filter((a): a is string => typeof a === "string") : undefined;
  return {
    // ADR-0022 §3: a onda fecha quando todo item está fechado (done, skipped ou cancelled).
    status: flatStatus ?? (Object.values(items).every((i) => isClosedStatus(i.status)) ? "done" : "in-progress"),
    ...(typeof v.completed_at === "string" ? { completed_at: v.completed_at.trim() } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
    ...(typeof v.note === "string" ? { note: v.note.trim() } : {}),
    ...(hasItems ? { items } : {}),
  };
}

/**
 * Tolerante por natureza — o Maestro agrega relatórios de execução em prosa
 * livre, nunca falha por chave/formato inesperado. Uma onda que é um mapa mas
 * não tem `status` nem item com `status` é descartada e reportada em
 * `onDropped` (M3): antes sumia sem aviso nenhum.
 */
function toWaveStatusMap(raw: unknown, onDropped?: (key: string) => void): Record<string, WaveStatusEntry> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: Record<string, WaveStatusEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = toWaveStatusEntry(value);
    if (entry) result[key] = entry;
    else if (value && typeof value === "object" && !Array.isArray(value)) onDropped?.(key);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `status` (e `status_text`, se desconhecido) e `reason` de uma iniciativa. */
function statusFields(raw: unknown, reason: unknown, statusText: unknown): Pick<Initiative, "status" | "status_text" | "reason"> {
  const status = toStatus(raw, statusText);
  return {
    status: status.status,
    ...(status.text !== undefined ? { status_text: status.text } : {}),
    ...(typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : {}),
  };
}

/**
 * `waves` reais tendem a vir como `"wave-1: characterization tests..."` —
 * extrai o número quando dá, mas nunca descarta o texto se o formato variar
 * (o `@modernization-planner` escreve prosa livre, não um schema rígido).
 * Também aceita `"epic-1: ..."` (ADR-0006, campo `epics`) — mesma regra,
 * vocabulário novo; aditivo, nenhum texto que já batia com `wave-N` deixa de
 * bater.
 */
export function parseWaveLabel(raw: string): { index: number | null; label: string } {
  const m = raw.match(/^\s*(?:wave|epic)[-\s]?(\d+)\s*[:-]\s*(.+)$/i);
  if (!m) return { index: null, label: raw.trim() };
  return { index: Number(m[1]), label: m[2]!.trim() };
}

export interface ParsedWaveContent {
  title: string;
  /** Itens entre parênteses, ex.: "fundação (item1, item2, item3)" — cada um vira um chip no infográfico da onda. */
  items: string[];
  /** Texto depois de "—", tipicamente um risco ou pré-requisito — nunca um item comum. */
  note?: string;
}

/**
 * `@modernization-planner` costuma escrever `"Título (item1, item2, ...) —
 * nota"` — extrai essa estrutura pra render de infográfico. Formato livre,
 * então nunca falha: sem parênteses, devolve o texto inteiro como título e
 * lista de itens vazia (o card cai pra prosa simples).
 */
export function parseWaveContent(label: string): ParsedWaveContent {
  const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*(?:[—-]\s*(.+))?$/);
  if (!m) return { title: label.trim(), items: [] };
  const items = m[2]!.split(",").map((s) => s.trim()).filter(Boolean);
  return { title: m[1]!.trim(), items, ...(m[3] ? { note: m[3].trim() } : {}) };
}

/**
 * Parseia o `initiatives.yaml`. Entradas sem `id` ou com `id` duplicado são
 * descartadas e reportadas — um `id` duplicado faria o pill-switcher e o
 * `switchInitiative` apontarem para a iniciativa errada.
 *
 * Sem nenhuma iniciativa válida, devolve `state: null` — mantém o
 * comportamento original (o registro só existe quando tem conteúdo).
 */
export function parseInitiativesYaml(raw: string): { state: InitiativesState | null; errors: string[] } {
  const errors: string[] = [];

  let doc: unknown;
  try {
    doc = loadStateYaml(raw);
  } catch (err) {
    return { state: null, errors: [`YAML inválido: ${(err as Error).message}`] };
  }

  if (!doc || typeof doc !== "object") return { state: null, errors };
  const root = doc as { version?: unknown; active?: unknown; initiatives?: unknown };
  if (!Array.isArray(root.initiatives)) return { state: null, errors };

  const initiatives: Initiative[] = [];
  const seen = new Set<string>();

  for (const [i, item] of root.initiatives.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`initiatives[${i}]: entrada não é um objeto`);
      continue;
    }
    const it = item as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id.trim() : "";

    if (!id) { errors.push(`initiatives[${i}]: 'id' ausente`); continue; }
    if (seen.has(id)) { errors.push(`initiatives[${i}]: id '${id}' duplicado`); continue; }
    seen.add(id);

    const mode = toMode(it.mode);
    const kind = toKind(it.type);
    const dependsOn = Array.isArray(it.depends_on) ? it.depends_on.filter((v): v is string => typeof v === "string") : undefined;
    const artifacts = Array.isArray(it.artifacts) ? it.artifacts.filter((v): v is string => typeof v === "string") : undefined;
    const scope = Array.isArray(it.scope) ? it.scope.filter((v): v is string => typeof v === "string") : undefined;
    const drivenBy = Array.isArray(it.driven_by) ? it.driven_by.filter((v): v is string => typeof v === "string") : undefined;
    const waves = Array.isArray(it.waves) ? it.waves.filter((v): v is string => typeof v === "string") : undefined;
    const epics = Array.isArray(it.epics) ? it.epics.filter((v): v is string => typeof v === "string") : undefined;
    const planningArtifacts = Array.isArray(it.planning_artifacts)
      ? it.planning_artifacts.filter((v): v is string => typeof v === "string")
      : undefined;
    const roadmapGate = toGateStatus(it.roadmap_gate);
    const riskMatrixGate = toGateStatus(it.risk_matrix_gate);
    const gateD2 = toGateStatus(it.gate_d2);
    const gateD3 = toGateStatus(it.gate_d3);
    const droppedWave = (field: string) => (key: string): void => {
      errors.push(`initiatives[${i}] (${id}): ${field}.${key} não tem 'status' nem item com 'status' — a onda foi ignorada`);
    };
    const waveStatus = toWaveStatusMap(it.wave_status, droppedWave("wave_status"));
    const epicStatus = toWaveStatusMap(it.epic_status, droppedWave("epic_status"));
    initiatives.push({
      id,
      name: typeof it.name === "string" && it.name.trim() ? it.name.trim() : id,
      ...statusFields(it.status, it.reason, it.status_text),
      ...(mode ? { mode } : {}),
      ...(typeof it.stream === "string" ? { stream: it.stream.trim() } : {}),
      ...(typeof it.current_phase === "string" ? { current_phase: it.current_phase.trim() } : {}),
      ...(typeof it.owner === "string" ? { owner: it.owner.trim() } : {}),
      ...(typeof it.created_at === "string" ? { created_at: it.created_at.trim() } : {}),
      ...(typeof it.priority === "string" ? { priority: it.priority.trim() } : {}),
      ...(typeof it.wave === "number" ? { wave: it.wave } : {}),
      ...(dependsOn && dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
      ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
      ...(typeof it.context === "string" && it.context.trim() ? { context: it.context.trim() } : {}),
      ...(kind ? { type: kind } : {}),
      ...(scope && scope.length > 0 ? { scope } : {}),
      ...(typeof it.arch_target === "string" && it.arch_target.trim() ? { arch_target: it.arch_target.trim() } : {}),
      ...(drivenBy && drivenBy.length > 0 ? { driven_by: drivenBy } : {}),
      ...(waves && waves.length > 0 ? { waves } : {}),
      ...(epics && epics.length > 0 ? { epics } : {}),
      ...(planningArtifacts && planningArtifacts.length > 0 ? { planning_artifacts: planningArtifacts } : {}),
      ...(typeof it.migration_strategy === "string" && it.migration_strategy.trim() ? { migration_strategy: it.migration_strategy.trim() } : {}),
      ...(roadmapGate ? { roadmap_gate: roadmapGate } : {}),
      ...(riskMatrixGate ? { risk_matrix_gate: riskMatrixGate } : {}),
      ...(gateD2 ? { gate_d2: gateD2 } : {}),
      ...(gateD3 ? { gate_d3: gateD3 } : {}),
      ...(waveStatus ? { wave_status: waveStatus } : {}),
      ...(epicStatus ? { epic_status: epicStatus } : {}),
    });

    // Checagem estrutural, não só de convenção do agente: `hasPlanningGate` decide o layout
    // de Progresso independente do `type` (ver DeliveryProgress.tsx) — sem `waves`, a barra
    // lateral de ondas simplesmente não aparece, mesmo com todos os gates aprovados. Pega o
    // gap não importa quem escreveu o YAML (agente ou edição manual), sem depender de nenhum
    // agente lembrar de preencher o campo.
    const hasWavesOrEpics = (waves && waves.length > 0) || (epics && epics.length > 0);
    if (hasPlanningGate(initiatives[initiatives.length - 1]) && !hasWavesOrEpics) {
      errors.push(
        `initiatives[${i}] (${id}): tem gate de Planning (roadmap_gate/risk_matrix_gate/gate_d2/planning_artifacts) mas 'waves'/'epics' estão vazios — a barra lateral de ondas do Progresso não vai aparecer até isso ser preenchido`
      );
    }
  }

  if (initiatives.length === 0) return { state: null, errors };

  // Sem `active` declarado, a primeira iniciativa listada assume o posto —
  // nunca deixa o pill-switcher sem nenhuma selecionada.
  const activeRaw = typeof root.active === "string" ? root.active.trim() : "";
  const active = activeRaw || initiatives[0]!.id;

  return {
    state: {
      active,
      initiatives,
      ...(typeof root.version === "number" ? { version: root.version } : {}),
    },
    errors,
  };
}

/** A entrada da iniciativa ativa, ou `undefined` se o registro não tiver nenhuma. */
export function activeInitiative(state: InitiativesState | null): Initiative | undefined {
  return state?.initiatives.find((i) => i.id === state.active);
}

/**
 * Lê UM escalar YAML inline (o texto depois de `chave:` numa linha) como
 * texto: `"x"`, `'x'`, `x` e `x # comentário` dão `x`. Esquema FAILSAFE, sem
 * tipos (`2026` continua `"2026"`). Vazio, coleção ou YAML inválido: `null`.
 */
export function readInlineYamlString(text: string): string | null {
  let doc: unknown;
  try {
    doc = yaml.load(`v: ${text}`, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    return null;
  }
  const value = doc && typeof doc === "object" ? (doc as { v?: unknown }).v : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * O `active:` de TOPO do `initiatives.yaml`, lido como YAML (C2 / H-BUG-02).
 * O writer do CLI grava `active: "id"`; os leitores por regex
 * (`/^active:\s*(\S+)/`) guardavam as aspas e montavam `initiatives/"id"/`,
 * enquanto o Cockpit e os agentes usam `initiatives/id/`.
 *
 * Mesmo esquema FAILSAFE de `readInlineYamlString`. Se outro trecho do
 * documento não for YAML válido, lê só a linha `active:` (os leitores antigos
 * toleravam isso).
 *
 * Sem `active:`, vazio ou nulo (`null`, `~`): a mesma iniciativa que o
 * Cockpit mostra, a primeira listada (`parseInitiativesYaml`). Antes os
 * leitores do caminho humano caíam no arquivo global e `active: null` virava
 * o id `"null"` (achado da F6.1). `null` só quando não há iniciativa nenhuma:
 * aí o chamador cai no caminho global, como o Cockpit.
 */
export function readActiveInitiativeId(raw: string): string | null {
  const activeLine = raw.match(/^active:(.*)$/m)?.[1];
  let doc: unknown;
  try {
    doc = yaml.load(raw, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    return activeLine !== undefined && !isYamlNullScalar(activeLine) ? readInlineYamlString(activeLine) : null;
  }
  const active = doc && typeof doc === "object" && !Array.isArray(doc) ? (doc as { active?: unknown }).active : undefined;
  if (typeof active === "string" && active.trim() && !(activeLine !== undefined && isYamlNullScalar(activeLine))) return active.trim();
  return parseInitiativesYaml(raw).state?.active ?? null;
}

/** O escalar inline é o nulo do YAML (`null`, `Null`, `NULL`, `~`, vazio)? `"null"` entre aspas é texto. */
function isYamlNullScalar(text: string): boolean {
  try {
    const doc = yaml.load(`v: ${text}`) as { v?: unknown } | null;
    return !!doc && typeof doc === "object" && doc.v === null;
  } catch {
    return false;
  }
}

/**
 * Iniciativa passou por um gate de Planning (roadmap + risk-matrix + ADRs)
 * antes da Execution — verdade pra qualquer `type` que reaproveitou esse
 * fluxo (`@modernization-planner` não escreve só pra `type: modernization`;
 * uma `feature` que exige migração de schema usa o mesmo Planning sem virar
 * uma modernização de arquitetura). A escadaria genérica de 16 fases
 * (business→product→...→sustain) não faz sentido pra essas — elas pulam
 * direto de Foundation pra Planning pra Execution por ondas.
 */
export function hasPlanningGate(initiative: Initiative | null | undefined): boolean {
  if (!initiative) return false;
  return Boolean(
    initiative.gate_d2 || initiative.roadmap_gate || initiative.risk_matrix_gate || (initiative.planning_artifacts && initiative.planning_artifacts.length > 0)
  );
}
