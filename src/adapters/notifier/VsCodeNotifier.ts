/**
 * VsCodeNotifier.ts — a porta `Notifier` sobre `vscode.window`
 * (`show*Message` e `withProgress` em notificação).
 */

import * as vscode from "vscode";
import type { Notifier, NotifyOptions, ProgressStep } from "./Notifier";

export class VsCodeNotifier implements Notifier {
  info(message: string, ...actions: string[]): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showInformationMessage(message, ...actions));
  }

  warn(message: string, ...actions: string[]): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showWarningMessage(message, ...actions));
  }

  error(message: string, ...actions: string[]): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showErrorMessage(message, ...actions));
  }

  ask(message: string, options: NotifyOptions, ...actions: string[]): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showWarningMessage(message, options, ...actions));
  }

  progress<T>(title: string, task: (report: (step: ProgressStep) => void) => PromiseLike<T>): Promise<T> {
    return Promise.resolve(
      vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: false }, (progress) =>
        task((step) => progress.report(step))
      )
    );
  }
}
