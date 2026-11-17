/**
 * VsCodeFolderPicker.ts — a porta `FolderPicker` sobre `window.showOpenDialog`.
 */

import * as vscode from "vscode";
import type { FolderPicker, FolderPickerOptions } from "./FolderPicker";

export class VsCodeFolderPicker implements FolderPicker {
  async pick(options: FolderPickerOptions): Promise<string | undefined> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: options.openLabel,
      title: options.title,
      ...(options.defaultFolder ? { defaultUri: vscode.Uri.file(options.defaultFolder) } : {}),
    });
    return result && result[0] ? result[0].fsPath : undefined;
  }
}
