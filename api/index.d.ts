/**
 * API pública de extensão da Jataí — tipos publicáveis (F2.5, ADR-0023 §7).
 *
 * Quem instala a Jataí e quer integrar um serviço próprio declara
 * `jatai.jatai` em `extensionDependencies` e lê a API em
 * `vscode.extensions.getExtension("jatai.jatai")?.exports`:
 *
 * ```ts
 * const api = vscode.extensions.getExtension<JataiApi>("jatai.jatai")!.exports;
 * if (api.apiVersion !== 1) return; // semver: a major só muda com a API
 * const registration = api.registerTelemetrySink(sink, {
 *   id: context.extension.id,
 *   displayName: context.extension.packageJSON.displayName,
 *   purpose: "Levar a atividade dos agentes ao painel da minha empresa.",
 *   destinations: ["api.minhaempresa.example"],
 * });
 * context.subscriptions.push(registration);
 * ```
 *
 * `apiVersion` muda só em major. Estes tipos são MIT, como o resto do
 * repositório; a implementação que a extensão companheira traz é
 * responsabilidade dela (o núcleo continua 100% local).
 */

export interface Disposable {
  dispose(): void;
}

export interface ProviderMeta {
  /** Id da extensão que registra (`publisher.nome`), o mesmo de `context.extension.id`. */
  id: string;
  displayName: string;
  /** Em uma frase, mostrado no pedido de consentimento. */
  purpose: string;
  /** Domínios de destino: sem esquema, sem porta, sem caminho, sem IP. */
  destinations: string[];
}

/** O evento de atividade de agente (contrato agent-activity, ADR-0020). */
export interface RunEvent {
  run_id: string;
  event_type: string;
  timestamp: string;
  phase_id?: string;
  agent_id?: string;
  repo_id?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  initiative_id?: string;
  task_id?: string;
  /** Caminho relativo à raiz do workspace. Nunca conteúdo. */
  artifact_path?: string;
  actor?: "agent" | "human";
  /** Nome de quem decidiu (o `user.name` do git, nunca e-mail). */
  by?: string;
  harness?: "claude-code" | "copilot" | "cli" | "mcp" | "watcher";
}

export interface TemplateManifest {
  readonly id: string;
  readonly name: string;
  readonly stack: string;
  readonly version: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly rubricsAvailable: boolean;
  readonly generatedTree: readonly string[];
}

export interface ResolvedTemplateManifest {
  manifest: TemplateManifest;
  source: "cache" | "registry";
}

/** Porta de templates: só o identificador (e a versão) chega até você. */
export interface TemplateSource {
  getManifest(templateId: string): Promise<ResolvedTemplateManifest | null>;
  getZip(templateId: string, version?: string): Promise<Buffer | null>;
}

export interface RemoteSyncInput {
  initiativeId: string;
  /** Caminho relativo à raiz do workspace. */
  path: string;
  content: string;
  epicRef?: string;
  waveRef?: string;
}

export type RemoteSyncResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; syncFailed: true; reason: string }
  | { ok: true; skipped: false; syncFailed: false; contentHash: string };

/** Porta de sincronização: só os arquivos de `.github/artifacts/` que a pessoa marcar. */
export interface RemoteSyncProvider {
  pushArtifact(input: RemoteSyncInput): Promise<RemoteSyncResult>;
}

/** Porta de telemetria: os eventos da lista fechada, sem conteúdo de arquivo. */
export interface TelemetrySink {
  push(event: RunEvent): void;
}

export interface JataiApi {
  readonly apiVersion: 1;
  registerTemplateSource(source: TemplateSource, meta: ProviderMeta): Disposable;
  registerRemoteSyncProvider(provider: RemoteSyncProvider, meta: ProviderMeta): Disposable;
  registerTelemetrySink(sink: TelemetrySink, meta: ProviderMeta): Disposable;
}
