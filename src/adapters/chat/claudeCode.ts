/**
 * claudeCode.ts — levar um pedido ao Claude Code (F3.7, extraído de
 * `views/actions/hostChat.ts` para servir também ao `ChatHost`, H-BUG-24).
 *
 * O Claude Code não tem um comando de "abrir com query" como o chat do
 * Copilot: o pedido vai para a área de transferência, no formato do slash
 * command (`/<marca> …`), e a view do Claude Code ganha o foco.
 */

import * as vscode from "vscode";
import { BRAND, type Brand } from "../../core/brand/brand.pure";

/**
 * Prompt do chat (`@<participante> …`) na forma do Claude Code, que entra pelo
 * slash command: `/<marca> …`. Vale para o participante atual, os de marcas
 * anteriores (`brand.json › legacy.participants`, ADR-0013) e o `@maestro` do
 * Copilot.
 */
export function toClaudeCodePrompt(rawPrompt: string, brand: Brand = BRAND): string {
  let prompt = rawPrompt;
  for (const mention of [brand.participant.name, ...brand.legacy.participants]) {
    prompt = prompt.replace(new RegExp(`^@${mention}\\b\\s*`, "m"), `/${brand.name} `);
  }
  return prompt.replace(/^@maestro\b\s*/m, `/${brand.name} `);
}

/** Copia `prompt` (já no formato do Claude Code) e foca a view do Claude Code. */
export async function openInClaudeCode(prompt: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);

  const claudeCommands = [
    "claude-code.focus",
    "workbench.panel.chat.view.claude-code.focus",
    "claude.focus",
  ];
  for (const cmd of claudeCommands) {
    try {
      await vscode.commands.executeCommand(cmd);
      break;
    } catch { /* tenta o próximo */ }
  }

  void vscode.window.showInformationMessage(
    "Prompt copiado — cole no Claude Code com ⌘V (ou Ctrl+V).",
    "OK"
  );
}
