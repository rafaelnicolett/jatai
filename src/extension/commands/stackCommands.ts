/**
 * stackCommands.ts — `<marca>.startStack` e `<marca>.stopStack`: docker-compose no terminal (F3.6, um módulo por comando).
 */

import * as vscode from "vscode";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerStartStackCommand({ ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.startStack`, () => {
    const terminal = vscode.window.createTerminal(`${BRAND.displayName} Stack`);
    terminal.show();
    const root = ports.workspaceRoot.current();
    terminal.sendText(
      root
        ? `cd "${root}" && docker-compose -f infrastructure/docker-compose.local.yml up -d`
        : "docker-compose up -d"
    );
  });
}

export function registerStopStackCommand({ ports }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.stopStack`, () => {
    const terminal = vscode.window.createTerminal(`${BRAND.displayName} Stack`);
    terminal.show();
    const root = ports.workspaceRoot.current();
    terminal.sendText(
      root
        ? `cd "${root}" && docker-compose -f infrastructure/docker-compose.local.yml down`
        : "docker-compose down"
    );
  });
}
