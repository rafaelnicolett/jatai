/**
 * ports.ts — as portas da casca do VS Code (F3.6, ADR-0016) e a fábrica das
 * implementações de produção. Só o composition root (`extension.ts`, via o
 * container) chama `createVsCodePorts`; o resto recebe `HostPorts` pronto.
 */

import type * as vscode from "vscode";
import { SystemClock, type Clock } from "../adapters/clock/Clock";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import { VsCodeWorkspaceRoot } from "../adapters/workspace/VsCodeWorkspaceRoot";
import type { Settings } from "../adapters/settings/Settings";
import { VsCodeSettings } from "../adapters/settings/VsCodeSettings";
import type { Secrets } from "../adapters/secrets/Secrets";
import { VsCodeSecrets } from "../adapters/secrets/VsCodeSecrets";
import type { Notifier } from "../adapters/notifier/Notifier";
import { VsCodeNotifier } from "../adapters/notifier/VsCodeNotifier";
import type { ChatHost, ChatHostId } from "../adapters/chat/ChatHost";
import { VsCodeChatHost } from "../adapters/chat/VsCodeChatHost";
import type { FileWatcher } from "../adapters/files/FileWatcher";
import { VsCodeFileWatcher } from "../adapters/files/VsCodeFileWatcher";
import type { LanguageModel } from "../adapters/lm/LanguageModel";
import { VsCodeLanguageModel } from "../adapters/lm/VsCodeLanguageModel";
import type { FolderPicker } from "../adapters/folders/FolderPicker";
import { VsCodeFolderPicker } from "../adapters/folders/VsCodeFolderPicker";
import type { ContextKeys } from "../adapters/context/ContextKeys";
import { VsCodeContextKeys } from "../adapters/context/VsCodeContextKeys";

export interface HostPorts {
  clock: Clock;
  workspaceRoot: WorkspaceRoot;
  settings: Settings;
  secrets: Secrets;
  notifier: Notifier;
  chatHost: ChatHost;
  fileWatcher: FileWatcher;
  languageModel: LanguageModel;
  /** Seletor de pasta do Wizard (F4.3): onde criar o projeto ou o workspace. */
  folderPicker: FolderPicker;
  /** Context keys do editor (G9, F4.3): o que as cláusulas `when` do manifesto leem. */
  contextKeys: ContextKeys;
}

/** `resolveHost`: o harness do workspace, para o chat levar pedidos ao Claude Code ou ao Copilot (H-BUG-24). */
export function createVsCodePorts(context: vscode.ExtensionContext, resolveHost?: () => Promise<ChatHostId>): HostPorts {
  return {
    clock: new SystemClock(),
    workspaceRoot: new VsCodeWorkspaceRoot(),
    settings: new VsCodeSettings(),
    secrets: new VsCodeSecrets(context.secrets),
    notifier: new VsCodeNotifier(),
    chatHost: new VsCodeChatHost(resolveHost),
    fileWatcher: new VsCodeFileWatcher(),
    languageModel: new VsCodeLanguageModel(),
    folderPicker: new VsCodeFolderPicker(),
    contextKeys: new VsCodeContextKeys(),
  };
}
