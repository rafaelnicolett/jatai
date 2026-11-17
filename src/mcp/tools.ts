/**
 * tools.ts
 *
 * As tools MCP do servidor: 3 de leitura (item 2.4, roadmap
 * `mod-state-service`) 1:1 com os 3 endpoints `GET` do State Service, 6 de
 * escrita (item 3.3) 1:1 com os 6 endpoints `POST` que o item 3.1 criou no
 * `StateServiceServer`, e `append_run_event` (F5.2) 1:1 com `POST
 * /runs/append`. Nenhuma tool aprova gate (ADR-0024). Cada tool só chama `state-service-client.ts`
 * (leitura) ou `../server/state-service-write-client.ts` (escrita) — a
 * única coisa que fala HTTP com o State Service (ver ADR-0004) — e formata
 * o `CallToolResult`. Nenhuma tool escreve YAML direto nem chama a API fora
 * dessas duas fronteiras.
 */
import * as z from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkStateServiceHealth, getDeliveryState, getInitiatives, type StateServiceClientOptions, type StateServiceEnvelope } from "./state-service-client";
import {
  bumpInitiativePhase,
  switchActiveInitiative,
  upsertDeliveryChecklistItem,
  upsertDeliveryPhase,
  upsertInitiative,
  upsertWaveItem,
  postRunEvent,
  type RunEventInput,
  type StateServiceWriteClientOptions,
  type StateServiceWriteEnvelope,
} from "../state/client/state-service-client";
import { INITIATIVE_KINDS, INITIATIVE_MODES, INITIATIVE_STATUSES } from "../data/initiatives-contract.pure";
import { DELIVERY_PHASE_STATUSES } from "../data/delivery-state-contract.pure";
import { WORK_STATUSES } from "../core/contracts/work-status.pure";
import { AGENT_RUN_EVENT_TYPES, RUN_EVENT_ID_MAX } from "../core/contracts/agent-activity.pure";
import { RUN_EVENT_ACTORS, RUN_EVENT_HARNESSES, RUN_EVENT_MESSAGE_MAX } from "../core/contracts/run-events-contract.pure";
import { BRAND } from "../data/brand.pure";

interface ToolCallResult<Envelope extends { ok: boolean } = StateServiceEnvelope> {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Envelope;
  isError: boolean;
}

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  outputSchema?: Record<string, z.ZodTypeAny>;
}

const envelopeOutputShape = {
  ok: z.boolean(),
  state: z.unknown().optional(),
  error: z.string().optional(),
};

function toCallToolResult(envelope: StateServiceEnvelope): ToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope,
    isError: !envelope.ok,
  };
}

/** Mesma forma de `toCallToolResult`, para o envelope de ESCRITA (`{ok, path?, changed?, ...}` / `{ok:false, error}`) — nunca lança, `isError` reflete `!envelope.ok` igual às tools de leitura. */
function toWriteCallToolResult(envelope: StateServiceWriteEnvelope): ToolCallResult<StateServiceWriteEnvelope> {
  return {
    content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    structuredContent: envelope,
    isError: !envelope.ok,
  };
}

/** Shape de output comum às 6 tools de escrita — a união dos campos que qualquer um dos 6 endpoints pode devolver (varia por endpoint; campos que não se aplicam simplesmente não vêm). `error` é `z.unknown()` porque tanto pode ser a `STATE_SERVICE_NOT_RUNNING_ERROR` (string, sintetizada pelo client) quanto o `FieldError` (`{code,message,field?}`) ou a string `UNAUTHORIZED_ERROR` que o State Service já devolve. */
const writeEnvelopeOutputShape = {
  ok: z.boolean(),
  path: z.string().optional(),
  changed: z.boolean().optional(),
  id: z.string().optional(),
  wave: z.string().optional(),
  item: z.string().optional(),
  phase: z.string().optional(),
  status: z.string().optional(),
  checked: z.boolean().optional(),
  error: z.unknown().optional(),
};

/** Saída de `append_run_event`: o envelope do `POST /runs/append` (`{ ok, path, event }` ou `{ ok: false, error }`). */
const runEventOutputShape = {
  ok: z.boolean(),
  path: z.string().optional(),
  event: z.record(z.unknown()).optional(),
  error: z.unknown().optional(),
};

/**
 * Wrapper fino sobre `McpServer.registerTool`.
 *
 * ACHADO (não corrigido, fora de escopo — só documentado): com a versão de
 * TypeScript hoje resolvida neste monorepo (5.9.3, pré-existente no
 * `package-lock.json`, não alterada por esta mudança), a resolução dos
 * overloads genéricos de `registerTool`/`tool` do SDK 1.30 estoura
 * `TS2589 "Type instantiation is excessively deep"` mesmo com um schema
 * trivial (`{ foo: z.string().optional() }`) — reproduzido isoladamente e
 * comprovado que a MESMA chamada compila limpa em TypeScript 5.5.4 (a
 * versão que o próprio SDK usa no CI dele). O cast (`unknown`, nunca
 * `any` — `no-explicit-any` é `error` no ESLint deste repo) fica isolado
 * aqui, num único ponto; todo o resto do módulo (schemas Zod, assinatura
 * dos handlers, formato de retorno) continua 100% tipado.
 */
function registerTool<Args extends Record<string, unknown>, Result extends ToolCallResult<{ ok: boolean }> = ToolCallResult>(
  server: McpServer,
  name: string,
  config: ToolConfig,
  handler: (args: Args) => Promise<Result>,
): void {
  (server.registerTool as unknown as (n: string, c: unknown, h: unknown) => void)(name, config, handler);
}

/** Registra as 3 tools no `McpServer` fornecido. `options` é injetável para teste (root/fetch/readInfo). */
export function registerStateServiceTools(server: McpServer, options?: StateServiceClientOptions): void {
  registerTool<Record<string, unknown>>(
    server,
    "get_initiatives",
    {
      title: "Get Initiatives",
      description:
        "Lê o registro completo de iniciativas do State Service local (GET /initiatives) — a mesma fonte usada pelo Cockpit. Não aceita parâmetros.",
      inputSchema: {},
      outputSchema: envelopeOutputShape,
    },
    async () => toCallToolResult(await getInitiatives(options)),
  );

  registerTool<{ initiativeId?: string }>(
    server,
    "get_delivery_state",
    {
      title: "Get Delivery State",
      description:
        "Lê o delivery-state do State Service local (GET /delivery-state). Sem initiativeId, devolve o delivery-state global; com initiativeId, devolve o da iniciativa.",
      inputSchema: {
        initiativeId: z.string().optional().describe("ID da iniciativa; se omitido, devolve o delivery-state global"),
      },
      outputSchema: envelopeOutputShape,
    },
    async (args) => toCallToolResult(await getDeliveryState(args.initiativeId, options)),
  );

  registerTool<Record<string, unknown>>(
    server,
    "check_state_service_health",
    {
      title: "Check State Service Health",
      description: "Verifica se o State Service local está no ar (GET /health). Não aceita parâmetros.",
      inputSchema: {},
      outputSchema: { ok: z.boolean(), error: z.string().optional() },
    },
    async () => toCallToolResult(await checkStateServiceHealth(options)),
  );

  const writeOptions: StateServiceWriteClientOptions | undefined = options;

  registerTool(
    server,
    "upsert_initiative",
    {
      title: "Upsert Initiative",
      description:
        `Cria ou atualiza uma iniciativa em initiatives.yaml via State Service (POST /initiatives) — mesmo motor de escrita do \`${BRAND.cliName} initiatives create\`. Campos omitidos não são alterados (upsert parcial); \`active: true\` também marca a iniciativa como ativa.`,
      inputSchema: {
        id: z.string().describe("ID da iniciativa (obrigatório)"),
        name: z.string().optional(),
        status: z.enum(INITIATIVE_STATUSES).optional(),
        stream: z.string().optional(),
        currentPhase: z.string().optional(),
        mode: z.enum(INITIATIVE_MODES).optional(),
        type: z.enum(INITIATIVE_KINDS).optional(),
        owner: z.string().optional(),
        priority: z.string().optional(),
        createdAt: z.string().optional(),
        reason: z.string().optional().describe("Motivo, obrigatório com status cancelled (ADR-0022)"),
        active: z.boolean().optional().describe("Se true, também troca a iniciativa ativa (setActive)"),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: {
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
      reason?: string;
      active?: boolean;
    }) => toWriteCallToolResult(await upsertInitiative(args, writeOptions)),
  );

  registerTool(
    server,
    "switch_active_initiative",
    {
      title: "Switch Active Initiative",
      description:
        `Troca qual iniciativa é a ativa (POST /initiatives/:id/switch-active) — mesmo motor de escrita do \`${BRAND.cliName} initiatives switch-active\`. ACHADO conhecido (não corrigido, ver relatório do item 3.1): não valida se o id existe.`,
      inputSchema: {
        id: z.string().describe("ID da iniciativa a marcar como ativa"),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: { id: string }) => toWriteCallToolResult(await switchActiveInitiative(args.id, writeOptions)),
  );

  registerTool(
    server,
    "bump_initiative_phase",
    {
      title: "Bump Initiative Phase",
      description:
        `Atualiza a fase corrente de uma iniciativa (POST /initiatives/:id/bump-phase) — mesmo motor de escrita do \`${BRAND.cliName} initiatives bump-phase\`. Devolve erro se a iniciativa não existir.`,
      inputSchema: {
        id: z.string().describe("ID da iniciativa"),
        phase: z.string().describe("Nova fase corrente"),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: { id: string; phase: string }) => toWriteCallToolResult(await bumpInitiativePhase(args.id, args.phase, writeOptions)),
  );

  registerTool(
    server,
    "upsert_wave_item",
    {
      title: "Upsert Wave Item",
      description:
        `Cria ou atualiza um item de wave de uma iniciativa (POST /initiatives/:id/wave-items/:wave/:item) — mesmo motor de escrita do \`${BRAND.cliName} initiatives upsert-wave-item\`. Devolve erro se a iniciativa não existir.`,
      inputSchema: {
        id: z.string().describe("ID da iniciativa"),
        wave: z.string().describe("Nome/índice da wave"),
        item: z.string().describe("Nome do item dentro da wave"),
        status: z.enum(WORK_STATUSES).describe("Status do item (obrigatório), no vocabulário de trabalho (ADR-0022)"),
        reason: z.string().optional().describe("Motivo, obrigatório com blocked, failed e cancelled (ADR-0022)"),
        repo: z.string().optional(),
        completedAt: z.string().optional(),
        artifacts: z.array(z.string()).optional(),
        summary: z.string().optional(),
        commit: z.string().optional(),
        knownBugsPinned: z.array(z.string()).optional(),
        mergeBlock: z.string().optional(),
        requiresApproval: z.boolean().optional().describe("Raro — marca o item como gate que exige aprovação humana explícita (ver WaveItemStatusEntry.requires_approval)"),
        group: z.enum(["wave", "epic"]).optional().describe("'epic' grava em epic_status em vez de wave_status (ADR-0006) — default 'wave', retrocompat total"),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: {
      id: string;
      wave: string;
      item: string;
      status: string;
      repo?: string;
      completedAt?: string;
      artifacts?: string[];
      summary?: string;
      commit?: string;
      knownBugsPinned?: string[];
      mergeBlock?: string;
      requiresApproval?: boolean;
      reason?: string;
      group?: "wave" | "epic";
    }) => {
      const { id, wave, item, ...input } = args;
      return toWriteCallToolResult(await upsertWaveItem(id, wave, item, input, writeOptions));
    },
  );

  registerTool(
    server,
    "upsert_delivery_phase",
    {
      title: "Upsert Delivery Phase",
      description:
        `Atualiza status/completedAt/artifacts de uma fase do delivery-state (POST /delivery-state/upsert-phase) — mesmo motor de escrita do \`${BRAND.cliName} delivery-state upsert-phase\`. Escopo via global (workspace) ou initiativeId — exatamente um dos dois.`,
      inputSchema: {
        global: z.boolean().optional().describe("true = escopo global; omitir e usar initiativeId para escopo por iniciativa"),
        initiativeId: z.string().optional().describe("ID da iniciativa; obrigatório se global não for true"),
        phase: z.string().describe("Nome da fase"),
        status: z.enum(DELIVERY_PHASE_STATUSES),
        reason: z.string().optional().describe("Motivo, obrigatório com blocked, failed e cancelled (ADR-0022)"),
        agent: z.string().optional(),
        completedAt: z.string().optional(),
        artifacts: z.array(z.string()).optional(),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: {
      global?: boolean;
      initiativeId?: string;
      phase: string;
      status: string;
      reason?: string;
      agent?: string;
      completedAt?: string;
      artifacts?: string[];
    }) => toWriteCallToolResult(await upsertDeliveryPhase(args, writeOptions)),
  );

  registerTool(
    server,
    "upsert_delivery_checklist_item",
    {
      title: "Upsert Delivery Checklist Item",
      description:
        `Marca/desmarca um item de checklist de uma fase do delivery-state (POST /delivery-state/upsert-checklist) — mesmo motor de escrita do \`${BRAND.cliName} delivery-state upsert-checklist\`. Escopo via global (workspace) ou initiativeId — exatamente um dos dois.`,
      inputSchema: {
        global: z.boolean().optional().describe("true = escopo global; omitir e usar initiativeId para escopo por iniciativa"),
        initiativeId: z.string().optional().describe("ID da iniciativa; obrigatório se global não for true"),
        phase: z.string().describe("Nome da fase"),
        item: z.string().describe("Nome do item de checklist"),
        checked: z.boolean().describe("true = marcado, false = desmarcado"),
        section: z.string().optional().describe('Default "human_checklist" se omitido'),
      },
      outputSchema: writeEnvelopeOutputShape,
    },
    async (args: { global?: boolean; initiativeId?: string; phase: string; item: string; checked: boolean; section?: string }) =>
      toWriteCallToolResult(await upsertDeliveryChecklistItem(args, writeOptions)),
  );

  // F5.2 (contrato agent-activity §4): a fonte de eventos de agente pelo MCP, nos dois harnesses.
  // Mesma fronteira do ADR-0004: só fala com o State Service (POST /runs/append), sem fallback.
  // Só tipos de agente; decisão humana (gate, item, decisão tomada) não tem tool (ADR-0024).
  registerTool(
    server,
    "append_run_event",
    {
      title: "Append Run Event",
      description:
        `Registra um evento de atividade de agente (início, progresso, fim, artefato gravado, bloqueio ou pedido de decisão) em runs/*.jsonl via State Service (POST /runs/append) — mesmo motor do \`${BRAND.cliName} runs append\`. Só metadados: nunca conteúdo de arquivo, prompt ou saída de ferramenta. artifact_path é relativo à raiz do workspace.`,
      inputSchema: {
        event_type: z.enum(AGENT_RUN_EVENT_TYPES).describe("Tipo do evento (decisão humana não entra por aqui)"),
        agent_id: z.string().max(RUN_EVENT_ID_MAX).optional().describe("Agente, ex.: @migration-agent"),
        phase_id: z.string().max(RUN_EVENT_ID_MAX).optional().describe("Fase do evento"),
        initiative_id: z.string().max(RUN_EVENT_ID_MAX).optional().describe("Iniciativa do evento"),
        task_id: z.string().max(RUN_EVENT_ID_MAX).optional().describe("Tarefa no estado, ex.: epic-0/task-0.2"),
        repo_id: z.string().max(RUN_EVENT_ID_MAX).optional(),
        artifact_path: z.string().max(RUN_EVENT_ID_MAX).optional().describe("Caminho do artefato, relativo à raiz do workspace; nunca o conteúdo"),
        harness: z.enum(RUN_EVENT_HARNESSES).optional().describe("Por onde o evento foi capturado; default mcp"),
        actor: z.enum(RUN_EVENT_ACTORS).optional(),
        message: z.string().optional().describe(`Texto curto; cortado em ${RUN_EVENT_MESSAGE_MAX} caracteres`),
        reason: z.string().optional().describe("Motivo de um bloqueio ou de um pedido de decisão"),
      },
      outputSchema: runEventOutputShape,
    },
    async (args: RunEventInput) => toWriteCallToolResult(await postRunEvent({ ...args, harness: args.harness ?? "mcp" }, writeOptions)),
  );
}
