/**
 * DelegatingRemoteSyncProvider.ts — a porta `RemoteSyncProvider` que o
 * container entrega (F2.5, ADR-0023).
 *
 * Sem provedor consentido, responde como a edição aberta: `skipped`, nada sai
 * da máquina. Com um, delega; uma exceção do provedor vira `syncFailed` no
 * resultado, porque a porta promete nunca lançar (o espelho não pode impedir
 * a escrita local, ADR-0011).
 */

import type { RemoteSyncInput, RemoteSyncProvider, RemoteSyncResult } from "./RemoteSyncProvider";

export class DelegatingRemoteSyncProvider implements RemoteSyncProvider {
  constructor(private readonly _active: () => RemoteSyncProvider | null) {}

  async pushArtifact(input: RemoteSyncInput): Promise<RemoteSyncResult> {
    const provider = this._active();
    if (!provider) return { ok: true, skipped: true, reason: "nenhum serviço de sincronização conectado" };
    try {
      return await provider.pushArtifact(input);
    } catch (err) {
      return { ok: true, skipped: false, syncFailed: true, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
