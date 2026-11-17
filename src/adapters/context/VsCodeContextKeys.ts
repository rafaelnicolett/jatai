/**
 * VsCodeContextKeys.ts — a porta `ContextKeys` sobre o comando `setContext`.
 */

import * as vscode from "vscode";
import type { ContextKeys } from "./ContextKeys";

export class VsCodeContextKeys implements ContextKeys {
  async set(key: string, value: boolean): Promise<void> {
    await vscode.commands.executeCommand("setContext", key, value);
  }
}
