import * as vscode from "vscode";
import type { ConfigLoader } from "../adapters/config/ConfigLoader";
import { BRAND } from "../data/brand.pure";

/**
 * MainPanelProvider — hoje é só um redirecionador, não uma sidebar de
 * verdade. O container de activity bar do Helyx precisa de pelo menos uma
 * view registrada pra existir (é a única forma de VS Code mostrar o ícone
 * na barra lateral), mas o dashboard antigo que vivia aqui (ações rápidas,
 * mini-pipeline, health checks) duplicava — e ficava desatualizado em
 * relação a — o Cockpit real. Em vez disso: ao clicar no ícone, a view
 * resolve e fecha a sidebar na mesma hora — mas PRA ONDE ela manda depende
 * de já existir projeto configurado (o config da marca ou um nome legado, via o mesmo
 * `ConfigLoader` que o dashboard antigo usava pra decidir entre o painel do
 * projeto e a tela de boas-vindas): com projeto, abre o Cockpit; sem
 * projeto, abre o wizard — nunca o Cockpit de um workspace que ainda não
 * existe.
 */
export class MainPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = `${BRAND.name}.mainPanel`;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _configLoader: ConfigLoader
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: false, localResourceRoots: [] };
    webviewView.webview.html = "";

    const redirect = (): void => {
      void this._redirect();
    };

    // Primeiro clique no ícone (a view ainda não tinha sido resolvida nesta sessão).
    redirect();

    // VS Code só chama `resolveWebviewView` uma vez — cliques seguintes no ícone só
    // tornam a MESMA view visível de novo, sem resolver de novo. Sem isto, só o
    // primeiro clique redirecionaria; os próximos reabririam a sidebar vazia.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) redirect();
    });
  }

  private async _redirect(): Promise<void> {
    this._configLoader.invalidate();
    const configured = await this._configLoader.isConfigured();
    await vscode.commands.executeCommand(configured ? `${BRAND.commandPrefix}.openCockpitNext` : `${BRAND.commandPrefix}.initializeDeliveryKit`);
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
  }

  /** No-op — mantido só pra não quebrar os call sites existentes que ainda chamam `refresh()` após mudanças de estado. */
  refresh(): void {}
}
