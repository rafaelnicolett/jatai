/**
 * openCode.ts — levar um pedido ao OpenCode (epic-9).
 *
 * O OpenCode é um harness externo: não há view de chat no VS Code. O pedido
 * vai para a área de transferência no formato do comando (`/<marca> …`) e o
 * usuário cola no OpenCode (ou roda o comando no terminal). É o equivalente
 * do `claudeCode.ts`, sem o foco de view (não existe).
 */

import * as vscode from "vscode";
import { toClaudeCodePrompt } from "./claudeCode";

/**
 * O formato do pedido é o mesmo do Claude Code: `@<marca> …` vira
 * `/<marca> …`, que é o comando nativo nos dois. Mantido como alias nomeado
 * para o chamador não depender do módulo do outro harness.
 */
export const toOpenCodePrompt = toClaudeCodePrompt;

/** Copia `prompt` (já no formato do comando) e avisa onde colar. */
export async function openInOpenCode(prompt: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(
    "Prompt copiado — cole no OpenCode com ⌘V (ou Ctrl+V) ou rode o comando no terminal.",
    "OK"
  );
}
