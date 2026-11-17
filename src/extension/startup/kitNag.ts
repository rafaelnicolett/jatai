/**
 * kitNag.ts — aviso de kit defasado na ativação (F3.6, Extract Module de
 * `extension.ts`).
 */

import * as vscode from "vscode";
import { getKitStatus, kitVersion, readProjectMode } from "../../data/kit-version";
import { BRAND } from "../../data/brand.pure";
import type { HostPorts } from "../ports";

/** Aviso de kit defasado já dispensado para `<workspace>@<versão>`. */
const KIT_NAG_KEY = `${BRAND.name}.kitNagDismissed`;

/**
 * Avisa quando o workspace tem estrutura de uma versão anterior do Helyx.
 *
 * O plugin atualiza sozinho; o workspace do cliente não. Sem este aviso, um
 * workspace roda meses com agentes de um protocolo antigo enquanto o plugin já
 * mudou — e o sintoma aparece como "o agente não faz o que a doc diz", que é
 * caríssimo de diagnosticar.
 *
 * Só avisa uma vez por versão: repetir a cada reload vira ruído e o usuário
 * aprende a ignorar.
 */
export async function checkKitVersion(context: vscode.ExtensionContext, ports: Pick<HostPorts, "workspaceRoot" | "notifier" | "chatHost">): Promise<void> {
  const root = ports.workspaceRoot.current();
  if (!root) return;

  const status = getKitStatus(root, kitVersion());
  if (!status || !status.outdated) return;

  const dismissedFor = context.globalState.get<string>(KIT_NAG_KEY);
  if (dismissedFor === `${root}@${status.current}`) return;

  const from = status.installed ?? "anterior ao versionamento";
  // A migração é só para brownfield (A6): no greenfield a ação não é oferecida.
  const actions = readProjectMode(root) === "greenfield" ? ["Ver o que muda", "Agora não"] : ["Migrar agora", "Ver o que muda", "Agora não"];
  const action = await ports.notifier.info(
    `${BRAND.displayName}: este workspace usa a estrutura ${from} e o plugin é ${status.current}. Agentes e skills podem estar defasados.`,
    ...actions
  );

  if (action === "Migrar agora") {
    await vscode.commands.executeCommand(`${BRAND.commandPrefix}.migrateKit`);
  } else if (action === "Ver o que muda") {
    await ports.chatHost.open(
      `@${BRAND.guide.name} Meu workspace usa a estrutura da ${BRAND.displayName} ${from} e o plugin é ${status.current}. O que mudou e o que a migração vai atualizar?`
    );
  } else if (action === "Agora não") {
    await context.globalState.update(KIT_NAG_KEY, `${root}@${status.current}`);
  }
}
