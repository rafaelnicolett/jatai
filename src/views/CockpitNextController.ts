/**
 * CockpitNextController.ts
 *
 * O novo Cockpit — React dentro de um WebviewPanel, ao lado do
 * `CockpitController` legado (strangler fig: nenhum dos dois muda o outro).
 *
 * A diferença estrutural que resolve o bug de origem: `webview.html` é
 * setado UMA VEZ, na abertura do painel (`_buildShellHtml`), nunca
 * reatribuído depois. Toda atualização subsequente vira uma mensagem
 * tipada (`shell/snapshot`, `shell/runEvents-append`, `shell/toast`,
 * `shell/degraded`) que o `CockpitStore` do lado do webview aplica como
 * patch — o React nunca desmonta a árvore, então estado de UI (seção
 * colapsada, aba ativa) sobrevive a toda atualização.
 *
 * Reaproveita os MESMOS 8 módulos de dados e o MESMO registry de comandos
 * SOLID (`./actions/registry`) que o Cockpit legado usa — zero lógica
 * duplicada além do necessário para montar o snapshot e o HTML shell.
 */

import * as vscode from "vscode";
import * as crypto from "crypto";
import type { ConfigLoader } from "../adapters/config/ConfigLoader";
import { NullTelemetrySink, type TelemetrySink } from "../adapters/telemetry/TelemetrySink";
import type { StateRepository } from "../state/repository/StateRepository";
import type { Clock } from "../adapters/clock/Clock";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import type { Settings } from "../adapters/settings/Settings";
import { buildActionRegistry } from "./actions/registry";
import type { ActionContext } from "./actions/CommandHandler";
import type { HostToWebviewMessage, ToastKind } from "../shared/cockpit-protocol";
import { NOTIFICATIONS_LAST_SEEN_KEY } from "./actions/notificationActions";
import {
  describeEvent,
  cursorFromEvents,
  eventsSinceCursor,
  type RunEvent,
  type RunEventCursor,
} from "../data/run-events-contract";
import { CockpitSnapshotBuilder } from "./cockpit/CockpitSnapshotBuilder";
import { cockpitDataSources } from "./cockpit/cockpitDataSources";
import type { EventBus } from "../server/EventBus";
import { BRAND } from "../data/brand.pure";

const TOAST_EVENT_TYPES = new Set(["agent-done", "blocked", "gate-approved"]);

/** Default de `helyx.approvalFriction.riskFields` — campos de `WaveItemStatusEntry` cuja presença exige confirmação extra antes de "Aprovar". */
const DEFAULT_APPROVAL_FRICTION_FIELDS = ["merge_block", "known_bugs_pinned"];

/** Default de `helyx.deliveryHierarchy` (ADR-0007) — retrocompat permanente: nenhum workspace muda de comportamento sem opt-in explícito. */
const DEFAULT_DELIVERY_HIERARCHY: "legacy" | "epic-feature-backlog-task" = "legacy";

/** Nonce da CSP: 128 bits do gerador criptográfico, em 32 chars hex (A16e — antes era `Math.random`). */
function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Dependências do Cockpit, entregues pelo container (F3.6). */
export interface CockpitNextDeps {
  configLoader: ConfigLoader;
  /** Repositório de estado das ações que gravam (`ActionContext.repository`). */
  repository: StateRepository;
  /**
   * Barramento de eventos do State Service, do container (ADR-0017): o
   * Cockpit assina direto, sem SSE para o próprio processo. Sem barramento,
   * só o poll de 4 s atualiza o painel.
   */
  eventBus?: EventBus;
  /** Destino dos eventos de telemetria das ações do Cockpit (`ActionContext.pushTelemetry`). Default Null (ADR-0015). */
  telemetry?: TelemetrySink;
  /** Carimbo do snapshot (`generatedAt`) e dos toasts. */
  clock: Clock;
  /** Pasta aberta (uma por janela na v1). */
  workspaceRoot: WorkspaceRoot;
  /** Configurações da seção da marca (`approvalFriction.riskFields`, `deliveryHierarchy`). */
  settings: Settings;
}

export class CockpitNextController {
  private _panel: vscode.WebviewPanel | undefined;
  /** Cancela a assinatura do EventBus (ver `_setupEventStream`). */
  private _unsubscribeEvents: (() => void) | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _actionRegistry = buildActionRegistry();
  private readonly _snapshotBuilder: CockpitSnapshotBuilder;

  private _lastHash: string | null = null;
  /** Já avisou o webview, neste handshake, que não há pasta aberta (G9). */
  private _noFolderAnnounced = false;
  private _seq = 0;
  private _cursor: RunEventCursor | null = null;
  private _lastKitOutdated = false;
  /**
   * Ids de toast já enviados nesta sessão do painel. Necessário porque
   * `eventsSinceCursor` resincroniza (devolve a janela de 200 eventos
   * inteira) sempre que o evento do cursor sai da janela — sem isto, cada
   * resync re-envia toast pra eventos que o operador já viu (e já dispensou).
   * Nunca encolhe: o volume é limitado ao total de eventos reais da sessão.
   */
  private readonly _seenToastIds = new Set<string>();
  /**
   * Chaves de `PlanItem` (`foundationPlan`+`deliveryPlan`) em status "review"
   * na última leitura — `null` só antes da primeira leitura da sessão.
   * Diferença contra o snapshot atual = itens que ACABARAM de entrar em
   * review, o gatilho da notificação nativa (Onda 2). Nunca reseta em
   * `shell/ready` (ao contrário de `_cursor`) — reabrir o painel não deve
   * re-notificar sobre algo que já estava esperando aprovação antes.
   */
  private _lastReviewKeys: Set<string> | null = null;

  private readonly _configLoader: ConfigLoader;
  private readonly _repository: StateRepository;
  private readonly _eventBus: EventBus | null;
  private readonly _telemetry: TelemetrySink;
  private readonly _clock: Clock;
  private readonly _workspaceRoot: WorkspaceRoot;
  private readonly _settings: Settings;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    deps: CockpitNextDeps
  ) {
    this._configLoader = deps.configLoader;
    this._repository = deps.repository;
    this._eventBus = deps.eventBus ?? null;
    this._telemetry = deps.telemetry ?? new NullTelemetrySink();
    this._clock = deps.clock;
    this._workspaceRoot = deps.workspaceRoot;
    this._settings = deps.settings;
    this._snapshotBuilder = new CockpitSnapshotBuilder(cockpitDataSources(deps.configLoader, deps.repository));
  }

  async open(): Promise<void> {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      this._setupEventStream();
      await this._pushIfChanged(true);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      `${BRAND.name}CockpitNext`, `${BRAND.displayName} — Cockpit (Preview)`, vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, "dist")],
      }
    );
    this._panel.iconPath = vscode.Uri.joinPath(this._context.extensionUri, ...BRAND.assets.icon.split("/"));
    // `webview.html` é setado aqui e NUNCA MAIS reatribuído — é o que resolve
    // a destruição de estado do Cockpit legado (que reatribui a cada 4s).
    this._panel.webview.html = this._buildShellHtml(this._panel.webview);

    this._panel.onDidDispose(() => {
      this._panel = undefined;
      if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = undefined; }
      this._unsubscribeEvents?.();
      this._unsubscribeEvents = null;
    });

    this._panel.webview.onDidReceiveMessage(
      (msg: Record<string, unknown>) => this._handleMessage(msg),
      undefined, this._context.subscriptions
    );

    // Mesmo fallback do Cockpit legado — antes cobria o watcher perder uma
    // escrita rápida demais; agora cobre o SSE (item 2.3, sem replay/backlog
    // — ver feature-report) perder um evento durante uma reconexão.
    this._refreshTimer = setInterval(() => { void this._pushIfChanged(); }, 4000);
    this._setupEventStream();
    await this._pushIfChanged(true);
  }

  private _buildShellHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview", "assets", "index.css")
    );
    const csp = [
      `default-src 'none'`,
      // Sem `https:`: o Cockpit não carrega imagem remota (ADR-0015, zero egress).
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR" data-host="vscode">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND.displayName} — Cockpit</title>
  <link rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }

  // ── Mensagens ────────────────────────────────────────────────────────────

  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    if (msg.type === "shell/ready" || msg.type === "shell/requestSnapshot") {
      // Handshake / reconexão: força reenvio completo, nunca assume que o
      // outro lado já tem o estado (um reload do painel zera o CockpitStore).
      this._lastHash = null;
      this._cursor = null;
      this._noFolderAnnounced = false;
      await this._pushIfChanged(true);
      return;
    }
    const handler = this._actionRegistry.get(msg.type as string);
    if (!handler) return;
    await handler.handle(msg, this._buildActionContext());
  }

  private _buildActionContext(): ActionContext {
    return {
      configLoader: this._configLoader,
      extensionContext: this._context,
      repository: this._repository,
      // O Cockpit Next ainda não expõe UI greenfield (v1 é Brownfield/Discovery
      // só) — sem mapa de prompts estáticos para injetar por enquanto.
      promptMap: {},
      requestRefresh: () => this._pushIfChanged(),
      pushTelemetry: (event) => this._telemetry.push(event),
      // O resultado de uma aprovação ou decisão volta para o painel que pediu (F4.2).
      reply: (msg) => this._post(msg),
    };
  }

  private _post(msg: HostToWebviewMessage): void {
    void this._panel?.webview.postMessage(msg);
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  /**
   * Pede o `CockpitSnapshot` ao `CockpitSnapshotBuilder` e posta só se mudou
   * de verdade (hash) — evita repintar o webview a cada 4s quando nada
   * aconteceu, e evita `shell/runEvents-append` gerar toast duplicado.
   */
  private async _pushIfChanged(force = false): Promise<void> {
    const root = this._workspaceRoot.current();
    if (!this._panel) return;
    if (!root) {
      // Sem pasta não há estado para montar. Antes o painel ficava mudo no "conectando…" (G9 / H-GAP-12):
      // agora o webview recebe o aviso, uma vez por handshake, e oferece a ação certa.
      this._announceNoFolder();
      return;
    }

    const built = await this._snapshotBuilder.build(root, () => ({
      approvalFrictionFields: this._settings.get<string[]>("approvalFriction.riskFields", DEFAULT_APPROVAL_FRICTION_FIELDS),
      deliveryHierarchy: this._settings.get<"legacy" | "epic-feature-backlog-task">("deliveryHierarchy", DEFAULT_DELIVERY_HIERARCHY),
      notificationsLastSeenAt: this._context.globalState.get<string>(NOTIFICATIONS_LAST_SEEN_KEY) ?? null,
    }));
    const { snapshot, warnings } = built;

    this._notifyNewReviewItems(built.foundationPlan, built.deliveryPlan);

    const hash = crypto.createHash("sha1").update(JSON.stringify(snapshot)).digest("hex");
    const changed = force || hash !== this._lastHash;

    if (changed) {
      this._lastHash = hash;
      this._post({ type: "shell/snapshot", seq: this._seq++, generatedAt: this._clock.now().toISOString(), payload: snapshot });
      for (const issue of warnings) this._post({ type: "shell/degraded", payload: issue });
    }

    this._pushFreshRunEvents(built.events);
    this._maybeToastKitOutdated(built.kitStatus?.outdated ?? false);
  }

  /** Avisa o webview que o editor não tem pasta aberta (`shell/degraded`, fonte `workspace`), uma vez por handshake. */
  private _announceNoFolder(): void {
    if (this._noFolderAnnounced) return;
    this._noFolderAnnounced = true;
    this._post({ type: "shell/degraded", payload: { source: "workspace", message: "Nenhuma pasta aberta no editor." } });
  }

  /** Posta só os eventos genuinamente novos desde o último cursor, e deriva toasts + notificação nativa deles. */
  private _pushFreshRunEvents(events: RunEvent[]): void {
    // `_cursor` também é null na reconexão (`shell/ready`), não só no boot —
    // em ambos os casos `fresh` vira a janela inteira de 200 eventos, e sem
    // esta guarda a notificação nativa (que NÃO tem o dedup por id do toast,
    // ver abaixo) dispararia um popup por bloqueio já existente no histórico.
    const isFirstSync = this._cursor === null;
    const fresh = eventsSinceCursor(events, this._cursor);
    this._cursor = cursorFromEvents(events);
    if (fresh.length === 0) return;

    this._post({ type: "shell/runEvents-append", seq: this._seq++, payload: fresh });

    const newlyBlocked: string[] = [];
    for (const e of fresh) {
      if (!TOAST_EVENT_TYPES.has(e.event_type)) continue;
      const id = `${e.timestamp}-${e.event_type}-${e.repo_id ?? ""}-${e.phase_id ?? ""}`;
      if (this._seenToastIds.has(id)) continue;
      this._seenToastIds.add(id);
      // Mesma guarda de `isFirstSync` já usada 2 linhas abaixo pra notificação
      // nativa: no boot/reconexão `fresh` é a janela inteira (até 200 eventos),
      // não só "o que aconteceu agora" — sem isto, abrir o painel disparava um
      // toast por CADA `agent-done`/`blocked`/`gate-approved` já no histórico,
      // empilhando a pilha de toasts (que também não tinha auto-dismiss) toda
      // vez que o Cockpit era aberto ou reconectava.
      if (!isFirstSync) {
        this._post({
          type: "shell/toast",
          payload: {
            id,
            kind: e.event_type as ToastKind,
            text: describeEvent(e),
            timestamp: e.timestamp,
          },
        });
      }
      if (!isFirstSync && e.event_type === "blocked") newlyBlocked.push(describeEvent(e));
    }
    if (newlyBlocked.length > 0) this._notifyNatively("blocked", newlyBlocked);
  }

  /**
   * Onda 2 — o toast do webview só existe pra quem está com a aba do Cockpit
   * em foco; se o operador está em outro arquivo, ele nunca vê. A notificação
   * nativa do VS Code alcança qualquer aba, contanto que o painel não tenha
   * sido fechado (watchers/timer só rodam com o painel vivo — ver `open()`).
   */
  private _notifyNewReviewItems(
    foundationPlan: { items: { key: string; label: string; status: string }[] } | null,
    deliveryPlan: { items: { key: string; label: string; status: string }[] } | null
  ): void {
    const allItems = [...(foundationPlan?.items ?? []), ...(deliveryPlan?.items ?? [])];
    const reviewKeys = new Set(allItems.filter((i) => i.status === "review").map((i) => i.key));

    if (this._lastReviewKeys) {
      const newlyReview = allItems.filter(
        (i) => i.status === "review" && !this._lastReviewKeys!.has(i.key)
      );
      if (newlyReview.length > 0) this._notifyNatively("review", newlyReview.map((i) => i.label));
    }
    this._lastReviewKeys = reviewKeys;
  }

  /** Uma notificação nativa por push, mesmo que vários itens tenham disparado — nunca uma por item. */
  private _notifyNatively(kind: "review" | "blocked", labels: string[]): void {
    if (labels.length === 0) return;
    const text = labels.length === 1 ? labels[0]! : `${labels[0]} e mais ${labels.length - 1}`;
    const message = kind === "review"
      ? `${BRAND.displayName}: ${text} — aguarda sua aprovação.`
      : `${BRAND.displayName}: ${text} — bloqueado, precisa de decisão.`;
    const show = kind === "blocked" ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
    void show(message, "Ver no Cockpit").then((choice) => {
      if (choice === "Ver no Cockpit") this._panel?.reveal(vscode.ViewColumn.One);
    });
  }

  /** Dispara o toast de "kit desatualizado" só na transição false→true (edge-triggered). */
  private _maybeToastKitOutdated(outdated: boolean): void {
    if (outdated && !this._lastKitOutdated) {
      const now = this._clock.now();
      this._post({
        type: "shell/toast",
        payload: {
          id: `kit-outdated-${now.getTime()}`,
          kind: "kit-outdated",
          text: `Uma versão nova do ${BRAND.displayName} Kit está disponível — rode '${BRAND.displayName}: Migrar Estrutura do Kit'.`,
          timestamp: now.toISOString(),
        },
      });
    }
    this._lastKitOutdated = outdated;
  }

  // ── Eventos do State Service (item 2.3) ─────────────────────────────────

  /**
   * Assina o `EventBus` do State Service no próprio processo (A12, ADR-0017),
   * no lugar do SSE `GET /events` que o Cockpit abria para o servidor do mesmo
   * Extension Host. Cada evento é tratado como "algo mudou, busque de novo":
   * reagenda o mesmo `_pushIfChanged()`, debounced (600 ms, o mesmo de antes).
   *
   * Ponto de extensão: novas assinaturas de evento (ex.: eventos de atividade
   * de agente, F5.2) entram aqui, ao lado desta, e são canceladas junto em
   * `_unsubscribeEvents`.
   */
  private _setupEventStream(): void {
    const root = this._workspaceRoot.current();
    if (!root) return;

    this._unsubscribeEvents?.();
    this._unsubscribeEvents = null;
    if (!this._eventBus) return;

    const debounceRefresh = (): void => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => { void this._pushIfChanged(); }, 600);
    };

    this._unsubscribeEvents = this._eventBus.subscribe(debounceRefresh);
  }
}
