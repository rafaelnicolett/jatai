/**
 * createJataiApi.ts — o objeto que `activate()` devolve em
 * `vscode.extensions.getExtension("jatai.jatai").exports` (F2.5, ADR-0023).
 *
 * A API é só a superfície: validação, consentimento e o que cada porta pode
 * receber ficam no `ProviderHub`. `apiVersion` muda só em major.
 */

import type { RemoteSyncProvider } from "../../adapters/sync/RemoteSyncProvider";
import type { TemplateSource } from "../../adapters/templates/TemplateSource";
import type { ProviderMeta } from "../../core/extension-api/api-contract.pure";
import { API_VERSION, type DisposableLike, type ExtensionTelemetrySink, type ProviderHub } from "./ProviderHub";

export interface JataiApiV1 {
  /** Versão da API pública; muda só em major (ADR-0023 §7). */
  readonly apiVersion: typeof API_VERSION;
  registerTemplateSource(source: TemplateSource, meta: ProviderMeta): DisposableLike;
  registerRemoteSyncProvider(provider: RemoteSyncProvider, meta: ProviderMeta): DisposableLike;
  registerTelemetrySink(sink: ExtensionTelemetrySink, meta: ProviderMeta): DisposableLike;
}

export function createJataiApi(hub: ProviderHub): JataiApiV1 {
  return {
    apiVersion: API_VERSION,
    registerTemplateSource: (source, meta) => hub.registerTemplateSource(source, meta),
    registerRemoteSyncProvider: (provider, meta) => hub.registerRemoteSyncProvider(provider, meta),
    registerTelemetrySink: (sink, meta) => hub.registerTelemetrySink(sink, meta),
  };
}
