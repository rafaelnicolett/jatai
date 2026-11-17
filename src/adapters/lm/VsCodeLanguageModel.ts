/**
 * VsCodeLanguageModel.ts — a porta `LanguageModel` sobre `vscode.lm`.
 *
 * Prefere um modelo capaz e cai para qualquer modelo do Copilot, nessa
 * ordem de seletores.
 */

import * as vscode from "vscode";
import type { LanguageModel, LanguageModelSession } from "./LanguageModel";

export class VsCodeLanguageModel implements LanguageModel {
  async select(): Promise<LanguageModelSession | null> {
    let models: readonly vscode.LanguageModelChat[] = [];
    try {
      // Prefer a capable model; fall back to whatever Copilot provides
      models = await vscode.lm.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
      if (!models.length) {
        models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      }
    } catch {
      models = [];
    }
    const model = models[0];
    if (!model) return null;
    return {
      send: async (prompt, cancel): Promise<AsyncIterable<string>> => {
        const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, cancel as vscode.CancellationToken);
        return response.text;
      },
    };
  }
}
