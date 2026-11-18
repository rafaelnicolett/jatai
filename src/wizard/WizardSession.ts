import * as os from "os";
import * as path from "path";
import { validateWorkspaceDir, type WorkspaceValidation } from "./workspace-validation";
import { WizardStateSchema, type HostAdapter, type TemplateManifest, type WizardStatePartial, type WizardStep } from "../types";
import { NullTemplateSource, type ResolvedTemplateManifest, type TemplateSource } from "../adapters/templates/TemplateSource";
import { getBrownfieldSchema, getWizardSchema } from "./wizard-schema";
import { BRAND } from "../data/brand.pure";
import type { HostToWizardMessage, WizardMessage } from "../shared/wizard-protocol";
import { FixedWorkspaceRoot, type WorkspaceRoot } from "../adapters/workspace/WorkspaceRoot";
import { resolveTargetDir } from "../generator/greenfield/target-dir";

/**
 * Porta do Wizard para o lado do VS Code (painel, diálogos, barramento de
 * comandos). O `WizardController` é o adaptador; os testes usam um dublê.
 */
export interface WizardHostPort {
  /** Posta uma mensagem no webview do painel aberto (nada, se não houver painel). */
  postMessage(msg: HostToWizardMessage): void;
  /** Re-renderiza o painel inteiro com `schema` e o estado atual da sessão. */
  render(schema: readonly WizardStep[]): void;
  /** Fecha o painel. */
  dispose(): void;
  /** Seletor de pasta; `undefined` se o usuário cancelar. */
  pickFolder(): Promise<string | undefined>;
  /** Diálogo modal com uma ação; `true` só se o usuário escolher a ação. */
  confirm(message: string, action: string): Promise<boolean>;
  /** Barramento Wizard → gerador (`<prefixo>._generateStructure` / `_installAgentStructure`). Relança o erro. */
  executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
  /** Host do workspace já existente (config ou orquestrador no disco), usado na retomada. */
  workspaceHostAdapter(dir: string): Promise<HostAdapter>;
  /** A instalação ou a geração terminou com sucesso (G9, F4.3): a barra lateral refaz o convite sem recarregar a janela. */
  onInstalled?(): void;
}

const STACK_LABELS: Record<string, string> = {
  "python-api":      "FastAPI",
  "python-agentic":  "Python Agentic",
  "java-spring":     "Spring Boot",
  "dotnet-core":     ".NET 8",
  "react-vite":      "React + Vite",
  flutter:           "Flutter",
  "android-compose": "Android",
  "ios-swiftui":     "iOS SwiftUI",
};

/**
 * Manifest local do preview, montado a partir do estado do Wizard, para o
 * passo nunca travar quando não há `TemplateSource` plugada (o padrão da
 * edição aberta, ADR-0015). A árvore é ilustrativa.
 */
export function buildLocalManifest(templateId: string, state: WizardStatePartial): TemplateManifest {
  const backend = state.backendStack ?? "python-api";
  const frontend = state.frontendStack && state.frontendStack !== "none" ? state.frontendStack : null;
  const projectSlug = state.projectName ?? "meu-projeto";

  const tags: string[] = [
    backend,
    ...(frontend ? [frontend] : []),
    state.hostAdapter ?? "copilot",
    ...(state.cloud && state.cloud !== "none" ? [state.cloud] : []),
  ];

  const hostDir = state.hostAdapter === "claude" ? ".claude" : state.hostAdapter === "opencode" ? ".opencode" : ".github";
  const tree: string[] = [
    `${hostDir}/`,
    `${hostDir}/agents/`,
    // os chat modes são do Copilot; o estado fica em .github/artifacts/ nos três harnesses
    ...(hostDir === ".github" ? [".github/chatmodes/"] : []),
    ...(hostDir === ".opencode" ? [".opencode/commands/", "AGENTS.md"] : []),
    `${hostDir}/skills/`,
    ".github/artifacts/",
    // o config fica na raiz do projeto, com o nome da marca (antes: `ai-sdk.config.yaml` dentro da pasta do host, que nunca existiu)
    BRAND.files.config,
    "code/",
    `code/services/${projectSlug}-api/`,
    `code/services/${projectSlug}-api/src/`,
    `code/services/${projectSlug}-api/tests/`,
    "code/services/Dockerfile",
    ...(frontend ? [`code/apps/${projectSlug}-web/`, `code/apps/${projectSlug}-web/src/`] : []),
    "api/openapi.yaml",
    "features/",
    "docs/",
    "docs/adr/",
    "infrastructure/",
    "infrastructure/docker-compose.local.yml",
    "pipelines/",
    "pipelines/ci.yaml",
  ];

  return {
    id: templateId,
    name: templateId,
    stack: backend,
    version: "local",
    description: `${STACK_LABELS[backend] ?? backend}${frontend ? ` + ${STACK_LABELS[frontend] ?? frontend}` : ""} · Host: ${state.hostAdapter ?? "copilot"} · Preview gerado localmente.`,
    tags,
    rubricsAvailable: true,
    generatedTree: tree,
  };
}

/**
 * Sessão do Wizard (F3.10, passo W1 da ADR-0019): o estado e as regras que
 * viviam no `WizardController`. Recebe cada mensagem do webview e decide o
 * que fazer; os efeitos no VS Code passam pela `WizardHostPort`.
 *
 * Vive o tempo do controller, não o do painel: fechar e reabrir o Wizard
 * mantém o estado e o modo (comportamento herdado, pinado na caracterização).
 */
export class WizardSession {
  private _state: WizardStatePartial = {};
  private _isBrownfield = false;
  private _modeChosen = false;

  constructor(
    private readonly _host: WizardHostPort,
    private readonly _templateSource: TemplateSource = new NullTemplateSource(),
    private readonly _validateWorkspaceDir: (dir: string) => Promise<WorkspaceValidation> = validateWorkspaceDir,
    /** Pasta aberta no editor (F4.3): sem ela e sem lugar escolhido, o projeto novo não é criado. */
    private readonly _workspaceRoot: WorkspaceRoot = new FixedWorkspaceRoot(undefined)
  ) {}

  /** Estado acumulado pelos `stepUpdate` (o que vai no submit e no bootstrap do HTML). */
  get state(): WizardStatePartial {
    return this._state;
  }

  get isBrownfield(): boolean {
    return this._isBrownfield;
  }

  /** A pessoa já trocou de modo (nas duas direções): o painel reabre depois da escolha do modo (F4.3). */
  get modeChosen(): boolean {
    return this._modeChosen;
  }

  async handle(msg: WizardMessage): Promise<void> {
    switch (msg.type) {
      case "stepUpdate":
        this._state = { ...this._state, ...msg.payload };
        break;

      case "pickFolder":
        await this._pickFolder();
        break;

      case "fetchTemplate":
        await this._fetchTemplateManifest(msg.templateId);
        break;

      case "submit":
        await this._onSubmit(msg.keepOpen === true);
        break;

      case "openCockpit":
        // F4.3: o botão do passo "Pronto". Quem abre o Cockpit é o comando de sempre.
        await this._host.executeCommand(`${BRAND.commandPrefix}.openCockpitNext`);
        break;

      case "cancel":
        this._host.dispose();
        break;

      case "switchToBrownfield": {
        this._isBrownfield = true;
        this._modeChosen = true;
        this._state = {};
        this._host.render(await getBrownfieldSchema());
        break;
      }

      case "switchToGreenfield": {
        this._isBrownfield = false;
        this._modeChosen = true;
        this._state = {};
        this._host.render(await getWizardSchema());
        break;
      }
    }
  }

  private async _fetchTemplateManifest(templateId: string): Promise<void> {
    // S1-EXT-03: badge [cached] vs [registry], no template source falls back to local manifest.
    // O host sempre responde: o Wizard só libera a instalação depois da prévia (H-BUG-25), então uma
    // fonte plugada que lança não pode deixar a pessoa esperando para sempre.
    let resolved: ResolvedTemplateManifest | null = null;
    try {
      resolved = await this._templateSource.getManifest(templateId);
    } catch (err) {
      console.error(`[${BRAND.name}] prévia do template: a fonte falhou, usando o manifest local:`, err);
    }
    if (resolved !== null) {
      this._host.postMessage({
        type: "templateManifest",
        manifest: resolved.manifest,
        source: resolved.source,
      });
      return;
    }

    // Sem template → build local manifest from wizard state so the step is never blocked
    this._host.postMessage({
      type: "templateManifest",
      manifest: buildLocalManifest(templateId, this._state),
      source: "local",
    });
  }

  private async _onSubmit(keepOpen: boolean): Promise<void> {
    // ── Brownfield: instala só a estrutura agêntica, não cria projeto do zero ──
    if (this._isBrownfield) {
      const targetDir = this._state.targetDirectory?.trim();
      const projectName = targetDir ? path.basename(targetDir) : undefined;

      if (!targetDir) {
        this._host.postMessage({
          type: "validationError",
          errors: { targetDirectory: ["Selecione a pasta vazia do workspace"] },
        });
        return;
      }

      // O workspace precisa ser uma pasta vazia — os repositórios entram depois,
      // em repos/, sem serem modificados. Apontar para o repositório legado é o
      // erro mais provável (era o que a versão anterior pedia), então recusamos
      // aqui em vez de instalar a estrutura agêntica dentro do código do cliente.
      const check = await this._validateWorkspaceDir(targetDir);
      if (!check.valid) {
        this._host.postMessage({
          type: "validationError",
          errors: { targetDirectory: [check.reason ?? "Pasta inválida para workspace"] },
        });
        return;
      }

      // Pasta que pode ser de um repositório do cliente (C4 / H-BUG-07): nada é
      // gravado sem um "sim" explícito. Fechar o diálogo devolve o botão.
      if (check.requiresConfirmation) {
        const confirmed = await this._host.confirm(`${BRAND.displayName}: ${check.reason ?? `Esta pasta não é um workspace ${BRAND.displayName}.`}`, "Instalar mesmo assim");
        if (!confirmed) {
          this._host.postMessage({
            type: "generationError",
            message: "instalação cancelada, nada foi gravado na pasta. Escolha uma pasta vazia ou confirme a instalação.",
          });
          return;
        }
      }

      // Retomada: o host é o do workspace (config ou disco), não o da tela —
      // senão a cópia do que falta põe o kit do outro host ao lado (achado da F6.1).
      const hostAdapter = check.resume ? await this._host.workspaceHostAdapter(targetDir) : this._state.hostAdapter ?? "copilot";

      try {
        await this._host.executeCommand(`${BRAND.commandPrefix}._installAgentStructure`, projectName, targetDir, hostAdapter, this._state.maturityFrameworks ?? ["dora-4keys"]);
        this._finish(keepOpen, { mode: "brownfield", folder: targetDir, hostAdapter });
      } catch (err) {
        this._host.postMessage({
          type: "generationError",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    // ── Greenfield ──────────────────────────────────────────────────────────
    const parseResult = WizardStateSchema.safeParse(this._state);
    if (!parseResult.success) {
      this._host.postMessage({
        type: "validationError",
        errors: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const state = parseResult.data;

    // Decisão do titular (2026-11-15): sem pasta aberta, a Jataí pede onde criar. O gerador cai na
    // pasta pessoal quando não há destino, e isso nunca pode acontecer em silêncio.
    if ((state.targetDirectory ?? "").trim() === "" && this._workspaceRoot.current() === undefined) {
      this._host.postMessage({
        type: "validationError",
        errors: { targetDirectory: ["Escolha onde criar o projeto."] },
      });
      return;
    }

    try {
      await this._host.executeCommand(`${BRAND.commandPrefix}._generateStructure`, state);
      this._finish(keepOpen, { mode: "greenfield", folder: resolveTargetDir(state, this._workspaceRoot.current(), os.homedir()), hostAdapter: state.hostAdapter });
    } catch (err) {
      // Re-enable the Generate button and surface the error
      this._host.postMessage({
        type: "generationError",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Sucesso: fecha o painel (o comportamento de sempre) ou, com `keepOpen`, diz onde a estrutura ficou (F4.3). */
  private _finish(keepOpen: boolean, done: { mode: "greenfield" | "brownfield"; folder: string; hostAdapter: HostAdapter }): void {
    this._host.onInstalled?.();
    if (!keepOpen) {
      this._host.dispose();
      return;
    }
    const open = this._workspaceRoot.current();
    this._host.postMessage({ type: "installed", ...done, folderIsOpen: open !== undefined && path.resolve(open) === path.resolve(done.folder) });
  }

  private async _pickFolder(): Promise<void> {
    const folder = await this._host.pickFolder();
    if (folder !== undefined) {
      this._state = { ...this._state, targetDirectory: folder };
      // Post a message to the webview to update the UI in-place,
      // avoiding a full HTML re-render which resets vscode.getState() and the step counter.
      this._host.postMessage({ type: "folderPicked", folder });
    }
  }
}
