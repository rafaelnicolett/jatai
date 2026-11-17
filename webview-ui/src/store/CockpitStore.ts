/**
 * CockpitStore.ts
 *
 * O store feito à mão que substitui a reatribuição total de `webview.html` —
 * aplica cada mensagem do host como um patch, nunca redesenha do zero.
 * `getSnapshot()` só devolve uma referência NOVA quando algo de fato mudou —
 * é o que satisfaz o contrato de igualdade referencial do
 * `useSyncExternalStore`/`useSyncExternalStoreWithSelector` do React.
 */

import type {
  HostToWebviewMessage,
  CockpitSnapshot,
  CockpitToast,
  DataSourceIssue,
  RunEvent,
  GateApprovalResult,
  DecisionRecordResult,
} from "@shared/cockpit-protocol";

/** Qual vista do Cockpit está à frente: as telas de sempre ou o mapa da colmeia (F5.3). */
export type CockpitView = "cockpit" | "map";

/**
 * Uma decisão que o mapa pede ao Cockpit para abrir (cenário "A guarda acesa
 * leva à decisão no Cockpit"): o mapa só acompanha, nunca decide (R6). A tela
 * de decisão do Cockpit lê isto, abre com o contexto e chama `clearDecision`.
 */
export interface DecisionRequest {
  kind: "decision" | "approval";
  reason: string;
  taskId?: string;
  /** A iniciativa que o mapa mostrava: o Cockpit troca a visão para ela antes de abrir a decisão. */
  initiativeId?: string;
  islandId: string;
  islandLabel: string;
}

export interface CockpitStoreState {
  /** Qual vista está à frente. O Cockpit nunca é desmontado: o mapa abre por cima e o estado dele (épico em destaque, abas) sobrevive. */
  view: CockpitView;
  /** A decisão que o mapa pediu para abrir no Cockpit; `null` quando não há. */
  pendingDecision: DecisionRequest | null;
  /** `"booting"` até a primeira `shell/snapshot` chegar. */
  status: "booting" | "ready";
  seq: number;
  generatedAt: string | null;
  snapshot: CockpitSnapshot | null;
  /**
   * Eventos novos chegados via `shell/runEvents-append` DESDE o último
   * `shell/snapshot` — zerado a cada snapshot novo, porque o `liveActivity`
   * do snapshot já reflete tudo até aquele ponto.
   */
  recentRunEvents: RunEvent[];
  toasts: CockpitToast[];
  degraded: DataSourceIssue[];
  /**
   * A resposta do host à última decisão que o operador mandou (aprovar gate ou
   * registrar decisão, F4.2). `seq` sobe a cada resposta: o painel de decisão
   * compara com o que já viu para reagir só ao que veio depois do clique.
   */
  decisionResult: { seq: number; result: GateApprovalResult | DecisionRecordResult } | null;
}

const INITIAL_STATE: CockpitStoreState = {
  view: "cockpit",
  pendingDecision: null,
  status: "booting",
  seq: -1,
  generatedAt: null,
  snapshot: null,
  recentRunEvents: [],
  toasts: [],
  degraded: [],
  decisionResult: null,
};

type Listener = () => void;

function upsertBySource(list: DataSourceIssue[], issue: DataSourceIssue): DataSourceIssue[] {
  const idx = list.findIndex((i) => i.source === issue.source);
  if (idx === -1) return [...list, issue];
  const next = [...list];
  next[idx] = issue;
  return next;
}

export class CockpitStore {
  private _state: CockpitStoreState = INITIAL_STATE;
  private readonly _listeners = new Set<Listener>();

  /** Para `useSyncExternalStore`/`useSyncExternalStoreWithSelector`. */
  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  /** Referência estável — só muda quando `_setState` de fato aplica um patch. */
  getSnapshot = (): CockpitStoreState => this._state;

  handleMessage(msg: HostToWebviewMessage): void {
    switch (msg.type) {
      case "shell/snapshot":
        this._setState({
          status: "ready",
          seq: msg.seq,
          generatedAt: msg.generatedAt,
          snapshot: msg.payload,
          recentRunEvents: [],
        });
        return;
      case "shell/runEvents-append":
        if (msg.payload.length === 0) return;
        this._setState({ recentRunEvents: [...this._state.recentRunEvents, ...msg.payload] });
        return;
      case "shell/toast":
        // Mantém só os últimos 20 — um toast é efêmero, não precisa de histórico ilimitado.
        this._setState({ toasts: [...this._state.toasts, msg.payload].slice(-20) });
        return;
      case "shell/degraded":
        this._setState({ degraded: upsertBySource(this._state.degraded, msg.payload) });
        return;
      case "shell/command-ack":
        // Reservado para fases futuras (ex.: mostrar erro de um comando específico).
        return;
      case "gates/approve-result":
      case "decisions/record-result":
        this._setState({ decisionResult: { seq: (this._state.decisionResult?.seq ?? 0) + 1, result: msg } });
        return;
    }
  }

  /** O painel de decisão consumiu a resposta (ou fechou): a próxima abertura não herda a anterior. */
  clearDecisionResult(): void {
    if (this._state.decisionResult !== null) this._setState({ decisionResult: null });
  }

  /** Um aviso gerado no próprio painel (ex.: "Decisão registrada"), no mesmo canal dos que o host manda. */
  pushToast(toast: CockpitToast): void {
    this._setState({ toasts: [...this._state.toasts, toast].slice(-20) });
  }

  /** Chamado pela UI quando o operador dispensa um toast. */
  removeToast(id: string): void {
    this._setState({ toasts: this._state.toasts.filter((t) => t.id !== id) });
  }

  /** Troca a vista à frente (o botão "Mapa" da barra superior, "Voltar ao Cockpit" e Esc no mapa). Puramente client-side, nunca vai ao host. */
  setView(view: CockpitView): void {
    if (this._state.view === view) return;
    this._setState({ view });
  }

  /** O mapa pede a decisão ao Cockpit: volta à vista do Cockpit e deixa o contexto para a tela de decisão abrir. O mapa não grava nada. */
  requestDecision(request: DecisionRequest): void {
    this._setState({ pendingDecision: request, view: "cockpit" });
  }

  /** A tela de decisão já abriu (ou foi fechada): limpa o pedido. */
  clearDecision(): void {
    if (this._state.pendingDecision === null) return;
    this._setState({ pendingDecision: null });
  }

  private _setState(patch: Partial<CockpitStoreState>): void {
    this._state = { ...this._state, ...patch };
    for (const listener of this._listeners) listener();
  }
}

/** Uma única instância por webview — não há caso de uso para mais de um store. */
export const cockpitStore = new CockpitStore();
