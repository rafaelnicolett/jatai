/**
 * VsCodeFileWatcher.ts — a porta `FileWatcher` sobre
 * `workspace.createFileSystemWatcher` com `RelativePattern`.
 */

import * as vscode from "vscode";
import type { FileWatch, FileWatcher } from "./FileWatcher";

export class VsCodeFileWatcher implements FileWatcher {
  watch(baseDir: string, glob: string): FileWatch {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(baseDir, glob));
    return {
      onDidCreate: (listener) => void watcher.onDidCreate((uri) => listener(uri.fsPath)),
      onDidChange: (listener) => void watcher.onDidChange((uri) => listener(uri.fsPath)),
      dispose: (): void => {
        watcher.dispose();
      },
    };
  }
}
