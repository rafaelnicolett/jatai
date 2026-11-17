/**
 * ui.ts — as duas telas da API de extensão (F2.5): "Extensões conectadas" e o
 * envio de artefatos. O `window` entra por parâmetro para os testes exercitarem
 * a lista sem abrir o VS Code; os comandos passam `vscode.window`.
 */

import type { Notifier } from "../../adapters/notifier/Notifier";
import { BRAND } from "../../core/brand/brand.pure";
import { PROVIDER_PORT_LABEL, type ConsentStatus, type ProviderPort } from "../../core/extension-api/api-contract.pure";
import type { ConnectionInfo, ProviderHub } from "./ProviderHub";

export interface QuickPickWindow {
  showQuickPick(items: unknown, options?: unknown): Promise<unknown> | Thenable<unknown>;
}

export interface ConnectionItem {
  label: string;
  description: string;
  detail: string;
  connection: ConnectionInfo;
}

const STATUS_LABEL: Record<ConsentStatus, string> = {
  allowed: "autorizada",
  pending: "aguardando a decisão",
  denied: "recusada",
  revoked: "revogada",
};

export function statusText(info: ConnectionInfo): string {
  if (info.status === "allowed") return info.enabled ? "ligada" : "autorizada, desligada";
  return STATUS_LABEL[info.status];
}

/** As linhas que a pessoa vê, na ordem em que foram registradas. */
export function connectionItems(hub: ProviderHub): ConnectionItem[] {
  return hub.connections().map((connection) => ({
    label: `${connection.displayName} — ${PROVIDER_PORT_LABEL[connection.port]}`,
    description: statusText(connection),
    detail: connection.purpose,
    connection,
  }));
}

/**
 * "Extensões conectadas": lista o que está registrado neste workspace, com a
 * porta e o estado, e deixa ligar, desligar ou revogar. Sem nada registrado,
 * explica como uma extensão aparece.
 */
export async function openConnectedExtensions(hub: ProviderHub, notifier: Notifier, window: QuickPickWindow): Promise<void> {
  const items = connectionItems(hub);
  if (items.length === 0) {
    await notifier.info(
      "Nenhuma extensão conectada. Quando uma extensão companheira pedir a API da " +
        `${BRAND.displayName}, o pedido de consentimento aparece aqui e você decide por workspace.`,
      "Entendi"
    );
    return;
  }

  const picked = (await window.showQuickPick(items, {
    placeHolder: "Extensões conectadas — escolha uma conexão para ligar, desligar ou revogar",
  })) as ConnectionItem | undefined;
  if (!picked) return;

  const action = (await window.showQuickPick(["Ligar", "Desligar", "Revogar"], {
    placeHolder: `${picked.label}: o que fazer?`,
  })) as string | undefined;
  if (!action) return;

  const { port, id } = picked.connection;
  if (action === "Ligar") await hub.setEnabled(port, id, true);
  else if (action === "Desligar") await hub.setEnabled(port, id, false);
  else if (action === "Revogar") await hub.revoke(port, id);
}

export interface ArtifactItem {
  label: string;
}

/** Caminhos que a pessoa escolhe no envio (todos dentro de `.github/artifacts/`, sem segredo/evento/temporário). */
export function artifactItems(hub: ProviderHub): ArtifactItem[] {
  return hub.listSendable().map((label) => ({ label }));
}

/**
 * "Enviar artefatos": sem uma extensão ligada na sincronização, avisa e não
 * oferece nada; com uma, oferece só os artefatos elegíveis e envia apenas os
 * marcados. Cancelar (ou fechar) não envia nada.
 */
export async function sendArtifacts(hub: ProviderHub, notifier: Notifier, window: QuickPickWindow): Promise<void> {
  if (!hub.activeRemoteSync()) {
    await notifier.warn(
      "Não há serviço conectado na sincronização de artefatos. Abra \"Extensões conectadas\" para ligar uma extensão companheira.",
      "Entendi"
    );
    return;
  }

  const items = artifactItems(hub);
  if (items.length === 0) {
    await notifier.info("Nenhum artefato disponível para enviar neste workspace.", "Entendi");
    return;
  }

  const picked = (await window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Artefatos de .github/artifacts/ para enviar (só os marcados saem)",
  })) as ArtifactItem[] | undefined;
  if (!picked || picked.length === 0) return;

  await hub.sendArtifacts(picked.map((item) => item.label));
}

/** Rótulo de porta para mensagens fora da lista (diagnóstico e docs). */
export function portLabel(port: ProviderPort): string {
  return PROVIDER_PORT_LABEL[port];
}
