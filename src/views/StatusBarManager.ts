import * as vscode from "vscode";
import { BRAND } from "../data/brand.pure";

/**
 * Gerencia o Status Bar item do Helyx — abre o Cockpit ao clicar.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._item.command = `${BRAND.commandPrefix}.openCockpitNext`;
    this._item.text = `$(${BRAND.name}-mark) ${BRAND.displayName}`;
    this._item.tooltip = `${BRAND.displayName} — clique para abrir o Cockpit`;
    this._item.show();
  }

  dispose(): void {
    this._item.dispose();
  }
}
