/**
 * cockpit-protocol.ts
 *
 * Contrato de mensagens entre o Extension Host e o webview do Cockpit Next —
 * a única fonte da verdade sobre o formato de `postMessage` dos dois lados.
 *
 * Vive em `src/shared/` (não em `src/data/` nem em `webview-ui/src/`) porque
 * **nenhum** dos dois é dono: o host usa os tipos para montar o snapshot real,
 * o webview usa os mesmos tipos (via `import type`, apagado em compile time)
 * para tipar o que chega. Se um lado desviar do outro, o TypeScript acusa —
 * não existe "postMessage sem tipo" acontecendo silenciosamente.
 *
 * Todo import aqui é `import type` de propósito: este arquivo não pode ter
 * nenhum runtime footprint, senão o bundle do webview tentaria resolvê-lo.
 */

import type {
  FoundationPlan,
  FoundationState,
  ReposInventory,
  LiveActivity,
  ContextReposMap,
  RepoGraph,
  InitiativesState,
  DataSourceIssue,
  KitStatus,
  RunEvent,
  DeliveryState,
  DeliveryPlan,
  SprintBacklog,
  OperationsSnapshot,
  WorkStatusView,
  ColmeiaVM,
  ColmeiaSnapshot,
  InitiativeFlow,
  AgentCatalogEntry,
} from "../data/webview-safe";
import type { HelyxConfig } from "../types";

// Re-exportados para que webview-ui/ importe tipos de dados só por aqui
// (`@shared/cockpit-protocol`), nunca com um caminho direto para `src/data/`
// — um único ponto de fronteira entre host e webview.
export type {
  FoundationPlan,
  FoundationState,
  ReposInventory,
  LiveActivity,
  ContextReposMap,
  RepoGraph,
  InitiativesState,
  DataSourceIssue,
  KitStatus,
  RunEvent,
  HelyxConfig,
  DeliveryState,
  DeliveryPlan,
  SprintBacklog,
  OperationsSnapshot,
  ColmeiaVM,
  InitiativeFlow,
  AgentCatalogEntry,
};

/**
 * O mapa da colmeia (F5.2 → F5.3) não pede mensagem nova. O que ele precisa
 * já trafega, de forma aditiva e só com a lista fechada do contrato
 * agent-activity:
 * - `shell/snapshot`: `initiatives`, `foundationState`, `deliveryState` e a
 *   janela `runEvents`;
 * - `shell/runEvents-append`: os eventos novos (desde a correção do M4,
 *   inclusive os que chegam com horário anterior ao último entregue).
 * Cada `RunEvent` leva só `run_id`, `event_type`, `timestamp`, `phase_id`,
 * `agent_id`, `repo_id`, `message`, `metadata` e os campos novos
 * `initiative_id`, `task_id`, `artifact_path`, `actor`, `by` e `harness`.
 *
 * No webview: `deriveColmeia(snapshot, eventos, initiativeFlow(ativa))`,
 * importados de `@data`. O tipo abaixo quebra a compilação se o snapshot
 * deixar de servir de entrada ao mapa.
 */
type AssertExtends<T extends U, U> = T;
export type CockpitColmeiaInput = AssertExtends<CockpitSnapshot, ColmeiaSnapshot>;

/**
 * Tudo que o Shell precisa para renderizar as 4 áreas — cada campo mapeia 1:1
 * para um export puro já existente em `src/data/`. Nada aqui é inventado.
 */
export interface CockpitSnapshot {
  config: HelyxConfig | null;
  /**
   * Existe config válido — sob QUALQUER formato aceito (single-project OU o
   * multi-repo do Foundation brownfield). `config` continua null nesse
   * segundo caso (é o shape estrito), então telas que só precisam saber
   * "workspace configurado?" (cold-start do Mural/Dashboard) devem checar
   * este campo, não `config`.
   */
  configured: boolean;
  reposInventory: ReposInventory | null;
  foundationState: FoundationState | null;
  foundationPlan: FoundationPlan | null;
  liveActivity: LiveActivity;
  /**
   * Janela bruta de `runs/*.jsonl` (mesma que já é lida para derivar
   * `liveActivity`) — sem isso, `recentEventsForRepo`/`cursorFromEvents`
   * (pure, já bundladas no webview) não têm nada pra operar; `liveActivity`
   * sozinha só dá um top-8 GLOBAL, não um recorte por repositório.
   */
  runEvents: RunEvent[];
  contextRepos: ContextReposMap | null;
  repoGraph: RepoGraph | null;
  initiatives: InitiativesState | null;
  /** Estado de Delivery (Upstream/Downstream/Operation) da iniciativa ATIVA — `null` fora da lente de Delivery. */
  deliveryState: DeliveryState | null;
  deliveryPlan: DeliveryPlan | null;
  sprintBacklog: SprintBacklog | null;
  /**
   * Estado dos 4 artefatos que os agentes de Operation escrevem (ADR-0002)
   * — workspace inteiro, contínuo, nunca escopado a uma iniciativa. Cada
   * bloco (`devops`/`observability`/`incidents`/`sustain`) é `null`
   * individualmente até o agente correspondente escrever algo pela
   * primeira vez; nunca dado fabricado.
   */
  operations: OperationsSnapshot;
  kitStatus: KitStatus | null;
  /** Degradações coletadas nesta leitura (arquivo malformado, etc.) — nunca some em silêncio. */
  warnings: DataSourceIssue[];
  /**
   * Setting `helyx.approvalFriction.riskFields` (lido do lado do host) — os
   * campos de `WaveItemStatusEntry` cuja presença exige o checkbox extra
   * antes de habilitar "Aprovar" (ver `approveWaveItem`). O default já vem
   * calibrado; nenhuma tela deveria hardcodar essa lista de novo.
   */
  approvalFrictionFields: string[];
  /**
   * Setting `helyx.deliveryHierarchy` (lido do lado do host, ADR-0006/
   * ADR-0007) — `"legacy"` (default) renderiza Wave/Item exatamente como
   * hoje; `"epic-feature-backlog-task"` liga a hierarquia nova para
   * iniciativas que a usam. Aditivo: nenhuma tela é obrigada a olhar este
   * campo ainda (a leitura real entra na Wave 2, item 2.4).
   */
  deliveryHierarchy: "legacy" | "epic-feature-backlog-task";
  /**
   * Central de notificações (Onda 2) — subconjunto de `runEvents` que
   * precisou de atenção humana (bloqueio, aprovação). Derivado do MESMO
   * `runEvents` acima a cada snapshot — nenhum armazenamento novo, o sino
   * do ContextBar só lê uma janela filtrada do que já existe.
   */
  notifications: CockpitNotification[];
  /** `null` até a primeira vez que o operador abre a central; persiste em `globalState`, não em disco. */
  notificationsLastSeenAt: string | null;
  /**
   * Status de trabalho da iniciativa ativa (F6.5, ADR-0022): status e motivo
   * de cada fase, item de onda/épico e da própria iniciativa, o fechamento de
   * G1, G2 e D3 (com os cancelados e o motivo) e os avisos de status
   * desconhecido. Aditivo e opcional; a apresentação (DS v2) vem depois.
   */
  workStatus?: WorkStatusView | null;
  /**
   * As responsabilidades dos agentes instalados (`description` do frontmatter
   * de `.claude/agents/**` e `.github/agents/**`), para o painel da ilha do
   * mapa da colmeia (F5.3, ADR-0020). Aditivo e opcional: só vai quando há
   * agente instalado com descrição; o mapa funciona sem ele.
   */
  agents?: AgentCatalogEntry[];
}

export type ToastKind = "gate-approved" | "blocked" | "agent-done" | "kit-outdated";

export interface CockpitToast {
  id: string;
  kind: ToastKind;
  text: string;
  timestamp: string;
}

/** Tipos de `runEvents` relevantes o bastante pra entrar na central de notificações (Onda 2). */
export type NotificationKind = "gate-approved" | "blocked" | "agent-done" | "item-approved";

export interface CockpitNotification {
  id: string;
  kind: NotificationKind;
  text: string;
  timestamp: string;
}

export type HostToWebviewMessage =
  | { type: "shell/snapshot"; seq: number; generatedAt: string; payload: CockpitSnapshot }
  | { type: "shell/runEvents-append"; seq: number; payload: RunEvent[] }
  | { type: "shell/toast"; payload: CockpitToast }
  | { type: "shell/degraded"; payload: DataSourceIssue }
  | { type: "shell/command-ack"; requestId: string; ok: boolean; error?: string }
  | GateApprovalResult
  | DecisionRecordResult;

// ── Os 16 verbos já existentes — payloads exatamente como o CockpitController
// de hoje já os envia (ver _handleMessage). Contrato preservado ao pé da
// letra: nenhum campo novo, nenhum renomeado. ──────────────────────────────
export type LegacyWebviewMessage =
  | { type: "injectPrompt"; promptId: string }
  | { type: "injectRaw"; prompt: string }
  | { type: "runCommand"; command: string }
  | { type: "openChat" }
  | { type: "openWizard" }
  | { type: "openImportWizard" }
  | { type: "openFile"; relPath: string }
  | { type: "refresh" }
  | { type: "switchInitiative"; id: string }
  | { type: "newInitiative" }
  | { type: "skipTutorial" }
  | { type: "resetTutorial" }
  | { type: "markPhaseDone"; phaseId: string }
  | { type: "toggleGuardRail"; phaseId: string; itemId: string; checked: boolean }
  | { type: "approveAndAdvancePhase"; phaseId: string }
  | { type: "guardRailAction"; actionType: string; target: string }
  | { type: "toggleFoundationGuardRail"; phaseId: string; itemId: string; checked: boolean };

// ── Aprovação real dentro do Cockpit (Onda 1) — wave items (modernização) e
// gate D1 (Discovery/brownfield). `acknowledged` só importa quando o item
// tem algum campo em `approvalFrictionFields`; fora disso é ignorado pelo
// handler. ───────────────────────────────────────────────────────────────
export type ApprovalWebviewMessage =
  | { type: "approveWaveItem"; initiativeId: string; wave: string; item: string; acknowledged: boolean }
  | { type: "approveGateD1"; repoId: string }
  /** Novo Cockpit (Passo 3) — aprova UM `SprintItem` (`sprint-run` do greenfield), grava `status: done` em `sprint-backlog.yaml`. Sem fricção — `SprintItem` não carrega campo de risco hoje. */
  | { type: "approveSprintItem"; sprintItemId: string };

/** Onda 2 — o operador abriu a central de notificações; zera o contador de não-lidas. */
export type NotificationWebviewMessage = { type: "notifications/markSeen" };

/** Onda 4 — Mecanismo M v1.1: diff real (git) de um artefato, aberto no diff editor nativo do VS Code. */
export type VerificationWebviewMessage = { type: "openArtifactDiff"; path: string };

// ── Aprovação de gate como decisão humana (ADR-0024, decisões do titular de
// 2026-11-15). O host roda `StateCommands.approveGate`, o mesmo caso de uso do
// CLI e do `POST /gates/approve`: quem aprova é o `by` do pedido ou o
// `user.name` do git do workspace; D1 exige as fases do Foundation do repo
// concluídas, D2 o roadmap e a matriz de risco aprovados, D3 os itens de
// execução fechados. Sem tool MCP equivalente: só humano aprova.
//
// F4.2 (parte 2): os dois tipos entram nas uniões junto com o handler do host
// (`gates/approve`) e o `case` do `CockpitStore`, que o contrato de
// exaustividade exige (tests/contract/cockpit-protocol.contract.test.ts).

/** Pedido do Cockpit: aprovar D1 (por `repoId`) ou D2/D3 (por `initiativeId`). Sem `by`, vale o `user.name` do git do workspace. */
export type GateApprovalRequest = {
  type: "gates/approve";
  gate: "d1" | "d2" | "d3";
  repoId?: string;
  initiativeId?: string;
  /** Nome de quem aprova, quando o operador digitou (sobrescreve o do git). Nunca o e-mail. */
  by?: string;
  note?: string;
};

/** Item que impede o gate: `phase` (D1), `gate` (D2: `roadmap_gate`, `risk_matrix_gate`) ou `item` (D3), com o status atual. */
export interface GateApprovalOpenItem {
  phase?: string;
  gate?: string;
  item?: string;
  status: string;
  reason?: string;
}

/**
 * Resposta do host a um `GateApprovalRequest`, no envelope do `StateCommands`.
 * - `MISSING_FLAG` com `field: "by"`: ninguém disse quem aprova e o git não tem
 *   `user.name`. O Cockpit pergunta o nome e reenvia com `by`;
 * - `GATE_NOT_CLOSED`: o que falta vem em `open`, para o checklist da decisão.
 */
export type GateApprovalResult =
  | {
      type: "gates/approve-result";
      ok: true;
      gate: "d1" | "d2" | "d3";
      human_approved_at: string;
      by: string;
      /** D3: os itens cancelados, com o motivo (ADR-0022). */
      cancelled?: Array<{ item: string; reason?: string }>;
    }
  | {
      type: "gates/approve-result";
      ok: false;
      error: { code: string; message: string; field?: string; open?: GateApprovalOpenItem[] };
    };

// ── Decisão humana pedida por um agente (F5.2, contrato agent-activity; ADR-0020).
// O diálogo de decisão registra pelo `StateCommands.recordDecision`: grava
// `decision-made` com `actor: human` e o nome do git, e a chave (`taskId`) é a
// que apaga a guarda do mapa. Só humano registra decisão: nem o CLI nem o MCP
// chegam aqui. ───────────────────────────────────────────────────────────────

/** Pedido do Cockpit: registrar a decisão da tarefa `taskId`. Sem `by`, vale o `user.name` do git. */
export type DecisionRecordRequest = {
  type: "decisions/record";
  taskId: string;
  initiativeId?: string;
  phaseId?: string;
  /** O que foi decidido, curto (o host corta em 140 caracteres). */
  message?: string;
  /** Nome de quem decide, quando o operador digitou. Nunca o e-mail. */
  by?: string;
};

/** Resposta do host a um `DecisionRecordRequest`; `MISSING_FLAG` com `field: "by"` pede o nome, como no gate. */
export type DecisionRecordResult =
  | { type: "decisions/record-result"; ok: true; taskId: string; by: string }
  | { type: "decisions/record-result"; ok: false; error: { code: string; message: string; field?: string } };

export type WebviewToHostMessage =
  | { type: "shell/ready" }
  | { type: "shell/requestSnapshot" }
  | LegacyWebviewMessage
  | ApprovalWebviewMessage
  | NotificationWebviewMessage
  | VerificationWebviewMessage
  | GateApprovalRequest
  | DecisionRecordRequest;
