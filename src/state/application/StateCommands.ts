/**
 * StateCommands.ts — os casos de uso de escrita de estado, num lugar só
 * (ADR-0017, F3.3; análise §2.8, passos SS2/SS3).
 *
 * Antes, cada verbo existia duas vezes: no State Service
 * (`StateServiceServer._write*`, validação → repositório → evento → envelope)
 * e no fallback do CLI (`cli/commands/*.ts`). As duas cópias compartilhavam só
 * as primitivas de `core/validation`. Agora os dois adaptadores (e o MCP, via
 * HTTP) chamam estes métodos e só traduzem o resultado para o seu meio:
 *
 * - `{ ok: true, body }`: `body` é o envelope de sucesso exato, já com `ok`
 *   (o CLI imprime numa linha, o servidor devolve 200);
 * - `{ ok: false, error }`: `FieldError` de validação ou `*_NOT_FOUND` (o CLI
 *   devolve exit 1, o servidor 400/404);
 * - exceção (fs, lock, YAML que a escrita quebraria): propaga. O CLI responde
 *   `INTERNAL` (exit 2) e o servidor 500, como antes.
 *
 * A validação segue a ordem e as mensagens de sempre. O evento de escrita
 * (`artifact-written`, item 3.2 do `mod-state-service`) é publicado pelo
 * `onWrite` injetado, só depois de uma escrita bem-sucedida; o CLI não
 * injeta nenhum, como antes.
 *
 * Eventos agent-activity (F5.2, contrato §4: "fonte principal e independente
 * de harness"): toda escrita bem-sucedida também grava um `RunEvent` em
 * `runs/*.jsonl`, pelo `recordEvent` injetado (o CLI e o State Service
 * injetam `appendRunEvent`, sob lock), antes de devolver o resultado:
 *
 * | Escrita                                   | Evento             |
 * |-------------------------------------------|--------------------|
 * | iniciativa, ativa, fase da iniciativa     | `artifact-written` |
 * | tarefa (item de onda/épico), com o status | `artifact-written` com `task_id` |
 * | fase e checklist do delivery-state        | `artifact-written` com `phase_id` |
 * | aprovação de gate                         | `gate-approved`, `actor: human`, `by` |
 *
 * Mudança de status vira `artifact-written` (o arquivo de estado mudou), não
 * `agent-started`/`agent-done`/`blocked`: o vocabulário fechado não tem um
 * evento de "terminou sem pedir aprovação", e um início sem fim pareado
 * deixaria abelha e contador presos no Cockpit (`deriveActivity`). O status
 * da tarefa vem do estado gravado, que o mapa lê (`deriveColmeia`); o evento
 * é o sinal de "mudou agora" e o registro na atividade recente. Uma falha ao
 * gravar o evento é logada e não desfaz a escrita de estado.
 */
import type { StateRepository } from "../repository/StateRepository";
import { resolveDeliveryStateScope } from "../repository/delivery-state-scope";
import {
  validateBooleanFlag,
  validateOptionalEnum,
  validatePathSegmentId,
  validatePhaseId,
  validateRequiredEnum,
  validateRequiredFlag,
  validateStatusReason,
  type FieldError,
  type FieldResult,
} from "../../core/validation/validation";
import { GATE_IDS, INITIATIVE_KINDS, INITIATIVE_MODES, INITIATIVE_STATUSES } from "../../core/contracts/initiatives-contract.pure";
import { DELIVERY_PHASE_STATUSES } from "../../core/contracts/delivery-state-contract.pure";
import { gateClosure, WORK_STATUSES } from "../../core/contracts/work-status.pure";
import { executionGateItems } from "../../core/plans/work-status-view";
import { d1Readiness, d2Readiness } from "../../core/plans/gate-readiness";
import { canonicalDeliveryPhaseId } from "../../core/methodology/phase-catalog.pure";
import type { ApproverNameSource } from "../identity/git-user-name";
import type { AppendedRunEvent } from "../runs/run-event-log";
import type { RunEvent, RunEventHarness } from "../../core/contracts/run-events-contract.pure";
import { AGENT_RUN_EVENT_TYPES, validateRunEvent } from "../../core/contracts/agent-activity.pure";
import { BRAND } from "../../core/brand/brand.pure";
import * as nodePath from "path";

/** Envelope de sucesso, exatamente como o CLI imprime e o servidor devolve. As escritas trazem `changed`; as leituras (G2), o dado lido. */
export type StateCommandBody = { ok: true; path: string } & Record<string, unknown>;

export type StateCommandResult = { ok: true; body: StateCommandBody } | { ok: false; error: FieldError };

/** Avisa uma escrita bem-sucedida (o State Service publica `artifact-written` no `EventBus`). */
export type StateWriteListener = (message: string, phaseId: string | undefined, metadata: Record<string, unknown>) => void;

export interface StateCommandsOptions {
  /** Raiz do workspace. */
  root: string;
  repository: StateRepository;
  onWrite?: StateWriteListener;
  /** Relógio (ISO 8601) da aprovação de gate quando o chamador não informa a data. Default: agora. */
  now?: () => string;
  /**
   * Quem aprova quando o chamador não informa `by` (ADR-0024, decisão 2): o
   * `user.name` do git do workspace (`gitUserName`). Ausente ou `null` = a
   * aprovação pede o nome (`MISSING_FLAG`, `field: "by"`).
   */
  approverName?: ApproverNameSource;
  /**
   * Grava um evento agent-activity depois de cada escrita bem-sucedida (F5.2).
   * O CLI e o State Service injetam `appendRunEvent`. Ausente = não grava.
   */
  recordEvent?: (root: string, event: unknown) => Promise<FieldResult<AppendedRunEvent>>;
  /** Por onde o evento foi capturado: `cli` no fallback do CLI; ausente no State Service, que não sabe quem chamou o HTTP. */
  harness?: RunEventHarness;
}

/** `run_id` dos eventos gravados pelo estado: não há um "run" de agente por trás de uma escrita avulsa. */
export const STATE_RUN_ID = "state-commands";

/**
 * Evento de agente para `runs append` (CLI, que os hooks do kit chamam), o
 * `POST /runs/append` e a tool MCP `append_run_event` (F5.2). Os nomes são
 * os campos do contrato agent-activity. `reason` vira `metadata.reason`.
 * Sem `by`: agente não registra decisão humana.
 */
export interface AppendRunEventCommand {
  event_type?: string;
  agent_id?: string;
  phase_id?: string;
  initiative_id?: string;
  task_id?: string;
  repo_id?: string;
  /** Relativo à raiz do workspace. Um caminho absoluto DENTRO do workspace é convertido; fora dele, recusado. */
  artifact_path?: string;
  harness?: string;
  actor?: string;
  message?: string;
  reason?: string;
  /** Ausente: `r-<AAAAMMDD>` do dia do evento. */
  run_id?: string;
  /** Ausente: agora (ISO 8601). */
  timestamp?: string;
}

/**
 * Decisão humana (F5.2): o diálogo de decisão do Cockpit (F4.2) registra por
 * aqui. Grava `decision-made` com `actor: human` e `by` (o nome informado ou
 * o `user.name` do git do workspace; nunca o e-mail). A chave que apaga a
 * guarda do mapa é a mesma do pedido: `task_id`, ou `metadata.task`.
 */
export interface RecordDecisionCommand {
  initiativeId?: string;
  taskId?: string;
  phaseId?: string;
  /** O que foi decidido, curto (cortado em 140 caracteres). */
  message?: string;
  reason?: string;
  /** Quem decidiu: sobrescreve o `user.name` do git. */
  by?: string;
}

/** Escopo de gate: D1 é por repositório; D2 e D3, por iniciativa (G2). */
export interface GateCommand {
  gate: string | undefined;
  initiativeId?: string;
  repoId?: string;
}

export interface ApproveGateCommand extends GateCommand {
  /** Data da aprovação (ISO 8601). Ausente = agora. */
  at?: string;
  /** Quem aprova: sobrescrita explícita. Ausente = `user.name` do git do workspace (ADR-0024). */
  by?: string;
  note?: string;
}

/**
 * Erro de uso quando ninguém disse quem aprova e o git do workspace não tem
 * `user.name` (ADR-0024, decisão 2). O CLI pede `--by`; o Cockpit (F4.2) usa
 * `field: "by"` para perguntar o nome. Mesmo código das flags obrigatórias.
 */
export const APPROVER_REQUIRED_ERROR: FieldError = {
  code: "MISSING_FLAG",
  message: "flag obrigatória ausente: --by (o git do workspace não tem user.name; diga o nome de quem aprova)",
  field: "by",
};

export interface UpsertInitiativeCommand {
  id: string | undefined;
  name?: string;
  status?: string;
  stream?: string;
  currentPhase?: string;
  mode?: string;
  type?: string;
  owner?: string;
  priority?: string;
  createdAt?: string;
  /** Motivo (ADR-0022): obrigatório com `status: cancelled`. */
  reason?: string;
  setActive: boolean;
}

export interface UpsertWaveItemCommand {
  id: string;
  wave: string;
  item: string;
  status: string | undefined;
  repo?: string;
  completedAt?: string;
  artifacts?: string[];
  summary?: string;
  commit?: string;
  knownBugsPinned?: string[];
  mergeBlock?: string;
  requiresApproval?: boolean;
  /** Motivo (ADR-0022): obrigatório com `blocked`, `failed` e `cancelled`. */
  reason?: string;
  group: "wave" | "epic";
}

/** `global` é `unknown` de propósito: só `=== true` conta (ver `resolveDeliveryStateScope`). */
export interface DeliveryScopeCommand {
  global: unknown;
  initiativeId?: string;
}

export interface UpsertDeliveryPhaseCommand extends DeliveryScopeCommand {
  phase: string | undefined;
  status: string | undefined;
  /** Motivo (ADR-0022): obrigatório com `blocked`, `failed` e `cancelled`. */
  reason?: string;
  agent?: string;
  completedAt?: string;
  artifacts?: string[];
}

export interface UpsertDeliveryChecklistCommand extends DeliveryScopeCommand {
  phase: string | undefined;
  item: string | undefined;
  /** `true`/`false` de verdade (HTTP, CLI já validado) ou a string `"true"`/`"false"`. */
  checked: unknown;
  section?: string;
}

/**
 * Booleano vindo de JSON (`true`/`false`) ou de flag de terminal (`"true"`/`"false"`),
 * com a mesma regra e mensagem de `validateBooleanFlag`.
 */
function validateBooleanInput(field: string, value: unknown): FieldResult<boolean> {
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") return validateBooleanFlag(field, value);
  return { ok: false, error: { code: "MISSING_FLAG", message: `flag obrigatória ausente: --${field}`, field } };
}

function fail(error: FieldError): StateCommandResult {
  return { ok: false, error };
}

function initiativeNotFound(id: string): StateCommandResult {
  return fail({ code: "INITIATIVE_NOT_FOUND", message: `iniciativa '${id}' não existe em initiatives.yaml`, id });
}

function repoNotFound(repo: string): StateCommandResult {
  return fail({ code: "REPO_NOT_FOUND", message: `repositório '${repo}' não existe em assessment/foundation-state.yaml`, repo });
}

export class StateCommands {
  constructor(private readonly _options: StateCommandsOptions) {}

  private _written(message: string, phaseId: string | undefined, metadata: Record<string, unknown>): void {
    this._options.onWrite?.(message, phaseId, metadata);
  }

  /** Caminho do arquivo de estado relativo à raiz do workspace, com `/` (o `artifact_path` do contrato: nunca conteúdo). */
  private _relative(absolutePath: string): string {
    return nodePath.relative(this._options.root, absolutePath).split(nodePath.sep).join("/");
  }

  /** Grava o evento agent-activity de uma escrita que já deu certo. Nunca lança: falha vira log. */
  private async _emit(fields: Record<string, unknown>): Promise<void> {
    const record = this._options.recordEvent;
    if (!record) return;
    const event = {
      run_id: STATE_RUN_ID,
      timestamp: new Date().toISOString(),
      ...(this._options.harness ? { harness: this._options.harness } : {}),
      ...fields,
    };
    try {
      const result = await record(this._options.root, event);
      if (!result.ok) console.error(`[${BRAND.name}] evento de estado não gravado: ${result.error.message}`);
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao gravar o evento de estado em runs/:`, err);
    }
  }

  /** `initiatives create` · `POST /initiatives` · tool `upsert_initiative`. */
  async upsertInitiative(input: UpsertInitiativeCommand): Promise<StateCommandResult> {
    const id = validateRequiredFlag("id", input.id);
    if (!id.ok) return fail(id.error);
    const idSegment = validatePathSegmentId("id", id.value);
    if (!idSegment.ok) return fail(idSegment.error);
    const status = validateOptionalEnum("status", input.status, INITIATIVE_STATUSES);
    if (!status.ok) return fail(status.error);
    const mode = validateOptionalEnum("mode", input.mode, INITIATIVE_MODES);
    if (!mode.ok) return fail(mode.error);
    const type = validateOptionalEnum("type", input.type, INITIATIVE_KINDS);
    if (!type.ok) return fail(type.error);
    const reason = validateStatusReason(status.value, input.reason);
    if (!reason.ok) return fail(reason.error);

    const { path, changed } = await this._options.repository.upsertInitiativeAtomic(this._options.root, {
      id: id.value,
      name: input.name,
      status: status.value,
      stream: input.stream,
      currentPhase: input.currentPhase,
      mode: mode.value,
      type: type.value,
      owner: input.owner,
      priority: input.priority,
      createdAt: input.createdAt,
      reason: reason.value,
      setActive: input.setActive,
    });
    this._written(`iniciativa '${id.value}' criada/atualizada`, undefined, { endpoint: "initiatives", id: id.value, changed, path });
    await this._emit({
      event_type: "artifact-written",
      initiative_id: id.value,
      artifact_path: this._relative(path),
      message: `iniciativa '${id.value}' criada/atualizada${status.value ? ` (${status.value})` : ""}`,
      ...(reason.value ? { metadata: { reason: reason.value } } : {}),
    });
    return { ok: true, body: { ok: true, path, changed, id: id.value } };
  }

  /** `initiatives switch-active` · `POST /initiatives/:id/switch-active` · tool `switch_active_initiative`. */
  async switchActiveInitiative(input: { id: string | undefined }): Promise<StateCommandResult> {
    const id = validateRequiredFlag("id", input.id);
    if (!id.ok) return fail(id.error);
    const idSegment = validatePathSegmentId("id", id.value);
    if (!idSegment.ok) return fail(idSegment.error);

    const { path, changed } = await this._options.repository.switchActiveInitiativeAtomic(this._options.root, id.value);
    this._written(`iniciativa ativa trocada para '${id.value}'`, undefined, { endpoint: "initiatives/switch-active", id: id.value, changed, path });
    await this._emit({ event_type: "artifact-written", initiative_id: id.value, artifact_path: this._relative(path), message: `iniciativa ativa trocada para '${id.value}'` });
    return { ok: true, body: { ok: true, path, changed, id: id.value } };
  }

  /** `initiatives bump-phase` · `POST /initiatives/:id/bump-phase` · tool `bump_initiative_phase`. */
  async bumpInitiativePhase(input: { id: string; phase: string | undefined }): Promise<StateCommandResult> {
    const phase = validateRequiredFlag("phase", input.phase);
    if (!phase.ok) return fail(phase.error);

    const { path, changed, found } = await this._options.repository.bumpInitiativePhaseAtomic(this._options.root, input.id, phase.value);
    if (!found) return initiativeNotFound(input.id);
    this._written(`iniciativa '${input.id}' avançou pra fase '${phase.value}'`, phase.value, {
      endpoint: "initiatives/bump-phase",
      id: input.id,
      phase: phase.value,
      changed,
      path,
    });
    await this._emit({
      event_type: "artifact-written",
      initiative_id: input.id,
      phase_id: phase.value,
      artifact_path: this._relative(path),
      message: `iniciativa '${input.id}' avançou para a fase '${phase.value}'`,
    });
    return { ok: true, body: { ok: true, path, changed, id: input.id, phase: phase.value } };
  }

  /** `initiatives upsert-wave-item` · `POST /initiatives/:id/wave-items/:wave/:item` · tool `upsert_wave_item`. */
  async upsertWaveItem(input: UpsertWaveItemCommand): Promise<StateCommandResult> {
    // ADR-0022 §4: o item de onda deixa de aceitar texto livre.
    const status = validateRequiredEnum("status", input.status, WORK_STATUSES);
    if (!status.ok) return fail(status.error);
    const reason = validateStatusReason(status.value, input.reason);
    if (!reason.ok) return fail(reason.error);

    const { id, wave, item } = input;
    const { path, changed, found } = await this._options.repository.upsertWaveItemAtomic(
      this._options.root,
      id,
      wave,
      item,
      {
        status: status.value,
        repo: input.repo,
        completedAt: input.completedAt,
        artifacts: input.artifacts,
        summary: input.summary,
        commit: input.commit,
        knownBugsPinned: input.knownBugsPinned,
        mergeBlock: input.mergeBlock,
        requiresApproval: input.requiresApproval,
        reason: reason.value,
      },
      input.group
    );
    if (!found) return initiativeNotFound(id);
    this._written(`wave item '${wave}/${item}' atualizado (${status.value})`, undefined, {
      endpoint: "initiatives/wave-items",
      id,
      wave,
      item,
      status: status.value,
      changed,
      path,
    });
    const taskId = `${wave}/${item}`;
    await this._emit({
      event_type: "artifact-written",
      initiative_id: id,
      task_id: taskId,
      ...(input.repo ? { repo_id: input.repo } : {}),
      artifact_path: this._relative(path),
      message: `tarefa '${taskId}' → ${status.value}`,
      metadata: { task: taskId, ...(reason.value ? { reason: reason.value } : {}) },
    });
    return { ok: true, body: { ok: true, path, changed, id, wave, item, status: status.value } };
  }

  /** `delivery-state upsert-phase` · `POST /delivery-state/upsert-phase` · tool `upsert_delivery_phase`. */
  async upsertDeliveryPhase(input: UpsertDeliveryPhaseCommand): Promise<StateCommandResult> {
    const scope = resolveDeliveryStateScope(this._options.repository, this._options.root, input.global, input.initiativeId);
    if (!scope.ok) return fail(scope.error);
    const phase = validateRequiredFlag("phase", input.phase);
    if (!phase.ok) return fail(phase.error);
    const phaseId = validatePhaseId("phase", phase.value);
    if (!phaseId.ok) return fail(phaseId.error);
    const status = validateRequiredEnum("status", input.status, DELIVERY_PHASE_STATUSES);
    if (!status.ok) return fail(status.error);
    const reason = validateStatusReason(status.value, input.reason);
    if (!reason.ok) return fail(reason.error);

    const { changed } = await this._options.repository.upsertDeliveryPhaseAtomic(scope.path, phase.value, {
      status: status.value,
      reason: reason.value,
      agent: input.agent,
      completedAt: input.completedAt,
      artifacts: input.artifacts,
    });
    this._written(`fase '${phase.value}' do delivery-state atualizada (${status.value})`, phase.value, {
      endpoint: "delivery-state/upsert-phase",
      phase: phase.value,
      status: status.value,
      changed,
      path: scope.path,
    });
    await this._emit({
      event_type: "artifact-written",
      ...(input.global === true ? {} : { initiative_id: input.initiativeId }),
      phase_id: phase.value,
      ...(input.agent ? { agent_id: input.agent } : {}),
      artifact_path: this._relative(scope.path),
      message: `fase '${phase.value}' → ${status.value}`,
      ...(reason.value ? { metadata: { reason: reason.value } } : {}),
    });
    return { ok: true, body: { ok: true, path: scope.path, changed, phase: phase.value, status: status.value } };
  }

  /** `delivery-state upsert-checklist` · `POST /delivery-state/upsert-checklist` · tool `upsert_delivery_checklist_item`. */
  async upsertDeliveryChecklistItem(input: UpsertDeliveryChecklistCommand): Promise<StateCommandResult> {
    const scope = resolveDeliveryStateScope(this._options.repository, this._options.root, input.global, input.initiativeId);
    if (!scope.ok) return fail(scope.error);
    const phase = validateRequiredFlag("phase", input.phase);
    if (!phase.ok) return fail(phase.error);
    const phaseId = validatePhaseId("phase", phase.value);
    if (!phaseId.ok) return fail(phaseId.error);
    const item = validateRequiredFlag("item", input.item);
    if (!item.ok) return fail(item.error);
    const checked = validateBooleanInput("checked", input.checked);
    if (!checked.ok) return fail(checked.error);
    const section = input.section ?? "human_checklist";

    const { changed } = await this._options.repository.upsertDeliveryChecklistItemAtomic(scope.path, phase.value, item.value, checked.value, section);
    this._written(`checklist '${item.value}' da fase '${phase.value}' atualizado (${String(checked.value)})`, phase.value, {
      endpoint: "delivery-state/upsert-checklist",
      phase: phase.value,
      item: item.value,
      checked: checked.value,
      changed,
      path: scope.path,
    });
    await this._emit({
      event_type: "artifact-written",
      ...(input.global === true ? {} : { initiative_id: input.initiativeId }),
      phase_id: phase.value,
      artifact_path: this._relative(scope.path),
      message: `checklist '${item.value}' da fase '${phase.value}' ${checked.value ? "marcado" : "desmarcado"}`,
    });
    return { ok: true, body: { ok: true, path: scope.path, changed, phase: phase.value, item: item.value, checked: checked.value } };
  }

  // ── Eventos de agente (F5.2): `runs append`, `POST /runs/append`, tool `append_run_event` ──

  /**
   * Monta e valida o evento de um agente, sem gravar: tipo de agente (nunca de
   * decisão humana), `run_id` e horário quando faltam, o harness deste
   * adaptador quando o chamador não diz, e o validador da lista fechada. O CLI
   * chama antes da rede, para o mesmo erro rápido com ou sem State Service.
   */
  prepareRunEvent(input: AppendRunEventCommand): FieldResult<RunEvent> {
    const type = validateRequiredEnum("event_type", input.event_type, AGENT_RUN_EVENT_TYPES);
    if (!type.ok) return type;
    const now = new Date();
    const optional = (field: keyof AppendRunEventCommand, value: string | undefined): Record<string, string> =>
      value !== undefined && value !== "" ? { [field]: value } : {};
    const harness = input.harness ?? this._options.harness;
    return validateRunEvent({
      run_id: input.run_id ?? `r-${now.toISOString().slice(0, 10).replace(/-/g, "")}`,
      event_type: type.value,
      timestamp: input.timestamp ?? now.toISOString(),
      ...optional("initiative_id", input.initiative_id),
      ...optional("task_id", input.task_id),
      ...optional("phase_id", input.phase_id),
      ...optional("agent_id", input.agent_id),
      ...optional("repo_id", input.repo_id),
      ...optional("artifact_path", input.artifact_path !== undefined ? this._workspaceRelative(input.artifact_path) : undefined),
      ...optional("actor", input.actor),
      ...optional("harness", harness),
      ...optional("message", input.message),
      ...(input.reason !== undefined && input.reason.trim() !== "" ? { metadata: { reason: input.reason } } : {}),
    });
  }

  /** Grava o evento de um agente em `runs/<iniciativa>.jsonl`, sob lock. Devolve `{ ok, path, event }`. */
  async appendRunEvent(input: AppendRunEventCommand): Promise<StateCommandResult> {
    const prepared = this.prepareRunEvent(input);
    if (!prepared.ok) return fail(prepared.error);
    const record = this._options.recordEvent;
    if (!record) throw new Error("StateCommands sem recordEvent: o adaptador precisa injetar appendRunEvent");
    const result = await record(this._options.root, prepared.value);
    if (!result.ok) return fail(result.error);
    return { ok: true, body: { ok: true, path: result.value.path, event: result.value.event } };
  }

  /**
   * Registra uma decisão humana como `decision-made` (F5.2). Sem nome de quem
   * decide, o mesmo erro de uso do gate (`MISSING_FLAG`, `field: "by"`), para
   * o Cockpit perguntar. Não é canal de agente: nem o CLI `runs append` nem a
   * tool MCP chegam aqui (ADR-0024).
   */
  async recordDecision(input: RecordDecisionCommand): Promise<StateCommandResult> {
    const by = await this._resolveApprover(input.by);
    if (!by.ok) return fail(by.error);
    const record = this._options.recordEvent;
    if (!record) throw new Error("StateCommands sem recordEvent: o adaptador precisa injetar appendRunEvent");
    const result = await record(this._options.root, {
      run_id: STATE_RUN_ID,
      event_type: "decision-made",
      timestamp: new Date().toISOString(),
      ...(input.initiativeId ? { initiative_id: input.initiativeId } : {}),
      ...(input.taskId ? { task_id: input.taskId } : {}),
      ...(input.phaseId ? { phase_id: input.phaseId } : {}),
      actor: "human",
      by: by.value,
      ...(this._options.harness ? { harness: this._options.harness } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.reason?.trim() ? { metadata: { reason: input.reason } } : {}),
    });
    if (!result.ok) return fail(result.error);
    return { ok: true, body: { ok: true, path: result.value.path, event: result.value.event } };
  }

  /** Caminho absoluto dentro do workspace vira relativo (o hook do Claude Code manda o absoluto); qualquer outro volta como veio, para o validador decidir. */
  private _workspaceRelative(artifactPath: string): string {
    if (!nodePath.isAbsolute(artifactPath)) return artifactPath;
    const rel = nodePath.relative(this._options.root, artifactPath);
    if (rel === "" || rel.startsWith("..") || nodePath.isAbsolute(rel)) return artifactPath;
    return rel.split(nodePath.sep).join("/");
  }

  // ── Leitura (G2): o mesmo dado de `GET /initiatives` e `GET /delivery-state`, no envelope do CLI ──

  /** `initiatives get` sem `--id`: o registro inteiro (`state: null` sem iniciativas). */
  readInitiatives(): StateCommandResult {
    const path = this._options.repository.initiativesPath(this._options.root);
    return { ok: true, body: { ok: true, path, state: this._options.repository.loadInitiativesState(this._options.root) } };
  }

  /** `initiatives get --id <id>`: uma iniciativa; `INITIATIVE_NOT_FOUND` se não existir. */
  readInitiative(input: { id: string | undefined }): StateCommandResult {
    const id = validateRequiredFlag("id", input.id);
    if (!id.ok) return fail(id.error);
    const path = this._options.repository.initiativesPath(this._options.root);
    const initiative = this._options.repository.loadInitiativesState(this._options.root)?.initiatives.find((i) => i.id === id.value);
    if (!initiative) return initiativeNotFound(id.value);
    return { ok: true, body: { ok: true, path, initiative } };
  }

  /** `delivery-state get (--global | --initiative <id>) [--phase <id>]`. Alias de fase resolve para o id canônico. */
  readDeliveryState(input: DeliveryScopeCommand & { phase?: string }): StateCommandResult {
    const scope = resolveDeliveryStateScope(this._options.repository, this._options.root, input.global, input.initiativeId);
    if (!scope.ok) return fail(scope.error);
    const state = this._options.repository.loadDeliveryState(this._options.root, input.global === true ? undefined : input.initiativeId);
    if (input.phase === undefined) return { ok: true, body: { ok: true, path: scope.path, state } };

    const phaseId = validatePhaseId("phase", input.phase);
    if (!phaseId.ok) return fail(phaseId.error);
    const canonical = canonicalDeliveryPhaseId(phaseId.value);
    const phase = state?.phases[canonical];
    if (!phase) {
      return fail({ code: "PHASE_NOT_FOUND", message: `fase '${phaseId.value}' não existe em ${scope.path}`, phase: phaseId.value });
    }
    return { ok: true, body: { ok: true, path: scope.path, phase: canonical, state: phase } };
  }

  /** `gates get --gate d1 --repo <id>` ou `--gate d2|d3 --initiative <id>`. `record: null` = gate ainda não registrado. */
  readGate(input: GateCommand): StateCommandResult {
    const gate = validateRequiredEnum("gate", input.gate, GATE_IDS);
    if (!gate.ok) return fail(gate.error);
    const repo = this._options.repository;

    if (gate.value === "d1") {
      const repoId = validateRequiredFlag("repo", input.repoId);
      if (!repoId.ok) return fail(repoId.error);
      const entry = repo.loadFoundationState(this._options.root)?.repos[repoId.value];
      if (!entry) return repoNotFound(repoId.value);
      return { ok: true, body: { ok: true, path: repo.foundationStatePath(this._options.root), gate: "d1", repo: repoId.value, record: entry.gate_d1 } };
    }

    const initiativeId = validateRequiredFlag("initiative", input.initiativeId);
    if (!initiativeId.ok) return fail(initiativeId.error);
    const initiative = repo.loadInitiativesState(this._options.root)?.initiatives.find((i) => i.id === initiativeId.value);
    if (!initiative) return initiativeNotFound(initiativeId.value);
    const record = (gate.value === "d2" ? initiative.gate_d2 : initiative.gate_d3) ?? null;
    return { ok: true, body: { ok: true, path: repo.initiativesPath(this._options.root), gate: gate.value, initiative: initiativeId.value, record } };
  }

  // ── Gates (G2): aprovação humana registrada ─────────────────────────────

  /**
   * `gates approve`: grava `status: approved`, `approved_at`, `human_approved_at`
   * e `by` (e `note`, se vier), sob lock.
   *
   * Ordem (ADR-0024, decisões do titular): gate e escopo válidos → o repo ou a
   * iniciativa existe → quem aprova (o `by` explícito ou o `user.name` do git)
   * → regra de fechamento (D1: fases do Foundation do repo concluídas; D2:
   * `roadmap_gate` e `risk_matrix_gate` aprovados; D3: itens de execução
   * fechados, ADR-0022) → escrita. Fora disso, erro de uso no envelope de
   * sempre, com a lista do que falta em `open`.
   */
  async approveGate(input: ApproveGateCommand): Promise<StateCommandResult> {
    const gate = validateRequiredEnum("gate", input.gate, GATE_IDS);
    if (!gate.ok) return fail(gate.error);
    const at = input.at ?? this._options.now?.() ?? new Date().toISOString();
    const repository = this._options.repository;
    const root = this._options.root;

    if (gate.value === "d1") {
      const repoId = validateRequiredFlag("repo", input.repoId);
      if (!repoId.ok) return fail(repoId.error);
      const foundation = repository.loadFoundationState(root);
      if (!foundation?.repos[repoId.value]) return repoNotFound(repoId.value);
      const by = await this._resolveApprover(input.by);
      if (!by.ok) return fail(by.error);

      const repoEntry = repository.loadReposInventory(root)?.repos.find((r) => r.id === repoId.value);
      const readiness = d1Readiness(foundation, repoId.value, repoEntry);
      if (!readiness.closed) {
        const open = readiness.open.map((r) => ({ phase: r.key, status: r.status }));
        return fail({
          code: "GATE_NOT_CLOSED",
          message: `o Gate D1 de '${repoId.value}' tem fase do Foundation não concluída: ${open.map((p) => `${p.phase} (${p.status})`).join(", ")}`,
          gate: "d1",
          repo: repoId.value,
          open,
        });
      }

      const { path, changed, found } = await repository.approveGateD1Atomic(root, repoId.value, { at, by: by.value, note: input.note });
      if (!found) return repoNotFound(repoId.value);
      this._written(`Gate D1 de '${repoId.value}' aprovado`, undefined, { endpoint: "gates/approve", gate: "d1", repo: repoId.value, changed, path });
      await this._emitGateApproved("d1", { repo_id: repoId.value }, by.value, path, `Gate D1 de '${repoId.value}' aprovado`);
      return { ok: true, body: { ok: true, path, changed, gate: "d1", repo: repoId.value, human_approved_at: at, by: by.value } };
    }

    const initiativeId = validateRequiredFlag("initiative", input.initiativeId);
    if (!initiativeId.ok) return fail(initiativeId.error);
    const initiative = repository.loadInitiativesState(root)?.initiatives.find((i) => i.id === initiativeId.value);
    if (!initiative) return initiativeNotFound(initiativeId.value);
    const by = await this._resolveApprover(input.by);
    if (!by.ok) return fail(by.error);

    if (gate.value === "d2") {
      const readiness = d2Readiness(initiative);
      if (!readiness.closed) {
        const open = readiness.open.map((r) => ({ gate: r.key, status: r.status }));
        return fail({
          code: "GATE_NOT_CLOSED",
          message: `o Gate D2 de '${initiativeId.value}' exige roadmap_gate e risk_matrix_gate aprovados; falta: ${open.map((g) => `${g.gate} (${g.status})`).join(", ")}`,
          gate: "d2",
          initiative: initiativeId.value,
          open,
        });
      }
    }

    // ADR-0022 §3: o D3 só aprova com todo item de execução fechado (done, skipped ou cancelled),
    // e a aprovação lista cada cancelado com o motivo. blocked e failed sempre impedem.
    let cancelled: Array<{ item: string; reason?: string }> | undefined;
    if (gate.value === "d3") {
      const closure = gateClosure(executionGateItems(initiative));
      if (!closure.closed) {
        const open = closure.open.map((i) => ({ item: i.key, status: i.status, ...(i.reason ? { reason: i.reason } : {}) }));
        return fail({
          code: "GATE_NOT_CLOSED",
          message: `o Gate D3 de '${initiativeId.value}' tem item aberto: ${open.map((i) => `${i.item} (${i.status})`).join(", ")}`,
          gate: "d3",
          initiative: initiativeId.value,
          open,
        });
      }
      cancelled = closure.cancelled.map((i) => ({ item: i.key, ...(i.reason ? { reason: i.reason } : {}) }));
    }

    const approval = { at, by: by.value, note: input.note };
    const { path, changed, found } = await repository.approveInitiativeGateAtomic(root, initiativeId.value, gate.value, approval);
    if (!found) return initiativeNotFound(initiativeId.value);
    this._written(`Gate ${gate.value.toUpperCase()} de '${initiativeId.value}' aprovado`, undefined, {
      endpoint: "gates/approve",
      gate: gate.value,
      initiative: initiativeId.value,
      changed,
      path,
    });
    await this._emitGateApproved(gate.value, { initiative_id: initiativeId.value }, by.value, path, `Gate ${gate.value.toUpperCase()} de '${initiativeId.value}' aprovado`);
    return {
      ok: true,
      body: { ok: true, path, changed, gate: gate.value, initiative: initiativeId.value, human_approved_at: at, by: by.value, ...(cancelled ? { cancelled } : {}) },
    };
  }

  /** `gate-approved` com quem aprovou (só o nome) e `actor: human`: gate é decisão humana (ADR-0024). */
  private _emitGateApproved(gate: string, scope: Record<string, string>, by: string, filePath: string, message: string): Promise<void> {
    return this._emit({ event_type: "gate-approved", ...scope, phase_id: `gate-${gate}`, artifact_path: this._relative(filePath), actor: "human", by, message });
  }

  /** O `by` explícito (sem espaços nas pontas) ou o nome que a porta devolve; sem nenhum, o pedido do nome. */
  private async _resolveApprover(by: string | undefined): Promise<FieldResult<string>> {
    const explicit = by?.trim();
    if (explicit) return { ok: true, value: explicit };
    const fromGit = (await this._options.approverName?.(this._options.root))?.trim();
    if (fromGit) return { ok: true, value: fromGit };
    return { ok: false, error: APPROVER_REQUIRED_ERROR };
  }
}
