/**
 * welcomeView.ts — a view de boas-vindas da barra lateral (G9, F4.3).
 *
 * O VS Code só desenha `contributes.viewsWelcome` em view de ÁRVORE vazia
 * ("Welcome content only applies to empty tree views"), e a view principal
 * da marca é um webview. Por isso o convite mora numa view de árvore sem
 * itens, no mesmo container, que só aparece fora de workspace da marca
 * (`when: !<marca>.isWorkspace`). Esta função só registra o provedor vazio: o
 * conteúdo e as ações ("Começar", "Abrir uma pasta", "Criar um projeto novo")
 * são do manifesto.
 */

import * as vscode from "vscode";
import { BRAND } from "../../data/brand.pure";

export const WELCOME_VIEW_ID = `${BRAND.name}.welcome`;

export function registerWelcomeView(): vscode.Disposable {
  const empty: vscode.TreeDataProvider<never> = {
    getTreeItem: (element) => element,
    getChildren: () => [],
  };
  return vscode.window.registerTreeDataProvider(WELCOME_VIEW_ID, empty);
}
