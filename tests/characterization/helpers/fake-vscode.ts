/**
 * fake-vscode.ts — fake "rico" da API do VS Code para as suítes de
 * characterization/contract (F0.4, lane B).
 *
 * Por que não estender `tests/mocks/vscode.ts`: o stub compartilhado é
 * deliberadamente enxuto e pertence a todas as suítes (regra da F0.4: não
 * mexer em mocks compartilhados). As god files caracterizadas aqui
 * (`extension.ts`, `ConciergeParticipant.ts`, `CockpitNextController.ts`,
 * `WizardController.ts`) usam bem mais superfície — webview panels, chat
 * participant, LM, status bar, CodeLens, SecretStorage. Cada suíte de
 * `tests/characterization/` substitui o módulo `vscode` por ESTE arquivo com
 * `vi.mock("vscode", () => import("./helpers/fake-vscode"))`; o stub
 * compartilhado continua intocado para o resto da suíte.
 *
 * Princípio: o fake não decide nada sozinho. Ele (1) grava toda chamada de
 * interesse em `fake.log`, na ordem, para virar golden; (2) devolve a resposta
 * que o teste programou em `fake.responders` (default: `undefined`, igual a um
 * usuário que fecha o diálogo); (3) imita a semântica do VS Code real onde ela
 * muda o comportamento observável — ex.: `executeCommand` de um id não
 * registrado REJEITA com `command '<id>' not found`, e `registerCommand`
 * duplicado lança `command '<id>' already exists`.
 */

import * as fs from "fs";
import * as path from "path";

// ── Infra genérica ────────────────────────────────────────────────────────

export interface FakeCall {
  api: string;
  args: unknown[];
}

type AnyFn = (...args: never[]) => unknown;

/** Cópia JSON (igual ao que o VS Code faz ao serializar `postMessage`) — congela o valor no instante da chamada. */
export function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export class Disposable {
  constructor(private readonly _onDispose: () => void = () => undefined) {}
  static from(...items: Array<{ dispose(): unknown }>): Disposable {
    return new Disposable(() => items.forEach((i) => i.dispose()));
  }
  dispose(): void {
    this._onDispose();
  }
}

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => unknown> = [];
  readonly event = (listener: (e: T) => unknown): Disposable => {
    this._listeners.push(listener);
    return new Disposable(() => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    });
  };
  fire(e: T): void {
    for (const l of [...this._listeners]) l(e);
  }
  dispose(): void {
    this._listeners = [];
  }
}

// ── Valores simples (enums/classes) ───────────────────────────────────────

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 } as const;
export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;
export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: unknown) {}
}
export class ThemeColor {
  constructor(public readonly id: string) {}
}
export class RelativePattern {
  constructor(public readonly base: string, public readonly pattern: string) {}
}
export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(sl: number, sc: number, el: number, ec: number) {
    this.start = new Position(sl, sc);
    this.end = new Position(el, ec);
  }
}
export class CodeLens {
  constructor(public readonly range: Range, public readonly command?: unknown) {}
}
export class TreeItem {
  constructor(public readonly label: unknown, public readonly collapsibleState?: number) {}
}
export class MarkdownString {
  constructor(public value = "") {}
  appendMarkdown(v: string): this {
    this.value += v;
    return this;
  }
}

export class FakeUri {
  constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    private readonly _raw?: string
  ) {}
  get path(): string {
    return this.fsPath;
  }
  toString(): string {
    return this._raw ?? `${this.scheme}://${this.fsPath}`;
  }
  toJSON(): unknown {
    return { scheme: this.scheme, fsPath: this.fsPath, uri: this.toString() };
  }
}

export const Uri = {
  file: (fsPath: string): FakeUri => new FakeUri("file", fsPath),
  parse: (value: string): FakeUri => {
    const m = value.match(/^([a-zA-Z][\w+.-]*):/);
    return new FakeUri(m ? m[1]! : "file", value.replace(/^[a-zA-Z][\w+.-]*:\/\//, "/"), value);
  },
  joinPath: (base: { fsPath: string }, ...parts: string[]): FakeUri => new FakeUri("file", path.join(base.fsPath, ...parts)),
};

export const LanguageModelChatMessage = {
  User: (content: string): { role: "user"; content: string } => ({ role: "user", content }),
  Assistant: (content: string): { role: "assistant"; content: string } => ({ role: "assistant", content }),
};

// ── Estado controlável pelo teste ─────────────────────────────────────────

/** Comandos que existem num VS Code "de fábrica" (workbench/vscode.*) — resolvem sem erro. O resto, se não registrado, rejeita. */
const BUILTIN_COMMANDS = new Set([
  "workbench.action.chat.open",
  "workbench.action.closeSidebar",
  "workbench.action.toggleDevTools",
  "vscode.open",
  "vscode.openFolder",
  "vscode.diff",
  "revealInExplorer",
  "revealFileInOS",
  "setContext",
]);

type Responder = (...args: unknown[]) => unknown;

export class FakeWebview {
  private _html = "";
  readonly htmlHistory: string[] = [];
  readonly posted: unknown[] = [];
  options: unknown = undefined;
  readonly cspSource = "vscode-webview://fake-csp-source";
  private _receivers: Array<(msg: unknown) => unknown> = [];

  get html(): string {
    return this._html;
  }
  set html(value: string) {
    this._html = value;
    this.htmlHistory.push(value);
  }

  postMessage(msg: unknown): Promise<boolean> {
    this.posted.push(jsonClone(msg));
    return Promise.resolve(true);
  }

  asWebviewUri(uri: { fsPath: string }): FakeUri {
    return new FakeUri("vscode-webview", uri.fsPath, `vscode-webview://fake${uri.fsPath}`);
  }

  onDidReceiveMessage(listener: (msg: unknown) => unknown, thisArg?: unknown, disposables?: Array<{ dispose(): unknown }>): Disposable {
    const bound = thisArg ? listener.bind(thisArg) : listener;
    this._receivers.push(bound);
    const d = new Disposable(() => {
      this._receivers = this._receivers.filter((r) => r !== bound);
    });
    disposables?.push(d);
    return d;
  }

  /**
   * Entrega uma mensagem webview→host como o VS Code faz: chama os listeners
   * e espera a promise que eles devolvem. Rejeição vira `{ rejected }` (no VS
   * Code real ela some como unhandled rejection) — é um efeito observável.
   */
  async deliver(msg: unknown): Promise<{ rejected?: string }> {
    const results = await Promise.allSettled(this._receivers.map((r) => Promise.resolve(r(msg))));
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (!failure) return {};
    const reason = failure.reason as unknown;
    return { rejected: reason instanceof Error ? reason.message : String(reason) };
  }

  get receiverCount(): number {
    return this._receivers.length;
  }
}

export class FakeWebviewPanel {
  readonly webview = new FakeWebview();
  iconPath: unknown = undefined;
  visible = true;
  disposed = false;
  readonly reveals: unknown[] = [];
  private _onDispose: Array<() => unknown> = [];

  constructor(
    public readonly viewType: string,
    public readonly title: string,
    public readonly column: unknown,
    public readonly options: unknown
  ) {
    this.webview.options = options;
  }

  reveal(column?: unknown): void {
    this.reveals.push(column);
  }

  onDidDispose(listener: () => unknown): Disposable {
    this._onDispose.push(listener);
    return new Disposable(() => {
      this._onDispose = this._onDispose.filter((l) => l !== listener);
    });
  }

  onDidChangeViewState(): Disposable {
    return new Disposable();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const l of [...this._onDispose]) l();
  }
}

export interface FakeChatParticipant {
  id: string;
  handler: (...args: unknown[]) => unknown;
  iconPath?: unknown;
  followupProvider?: { provideFollowups: (...args: unknown[]) => unknown };
  dispose(): void;
}

class FakeState {
  log: FakeCall[] = [];
  workspaceFolders: Array<{ uri: FakeUri; name: string; index: number }> | undefined = undefined;
  config = new Map<string, unknown>();
  commands = new Map<string, (...args: unknown[]) => unknown>();
  /** Comandos de terceiros (Copilot/Claude Code) "instalados" neste teste — resolvem como os builtins. */
  externalCommands = new Set<string>();
  responders: Partial<Record<string, Responder>> = {};
  panels: FakeWebviewPanel[] = [];
  chatParticipants: FakeChatParticipant[] = [];
  codeLensProviders: Array<{ selector: unknown; provider: unknown }> = [];
  webviewViewProviders: Array<{ viewType: string; provider: unknown; options: unknown }> = [];
  treeDataProviders: Array<{ viewId: string; provider: unknown }> = [];
  workspaceFolderListeners: Array<() => void> = [];
  statusBarItems: Array<Record<string, unknown>> = [];
  watchers: Array<{ pattern: unknown }> = [];
  configListeners: Array<(e: { affectsConfiguration(section: string): boolean }) => unknown> = [];
  /** Extensões instaladas — `vscode.extensions.getExtension` e `.all` (F2.5). */
  extensions = new Map<string, FakeInstalledExtension>();
  /** `workspace.isTrusted` (Workspace Trust). Default confiável, como uma pasta já aceita pelo usuário. */
  trusted = true;
}

/** O que o fake sabe de uma extensão instalada: o id, a pasta e o manifesto. */
export interface FakeInstalledExtension {
  id: string;
  extensionPath: string;
  packageJSON: Record<string, unknown>;
  isActive?: boolean;
  exports?: unknown;
}

const state = new FakeState();

function record(api: string, args: unknown[]): void {
  state.log.push({ api, args });
}

function respond(api: string, args: unknown[], fallback: unknown = undefined): unknown {
  const responder = state.responders[api];
  return responder ? responder(...args) : fallback;
}

/** Painel de controle do fake — importado diretamente pelos testes (`import { fake } from "./helpers/fake-vscode"`). */
export const fake = {
  get log(): FakeCall[] {
    return state.log;
  },
  calls(api: string): unknown[][] {
    return state.log.filter((c) => c.api === api).map((c) => c.args);
  },
  /** Instala uma extensão no fake (a Jataí e as companheiras que registram). */
  setExtension(extension: FakeInstalledExtension): void {
    state.extensions.set(extension.id, extension);
  },
  clearExtensions(): void {
    state.extensions.clear();
  },
  get installedExtensions(): FakeInstalledExtension[] {
    return [...state.extensions.values()];
  },
  get commands(): Map<string, (...args: unknown[]) => unknown> {
    return state.commands;
  },
  get externalCommands(): Set<string> {
    return state.externalCommands;
  },
  get responders(): Partial<Record<string, Responder>> {
    return state.responders;
  },
  get panels(): FakeWebviewPanel[] {
    return state.panels;
  },
  get chatParticipants(): FakeChatParticipant[] {
    return state.chatParticipants;
  },
  get codeLensProviders(): Array<{ selector: unknown; provider: unknown }> {
    return state.codeLensProviders;
  },
  get webviewViewProviders(): Array<{ viewType: string; provider: unknown; options: unknown }> {
    return state.webviewViewProviders;
  },
  get treeDataProviders(): Array<{ viewId: string; provider: unknown }> {
    return state.treeDataProviders;
  },
  /** O editor trocou as pastas abertas: avisa quem ouve `workspace.onDidChangeWorkspaceFolders`. */
  fireWorkspaceFoldersChanged(): void {
    for (const listener of state.workspaceFolderListeners) listener();
  },
  get statusBarItems(): Array<Record<string, unknown>> {
    return state.statusBarItems;
  },
  get watchers(): Array<{ pattern: unknown }> {
    return state.watchers;
  },
  setWorkspaceRoot(root: string | undefined): void {
    state.workspaceFolders = root === undefined ? undefined : [{ uri: Uri.file(root), name: path.basename(root), index: 0 }];
  },
  /** Liga/desliga o Restricted Mode (`workspace.isTrusted`). */
  setTrusted(trusted: boolean): void {
    state.trusted = trusted;
  },
  setConfig(section: string, key: string, value: unknown): void {
    state.config.set(`${section}.${key}`, value);
  },
  fireConfigurationChange(changedSection: string): void {
    for (const l of [...state.configListeners]) l({ affectsConfiguration: (s: string) => changedSection.startsWith(s) || s.startsWith(changedSection) });
  },
  /** Zera tudo — chame no `beforeEach`. */
  reset(): void {
    const fresh = new FakeState();
    Object.assign(state, fresh);
  },
  /** Cria um `ExtensionContext` fake com globalState/secrets/env-collection gravando no `log`. */
  createExtensionContext(extensionPath = "/fake/extension"): FakeExtensionContext {
    return createExtensionContext(extensionPath);
  },
};

// ── ExtensionContext ───────────────────────────────────────────────────────

export interface FakeExtensionContext {
  subscriptions: Array<{ dispose(): unknown }>;
  extensionUri: FakeUri;
  extensionPath: string;
  extension: { id: string; packageJSON: Record<string, unknown>; extensionPath: string };
  globalState: {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): Promise<void>;
    keys(): readonly string[];
    setKeysForSync(keys: readonly string[]): void;
  };
  workspaceState: FakeExtensionContext["globalState"];
  secrets: {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    onDidChange: (listener: unknown) => Disposable;
  };
  environmentVariableCollection: {
    persistent: boolean;
    clear(): void;
    replace(name: string, value: string): void;
    append(name: string, value: string): void;
    prepend(name: string, value: string): void;
    get(name: string): unknown;
    entries(): Array<[string, string]>;
  };
  asAbsolutePath(rel: string): string;
  /** Dados crus — inspecionados pelos testes. */
  _globalStore: Map<string, unknown>;
  _secretStore: Map<string, string>;
  _env: Map<string, string>;
}

function memento(label: string, store: Map<string, unknown>): FakeExtensionContext["globalState"] {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => (store.has(key) ? (store.get(key) as T) : defaultValue),
    update: (key: string, value: unknown): Promise<void> => {
      record(`${label}.update`, [key, value]);
      if (value === undefined) store.delete(key);
      else store.set(key, value);
      return Promise.resolve();
    },
    keys: (): readonly string[] => [...store.keys()],
    setKeysForSync: (): void => undefined,
  };
}

function createExtensionContext(extensionPath: string): FakeExtensionContext {
  const globalStore = new Map<string, unknown>();
  const workspaceStore = new Map<string, unknown>();
  const secretStore = new Map<string, string>();
  const env = new Map<string, string>();
  return {
    subscriptions: [],
    extensionUri: Uri.file(extensionPath),
    extensionPath,
    extension: { id: "jatai.jatai", packageJSON: { name: "jatai", publisher: "jatai", displayName: "Jataí" }, extensionPath },
    globalState: memento("globalState", globalStore),
    workspaceState: memento("workspaceState", workspaceStore),
    secrets: {
      get: (key: string): Promise<string | undefined> => {
        record("secrets.get", [key]);
        return Promise.resolve(secretStore.get(key));
      },
      store: (key: string, value: string): Promise<void> => {
        record("secrets.store", [key, value]);
        secretStore.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string): Promise<void> => {
        record("secrets.delete", [key]);
        secretStore.delete(key);
        return Promise.resolve();
      },
      onDidChange: (): Disposable => new Disposable(),
    },
    environmentVariableCollection: {
      persistent: true,
      clear: (): void => {
        record("environmentVariableCollection.clear", []);
        env.clear();
      },
      replace: (name: string, value: string): void => {
        record("environmentVariableCollection.replace", [name, value]);
        env.set(name, value);
      },
      append: (name: string, value: string): void => {
        record("environmentVariableCollection.append", [name, value]);
        env.set(name, (env.get(name) ?? "") + value);
      },
      prepend: (name: string, value: string): void => {
        record("environmentVariableCollection.prepend", [name, value]);
        env.set(name, value + (env.get(name) ?? ""));
      },
      get: (name: string): unknown => env.get(name),
      entries: (): Array<[string, string]> => [...env.entries()],
    },
    asAbsolutePath: (rel: string): string => path.join(extensionPath, rel),
    _globalStore: globalStore,
    _secretStore: secretStore,
    _env: env,
  };
}

// ── Namespaces da API ──────────────────────────────────────────────────────

export const commands = {
  registerCommand: (id: string, callback: (...args: unknown[]) => unknown): Disposable => {
    record("commands.registerCommand", [id]);
    if (state.commands.has(id)) throw new Error(`command '${id}' already exists`);
    state.commands.set(id, callback);
    return new Disposable(() => {
      if (state.commands.get(id) === callback) state.commands.delete(id);
    });
  },
  executeCommand: async (id: string, ...args: unknown[]): Promise<unknown> => {
    record("commands.executeCommand", [id, ...args]);
    const registered = state.commands.get(id);
    if (registered) return registered(...args);
    const responder = state.responders[`command:${id}`];
    if (responder) return responder(...args);
    if (BUILTIN_COMMANDS.has(id) || state.externalCommands.has(id)) return undefined;
    throw new Error(`command '${id}' not found`);
  },
  getCommands: (): Promise<string[]> => Promise.resolve([...state.commands.keys()]),
};

function showMessage(kind: string) {
  return (message: string, ...items: unknown[]): Promise<unknown> => {
    record(`window.${kind}`, [message, ...items]);
    return Promise.resolve(respond(`window.${kind}`, [message, ...items]));
  };
}

export const window = {
  showInformationMessage: showMessage("showInformationMessage"),
  showWarningMessage: showMessage("showWarningMessage"),
  showErrorMessage: showMessage("showErrorMessage"),
  showTextDocument: (doc: unknown, options?: unknown): Promise<unknown> => {
    record("window.showTextDocument", options === undefined ? [doc] : [doc, options]);
    return Promise.resolve(respond("window.showTextDocument", [doc, options]));
  },
  showOpenDialog: (options: unknown): Promise<unknown> => {
    record("window.showOpenDialog", [options]);
    return Promise.resolve(respond("window.showOpenDialog", [options]));
  },
  showInputBox: (options: unknown): Promise<unknown> => {
    record("window.showInputBox", [options]);
    return Promise.resolve(respond("window.showInputBox", [options]));
  },
  showQuickPick: (items: unknown, options: unknown): Promise<unknown> => {
    record("window.showQuickPick", [items, options]);
    return Promise.resolve(respond("window.showQuickPick", [items, options]));
  },
  withProgress: async <R>(options: unknown, task: (progress: { report(v: unknown): void }) => Promise<R>): Promise<R> => {
    record("window.withProgress", [options]);
    return task({ report: (v: unknown) => record("progress.report", [v]) });
  },
  createWebviewPanel: (viewType: string, title: string, column: unknown, options: unknown): FakeWebviewPanel => {
    record("window.createWebviewPanel", [viewType, title, column, options]);
    const panel = new FakeWebviewPanel(viewType, title, column, options);
    state.panels.push(panel);
    return panel;
  },
  createTerminal: (name: string): { show(): void; sendText(text: string): void; dispose(): void } => {
    record("window.createTerminal", [name]);
    return {
      show: () => record("terminal.show", [name]),
      sendText: (text: string) => record("terminal.sendText", [name, text]),
      dispose: () => undefined,
    };
  },
  createStatusBarItem: (alignment: unknown, priority: unknown): Record<string, unknown> => {
    record("window.createStatusBarItem", [alignment, priority]);
    const item: Record<string, unknown> = {
      alignment,
      priority,
      shown: false,
      disposed: false,
    };
    item.show = (): void => {
      item.shown = true;
    };
    item.hide = (): void => {
      item.shown = false;
    };
    item.dispose = (): void => {
      item.disposed = true;
    };
    state.statusBarItems.push(item);
    return item;
  },
  registerTreeDataProvider: (viewId: string, provider: unknown): Disposable => {
    record("window.registerTreeDataProvider", [viewId]);
    state.treeDataProviders.push({ viewId, provider });
    return new Disposable();
  },
  registerWebviewViewProvider: (viewType: string, provider: unknown, options: unknown): Disposable => {
    record("window.registerWebviewViewProvider", [viewType, options]);
    state.webviewViewProviders.push({ viewType, provider, options });
    return new Disposable();
  },
};

export const workspace = {
  get workspaceFolders(): Array<{ uri: FakeUri; name: string; index: number }> | undefined {
    return state.workspaceFolders;
  },
  get isTrusted(): boolean {
    return state.trusted;
  },
  set workspaceFolders(value: Array<{ uri: FakeUri; name: string; index: number }> | undefined) {
    state.workspaceFolders = value;
  },
  getConfiguration: (section?: string): { get<T>(key: string, defaultValue?: T): T | undefined; has(key: string): boolean } => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      const fullKey = section ? `${section}.${key}` : key;
      return state.config.has(fullKey) ? (state.config.get(fullKey) as T) : defaultValue;
    },
    has: (key: string): boolean => state.config.has(section ? `${section}.${key}` : key),
  }),
  createFileSystemWatcher: (pattern: unknown): Record<string, unknown> => {
    const described =
      pattern instanceof RelativePattern ? { base: pattern.base, pattern: pattern.pattern } : pattern;
    record("workspace.createFileSystemWatcher", [described]);
    state.watchers.push({ pattern: described });
    return {
      onDidCreate: (): Disposable => new Disposable(),
      onDidChange: (): Disposable => new Disposable(),
      onDidDelete: (): Disposable => new Disposable(),
      dispose: (): void => record("watcher.dispose", [described]),
    };
  },
  onDidChangeWorkspaceFolders: (listener: () => void): Disposable => {
    state.workspaceFolderListeners.push(listener);
    return new Disposable(() => {
      state.workspaceFolderListeners = state.workspaceFolderListeners.filter((l) => l !== listener);
    });
  },
  onDidChangeConfiguration: (listener: (e: { affectsConfiguration(section: string): boolean }) => unknown): Disposable => {
    state.configListeners.push(listener);
    return new Disposable(() => {
      state.configListeners = state.configListeners.filter((l) => l !== listener);
    });
  },
  openTextDocument: (uri: { fsPath: string }): Promise<unknown> => {
    record("workspace.openTextDocument", [uri]);
    const text = fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, "utf-8") : "";
    return Promise.resolve({ uri, getText: () => text });
  },
};

export const extensions = {
  getExtension: (id: string): FakeInstalledExtension | undefined => {
    record("extensions.getExtension", [id]);
    return state.extensions.get(id);
  },
  get all(): FakeInstalledExtension[] {
    return [...state.extensions.values()];
  },
};

export const env = {
  appName: "Visual Studio Code (fake)",
  uriScheme: "vscode",
  language: "pt-br",
  openExternal: (uri: unknown): Promise<boolean> => {
    record("env.openExternal", [uri]);
    return Promise.resolve(true);
  },
  clipboard: {
    writeText: (text: string): Promise<void> => {
      record("env.clipboard.writeText", [text]);
      return Promise.resolve();
    },
    readText: (): Promise<string> => Promise.resolve(""),
  },
};

export const languages = {
  registerCodeLensProvider: (selector: unknown, provider: unknown): Disposable => {
    record("languages.registerCodeLensProvider", [selector]);
    state.codeLensProviders.push({ selector, provider });
    return new Disposable();
  },
};

export const chat = {
  createChatParticipant: (id: string, handler: (...args: unknown[]) => unknown): FakeChatParticipant => {
    record("chat.createChatParticipant", [id]);
    const participant: FakeChatParticipant = {
      id,
      handler,
      dispose: () => record("chatParticipant.dispose", [id]),
    };
    state.chatParticipants.push(participant);
    return participant;
  },
};

export const lm = {
  selectChatModels: (selector?: unknown): Promise<unknown[]> => {
    record("lm.selectChatModels", [selector]);
    return Promise.resolve(respond("lm.selectChatModels", [selector], []) as unknown[]);
  },
};

/** Garantia de tipo para o `vi.mock` — o objeto inteiro precisa estar no namespace do módulo. */
export type FakeVscodeModule = {
  fake: typeof fake;
  commands: typeof commands;
  window: typeof window;
  workspace: typeof workspace;
};

// Evita "unused" para tipos utilitários usados só por inferência em outros arquivos.
export type { AnyFn };
