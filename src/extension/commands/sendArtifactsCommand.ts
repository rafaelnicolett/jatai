/**
 * sendArtifactsCommand.ts — `<marca>.sendArtifacts` (F2.5, ADR-0023 §4): envia
 * ao provedor de sincronização consentido só os arquivos de
 * `.github/artifacts/` que a pessoa marcar.
 */

import * as vscode from "vscode";
import { sendArtifacts } from "../api/ui";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerSendArtifactsCommand({ apiHub, ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.sendArtifacts`, async () => {
    if (!apiHub) return;
    await sendArtifacts(apiHub, ports.notifier, vscode.window);
  });
}
