/**
 * connectedExtensionsCommand.ts — `<marca>.connectedExtensions` (F2.5,
 * ADR-0023 §2): lista o que está ligado neste workspace e deixa ligar,
 * desligar ou revogar.
 */

import * as vscode from "vscode";
import { openConnectedExtensions } from "../api/ui";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerConnectedExtensionsCommand({ apiHub, ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.connectedExtensions`, async () => {
    if (!apiHub) return;
    await openConnectedExtensions(apiHub, ports.notifier, vscode.window);
  });
}
