import { describe, it, expect } from "vitest";
import type * as vscode from "vscode";
import { CockpitNextController } from "../src/views/CockpitNextController";
import { WizardController } from "../src/wizard/WizardController";
import { getWizardSchema } from "../src/wizard/wizard-schema";
import type { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { SystemClock } from "../src/adapters/clock/Clock";
import { VsCodeWorkspaceRoot } from "../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeSettings } from "../src/adapters/settings/VsCodeSettings";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

/**
 * Design system v2 (§2.2, "Como o host é escolhido"): o `<html>` que o host
 * gera para o webview já nasce com `data-host="vscode"`. Antes só o JS do
 * webview marcava, e até o módulo rodar o painel podia mostrar por um instante
 * os neutros do protótipo (fundo marrom escuro) no lugar dos do tema do editor.
 */

const fakeContext = { subscriptions: [], extensionUri: { fsPath: "/fake/ext" } } as unknown as vscode.ExtensionContext;
const fakeWebview = { cspSource: "vscode-webview://csp", asWebviewUri: (u: unknown) => u } as unknown as vscode.Webview;

/** Atributos da tag `<html>` do documento. */
function htmlTag(html: string): string {
  return html.match(/<html\b[^>]*>/)?.[0] ?? "";
}

describe('webview: o host marca o <html> com data-host="vscode" (DS v2 §2.2)', () => {
  it("REGRESSÃO: shell do Cockpit", () => {
    const controller = new CockpitNextController(fakeContext, {
      configLoader: {} as ConfigLoader,
      repository: new YamlStateRepository(),
      clock: new SystemClock(),
      workspaceRoot: new VsCodeWorkspaceRoot(),
      settings: new VsCodeSettings(),
    });
    const html = (controller as unknown as { _buildShellHtml(w: vscode.Webview): string })._buildShellHtml(fakeWebview);
    expect(htmlTag(html)).toBe('<html lang="pt-BR" data-host="vscode">');
  });

  it("REGRESSÃO: HTML do Wizard", async () => {
    const controller = new WizardController(fakeContext, {} as ConfigLoader);
    const html = (controller as unknown as { _renderHtml(schema: unknown, w: vscode.Webview): string })._renderHtml(await getWizardSchema(), fakeWebview);
    expect(htmlTag(html)).toBe('<html lang="pt-BR" data-host="vscode">');
  });
});
