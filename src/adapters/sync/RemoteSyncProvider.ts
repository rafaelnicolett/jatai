/**
 * RemoteSyncProvider.ts
 *
 * Porta de saída para espelhar, num serviço remoto, um artefato que já foi
 * gravado no disco. O git continua sendo a fonte da verdade (ADR-0011): o
 * espelho nunca impede nem reverte uma escrita local. ADR-0015: a edição
 * aberta é 100% local, então a implementação ligada por padrão é a
 * `NullRemoteSyncProvider`, que nunca envia nada. Uma extensão companheira
 * pode trazer a sua implementação sem fork.
 *
 * Hoje a porta não tem consumidor: o único que havia, o `kb push` do CLI
 * (Modo Online), saiu na F2.1. Ela fica como o contrato da fronteira de
 * plugin; quem a liga é a API que essa fronteira vier a exportar.
 *
 * Arquivo sem `vscode` nem I/O: pode ser importado pelo CLI e pelo host.
 */

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

export interface RemoteSyncProvider {
  /** Nunca lança: falha de espelho vira `syncFailed`, ausência de remoto vira `skipped`. */
  pushArtifact(input: RemoteSyncInput): Promise<RemoteSyncResult>;
}

/** Implementação padrão da edição aberta: nada sai da máquina. */
export class NullRemoteSyncProvider implements RemoteSyncProvider {
  pushArtifact(_input: RemoteSyncInput): Promise<RemoteSyncResult> {
    return Promise.resolve({ ok: true, skipped: true, reason: "espelho remoto desligado na edição aberta (ADR-0015)" });
  }
}
