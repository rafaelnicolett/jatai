import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import type { HostAdapter, WizardStep } from "../types";
import { ConfigLoader } from "../adapters/config/ConfigLoader";
import { NullTemplateSource, type TemplateSource } from "../adapters/templates/TemplateSource";
import { getWizardSchema } from "./wizard-schema";
import { WizardSession, type WizardHostPort } from "./WizardSession";
import { BRAND } from "../data/brand.pure";
import type { FolderPicker } from "../adapters/folders/FolderPicker";
import { VsCodeFolderPicker } from "../adapters/folders/VsCodeFolderPicker";
import type { WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import { VsCodeWorkspaceRoot } from "../adapters/workspace/VsCodeWorkspaceRoot";
import type { HostToWizardMessage, WizardMessage } from "../shared/wizard-protocol";

/**
 * Controla o fluxo do wizard via VS Code WebviewPanel.
 * State driven por wizard-schema.json — zero hardcode de stack.
 *
 * Desde o passo W1 da F3.10 (ADR-0019), o estado e as regras moram na
 * `WizardSession`; o controller é o adaptador do VS Code: cria o painel,
 * renderiza o HTML e implementa a `WizardHostPort` (postMessage, diálogos,
 * barramento de comandos). Desde o W6, a interface é só o app React do
 * webview (`webview-ui/src/apps/wizard`): o Wizard legado, que nasceu num
 * template literal deste arquivo, saiu.
 */
/** Portas do VS Code que o Wizard usa (F4.3); o composition root entrega as dele, e sem elas valem as do VS Code. */
export interface WizardPorts {
  folderPicker?: FolderPicker;
  workspaceRoot?: WorkspaceRoot;
  /** A instalação terminou com sucesso: a barra lateral refaz o convite (G9). */
  onInstalled?: () => void;
}

export class WizardController {
  private readonly _context: vscode.ExtensionContext;
  private readonly _configLoader: ConfigLoader;
  private readonly _session: WizardSession;
  private readonly _folderPicker: FolderPicker;
  private readonly _workspaceRoot: WorkspaceRoot;
  private readonly _onInstalled: (() => void) | undefined;
  private _panel: vscode.WebviewPanel | undefined;

  constructor(
    context: vscode.ExtensionContext,
    configLoader: ConfigLoader,
    templateSource: TemplateSource = new NullTemplateSource(),
    ports: WizardPorts = {}
  ) {
    this._context = context;
    this._configLoader = configLoader;
    this._folderPicker = ports.folderPicker ?? new VsCodeFolderPicker();
    this._workspaceRoot = ports.workspaceRoot ?? new VsCodeWorkspaceRoot();
    this._onInstalled = ports.onInstalled;
    this._session = new WizardSession(this._hostPort(), templateSource, undefined, this._workspaceRoot);
  }

  /** O painel do Wizard está aberto (o `WizardLauncher` só cria outro Wizard depois que este fecha). */
  get isOpen(): boolean {
    return this._panel !== undefined;
  }

  async start(): Promise<void> {
    if (this._panel !== undefined) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      `${BRAND.name}Wizard`,
      `${BRAND.displayName}: Initialize Delivery Kit`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._context.extensionUri, "dist"),
        ],
      }
    );

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    this._panel.webview.onDidReceiveMessage(
      (msg: WizardMessage) => this._session.handle(msg),
      undefined,
      this._context.subscriptions
    );

    const schema = await getWizardSchema();
    this._panel.webview.html = this._renderHtml(schema, this._panel.webview);
  }

  /** Adaptador VS Code da porta da sessão. Cada método é o efeito que o controller fazia direto antes do W1. */
  private _hostPort(): WizardHostPort {
    return {
      postMessage: (msg: HostToWizardMessage): void => {
        void this._panel?.webview.postMessage(msg);
      },
      render: (schema: readonly WizardStep[]): void => {
        if (this._panel !== undefined) {
          this._panel.webview.html = this._renderHtml(schema, this._panel.webview);
        }
      },
      dispose: (): void => {
        this._panel?.dispose();
      },
      pickFolder: (): Promise<string | undefined> =>
        this._folderPicker.pick({ openLabel: "Selecionar pasta", title: `Escolha onde criar o projeto ${BRAND.displayName}` }),
      confirm: async (message: string, action: string): Promise<boolean> => {
        const choice = await vscode.window.showWarningMessage(message, { modal: true }, action);
        return choice === action;
      },
      executeCommand: async (command: string, ...args: unknown[]): Promise<unknown> => vscode.commands.executeCommand(command, ...args),
      onInstalled: (): void => this._onInstalled?.(),
      workspaceHostAdapter: (dir: string): Promise<HostAdapter> =>
        new ConfigLoader([{ uri: vscode.Uri.file(dir), name: path.basename(dir), index: 0 }]).hostAdapter(),
    };
  }

  /** Bootstrap do app (`#hx-boot`): schema, estado e modo da sessão, e a marca. */
  private _boot(schema: unknown): string {
    return serializeBoot({
      schema,
      state: this._session.state,
      brownfield: this._session.isBrownfield,
      brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
      workspace: { folder: this._workspaceRoot.current() ?? null, folderCount: this._workspaceRoot.all().length },
      modeChosen: this._session.modeChosen,
    });
  }

  /**
   * HTML do Wizard: o bundle `dist/webview/wizard.js` e o
   * `assets/wizard.css` do build do webview (`vite.config.wizard.ts`), com a
   * mesma CSP do Cockpit (script só com nonce; estilo, fonte e imagem só do
   * próprio pacote) e o bootstrap JSON. Sem código executável inline: a classe
   * de bug do hotfix-wizard-intro-blank-screen (escape dentro de um template
   * literal) não tem mais onde acontecer.
   */
  private _renderHtml(schema: unknown, webview: vscode.Webview): string {
    const nonce = getNonce();
    const uri = (...parts: string[]): string => webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview", ...parts)).toString();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR" data-host="vscode">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND.displayName}: Setup</title>
  <link rel="stylesheet" href="${uri("assets", "wizard.css")}">
</head>
<body>
  <div id="root"></div>
  <script type="application/json" id="hx-boot">${this._boot(schema)}</script>
  <script nonce="${nonce}" type="module" src="${uri("wizard.js")}"></script>
</body>
</html>`;
  }
}

/**
 * JSON do bootstrap dentro de `<script type="application/json">`. Todo `<`
 * vira o escape unicode `\u003c`: um valor com `</script>` (um nome de
 * projeto digitado, por exemplo) não fecha o bloco antes da hora.
 * `JSON.parse` devolve o mesmo valor.
 */
function serializeBoot(boot: unknown): string {
  return JSON.stringify(boot).replace(/</g, "\\u003c");
}

/** Nonce da CSP: 128 bits do gerador criptográfico, em 32 chars hex (A16e — antes era `Math.random`). */
function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
