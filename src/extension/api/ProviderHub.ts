/**
 * ProviderHub.ts — o registro em memória da API pública de extensão (F2.5,
 * ADR-0023), sobre o consentimento por workspace.
 *
 * Ele é o único lugar que decide se um provedor pode receber dado:
 * - sem workspace confiável, o registro é ignorado (não pergunta, não lista);
 * - valida a declaração e a implementação antes de qualquer coisa;
 * - confere a identidade de quem chama com o VS Code, nunca com o que a
 *   extensão diz de si (a pilha de chamada é a evidência — ver
 *   `callerFromStack`);
 * - respeita a decisão já guardada, e só pergunta quando é a primeira vez ou
 *   quando a declaração passou a ter um destino novo;
 * - um provedor ligado por porta; os outros podem ficar autorizados e
 *   desligados.
 *
 * O núcleo nunca faz rede: a telemetria chega ao provedor consentido pelo
 * bus de eventos do State Service, e o envio de artefatos só passa pelo
 * provedor quando a pessoa escolhe os arquivos. Nada aqui importa `vscode`.
 */

import type { Notifier } from "../../adapters/notifier/Notifier";
import type { RemoteSyncProvider, RemoteSyncResult } from "../../adapters/sync/RemoteSyncProvider";
import { DelegatingRemoteSyncProvider } from "../../adapters/sync/DelegatingRemoteSyncProvider";
import type { TemplateSource, ResolvedTemplateManifest } from "../../adapters/templates/TemplateSource";
import { DelegatingTemplateSource } from "../../adapters/templates/DelegatingTemplateSource";
import {
  activeProviderId,
  consentDecision,
  consentRequestText,
  denyConsent,
  grantConsent,
  markConsentPending,
  revokeConsent,
  setConsentEnabled,
  validateProviderRegistration,
  type ConsentBook,
  type ConsentStatus,
  type ProviderMeta,
  type ProviderPort,
} from "../../core/extension-api/api-contract.pure";
import { sanitizeRunEventForExtension } from "../../core/extension-api/api-contract.pure";
import type { RunEvent } from "../../core/contracts/run-events-contract.pure";
import type { EventBus, StateServiceEvent } from "../../server/EventBus";
import { BRAND } from "../../core/brand/brand.pure";
import { listSendableArtifacts, readArtifact } from "./artifactFiles";
import type { ConsentStore } from "./ConsentStore";

export const API_VERSION = 1;

/** O que a extensão companheira implementa para receber a telemetria (RunEvent da lista fechada). */
export interface ExtensionTelemetrySink {
  /** Fire-and-forget: uma exceção do provedor não derruba o núcleo. */
  push(event: RunEvent): void;
}

export interface DisposableLike {
  dispose(): void;
}

export interface ProviderHubOptions {
  store: ConsentStore;
  notifier: Notifier;
  /** Id de quem chamou (produção: pilha; testes: o chamador do cenário). `null` = o editor não sabe. */
  callerId: () => string | null;
  /** Nome do manifesto do VS Code para o id declarado; `undefined` quando não existe ou não depende da Jataí. */
  describeExtension: (id: string) => { id: string; displayName: string } | undefined;
  workspaceRoot: () => string | undefined;
  isTrusted: () => boolean;
  /** Iniciativa ativa do registro, para o `RemoteSyncInput` (opcional; o envio funciona sem). */
  activeInitiativeId?: () => string | null;
  /** Lista/leitura de artefatos injetáveis; o padrão varre `.github/artifacts/`. */
  listArtifacts?: (root: string) => string[];
  readArtifact?: (root: string, relPath: string) => string | null;
}

export interface ConnectionInfo {
  id: string;
  displayName: string;
  purpose: string;
  port: ProviderPort;
  status: ConsentStatus;
  enabled: boolean;
}

export interface SendArtifactsResult {
  ok: boolean;
  reason?: string;
  sent: string[];
  skipped: string[];
}

interface Registration {
  port: ProviderPort;
  /** Já com o nome do manifesto (a declaração não escolhe como aparece). */
  meta: ProviderMeta;
  provider: ExtensionTelemetrySink | TemplateSource | RemoteSyncProvider;
}

const NOOP: DisposableLike = { dispose: () => undefined };

export class ProviderHub {
  readonly templateSource: TemplateSource;
  readonly remoteSync: RemoteSyncProvider;

  private _registrations: Registration[] = [];
  private _pendingPrompts: Promise<void> = Promise.resolve();
  private _unsubscribe: (() => void) | null = null;

  constructor(private readonly _opts: ProviderHubOptions) {
    this.templateSource = new DelegatingTemplateSource(() => this.activeTemplateSource());
    this.remoteSync = new DelegatingRemoteSyncProvider(() => this.activeRemoteSync());
  }

  // ── Registro pela API ──────────────────────────────────────────────────────

  registerTelemetrySink(sink: ExtensionTelemetrySink, meta: ProviderMeta): DisposableLike {
    return this._register("telemetry", sink, meta);
  }

  registerTemplateSource(source: TemplateSource, meta: ProviderMeta): DisposableLike {
    return this._register("templates", source, meta);
  }

  registerRemoteSyncProvider(provider: RemoteSyncProvider, meta: ProviderMeta): DisposableLike {
    return this._register("remote-sync", provider, meta);
  }

  /** Espera os pedidos de consentimento abertos (os testes usam; a produção não precisa). */
  settle(): Promise<void> {
    return this._pendingPrompts;
  }

  private _register(port: ProviderPort, provider: unknown, rawMeta: ProviderMeta): DisposableLike {
    // Workspace não confiável ou sem pasta: o registro nem entra (ADR-0023 §3).
    if (!this._opts.workspaceRoot() || !this._opts.isTrusted()) return NOOP;

    const validation = validateProviderRegistration(port, provider, rawMeta);
    if (!validation.ok) throw new Error(validation.message);

    const meta = rawMeta;
    const caller = this._opts.callerId();
    if (!caller) {
      throw new Error("não foi possível identificar quem está registrando: o VS Code não disse qual extensão chamou");
    }
    if (caller !== meta.id) {
      throw new Error(`o identificador declarado (${meta.id}) não é o da extensão que chamou (${caller})`);
    }
    const resolved = this._opts.describeExtension(meta.id);
    if (!resolved) {
      throw new Error(`o VS Code não conhece a extensão '${meta.id}' ou ela não declara dependência da ${BRAND.displayName}`);
    }

    if (this._registrations.some((r) => r.port === port && r.meta.id === meta.id)) {
      throw new Error(`a extensão '${meta.id}' já registrou uma conexão de ${port}; descarte a anterior antes de registrar de novo`);
    }

    const registration: Registration = {
      port,
      meta: { ...meta, displayName: resolved.displayName },
      provider: provider as Registration["provider"],
    };
    this._registrations.push(registration);

    const book = this._opts.store.read();
    const decision = consentDecision(book, port, registration.meta);
    if (decision.kind === "activate") {
      // Autorização guardada: liga sem perguntar — mas não rouba a porta de quem já está ligado.
      if (activeProviderId(book, port) === null) void this._opts.store.write(grantConsent(book, port, registration.meta, true));
    } else if (decision.kind === "ask") {
      void this._opts.store.write(markConsentPending(book, port, registration.meta));
      this._queuePrompt(registration, decision.changed);
    }
    // silent: já recusada/revogada neste workspace — fica registrada e desligada, sem pedido.

    let active = true;
    return {
      dispose: (): void => {
        if (!active) return;
        active = false;
        this._registrations = this._registrations.filter((r) => r !== registration);
      },
    };
  }

  // ── Consentimento ─────────────────────────────────────────────────────────

  private _queuePrompt(registration: Registration, changed: boolean): void {
    this._pendingPrompts = this._pendingPrompts
      .then(() => this._ask(registration, changed))
      .catch(() => undefined);
  }

  private async _ask(registration: Registration, changed: boolean): Promise<void> {
    const book = this._opts.store.read();
    const active = activeProviderId(book, registration.port);
    const text = consentRequestText(registration.port, registration.meta, { changed, anotherActive: active });
    const answer = await this._opts.notifier.ask(text.message, { modal: true, detail: text.detail }, ...text.actions);

    // O registro pode ter sido descartado enquanto o pedido estava aberto.
    if (!this._registrations.includes(registration)) return;

    let next = this._opts.store.read();
    if (answer === "Permitir" || answer === "Ligar esta") {
      next = grantConsent(next, registration.port, registration.meta, true);
    } else if (answer === "Manter a atual") {
      next = grantConsent(next, registration.port, registration.meta, false);
    } else if (answer === "Recusar") {
      next = denyConsent(next, registration.port, registration.meta);
    } else {
      return; // fechou sem decidir: fica pendente
    }
    await this._opts.store.write(next);
  }

  revoke(port: ProviderPort, id: string): Promise<void> {
    return this._opts.store.write(revokeConsent(this._opts.store.read(), port, id));
  }

  setEnabled(port: ProviderPort, id: string, enabled: boolean): Promise<void> {
    return this._opts.store.write(setConsentEnabled(this._opts.store.read(), port, id, enabled));
  }

  /** O que "Extensões conectadas" mostra: uma linha por conexão registrada, com o estado atual. */
  connections(): ConnectionInfo[] {
    const book = this._opts.store.read();
    return this._registrations.map((registration) => {
      const record = book[registration.port]?.[registration.meta.id];
      return {
        id: registration.meta.id,
        displayName: registration.meta.displayName,
        purpose: registration.meta.purpose,
        port: registration.port,
        status: record?.status ?? "pending",
        enabled: record?.status === "allowed" && record.enabled,
      };
    });
  }

  // ── Provedores ativos ─────────────────────────────────────────────────────

  activeTelemetrySink(): ExtensionTelemetrySink | null {
    return this._active("telemetry") as ExtensionTelemetrySink | null;
  }

  activeTemplateSource(): TemplateSource | null {
    return this._active("templates") as TemplateSource | null;
  }

  activeRemoteSync(): RemoteSyncProvider | null {
    return this._active("remote-sync") as RemoteSyncProvider | null;
  }

  private _active(port: ProviderPort): Registration["provider"] | null {
    const id = activeProviderId(this._opts.store.read(), port);
    if (!id) return null;
    return this._registrations.find((r) => r.port === port && r.meta.id === id)?.provider ?? null;
  }

  // ── Telemetria ────────────────────────────────────────────────────────────

  /** Assina o bus do State Service; sem provedor ligado, o evento é descartado antes de qualquer chamada. */
  bindEventBus(bus: Pick<EventBus, "subscribe">): void {
    this._unsubscribe?.();
    this._unsubscribe = bus.subscribe((event: StateServiceEvent) => this.deliverFromBus(event));
  }

  deliverFromBus(event: StateServiceEvent): void {
    const sink = this.activeTelemetrySink();
    if (!sink) return;
    const clean = sanitizeRunEventForExtension(event.event);
    if (!clean) return;
    try {
      sink.push(clean);
    } catch {
      // Fire-and-forget (ADR-0023 §4): a extensão não derruba o núcleo.
    }
  }

  // ── Envio de artefatos ────────────────────────────────────────────────────

  listSendable(): string[] {
    const root = this._opts.workspaceRoot();
    if (!root) return [];
    return (this._opts.listArtifacts ?? listSendableArtifacts)(root);
  }

  async sendArtifacts(relPaths: readonly string[]): Promise<SendArtifactsResult> {
    const provider = this.activeRemoteSync();
    if (!provider) return { ok: false, reason: "no-provider", sent: [], skipped: [] };
    const root = this._opts.workspaceRoot();
    if (!root) return { ok: false, reason: "no-workspace", sent: [], skipped: [] };

    const initiativeId = this._opts.activeInitiativeId?.() ?? "";
    const sent: string[] = [];
    const skipped: string[] = [];
    const read = this._opts.readArtifact ?? readArtifact;

    for (const rel of relPaths) {
      const content = read(root, rel);
      if (content === null) {
        skipped.push(rel);
        continue;
      }
      try {
        const result: RemoteSyncResult = await provider.pushArtifact({ initiativeId, path: rel, content });
        if (result.ok && !result.skipped && !result.syncFailed) sent.push(rel);
        else skipped.push(rel);
      } catch {
        // A porta promete nunca lançar; uma extensão com defeito não pode derrubar o comando.
        skipped.push(rel);
      }
    }
    return { ok: true, sent, skipped };
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._registrations = [];
  }
}

export type { ConsentBook, ProviderMeta, ProviderPort, ResolvedTemplateManifest };
