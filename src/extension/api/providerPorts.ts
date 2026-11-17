/**
 * providerPorts.ts — o par de portas que o container entrega aos consumidores
 * (gerador, Wizard, envio de artefatos) antes de o hub existir (F2.5).
 *
 * O container precisa das portas na construção; o hub precisa do container
 * (barramento de eventos, portas do host) para ser construído. A ligação é
 * feita depois com `attach`: as portas respondem como Null até lá, e passam a
 * consultar o hub a cada chamada.
 */

import { DelegatingRemoteSyncProvider } from "../../adapters/sync/DelegatingRemoteSyncProvider";
import { DelegatingTemplateSource } from "../../adapters/templates/DelegatingTemplateSource";
import type { ProviderHub } from "./ProviderHub";

export class ProviderPorts {
  private _hub: ProviderHub | null = null;

  readonly templateSource = new DelegatingTemplateSource(() => this._hub?.activeTemplateSource() ?? null);
  readonly remoteSync = new DelegatingRemoteSyncProvider(() => this._hub?.activeRemoteSync() ?? null);

  attach(hub: ProviderHub): void {
    this._hub = hub;
  }
}
