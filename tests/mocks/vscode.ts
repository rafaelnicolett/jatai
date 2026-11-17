/**
 * Stub mínimo da API do VS Code para testes em Node.
 *
 * O módulo `vscode` só existe dentro do host — qualquer `src/` que o importe
 * é intestável sem este alias (ver `vitest.config.ts`). Mantenha o stub
 * enxuto: só o que os testes realmente exercitam. Se um teste precisar de mais
 * superfície, adicione aqui em vez de mockar caso a caso.
 */

/**
 * Stub de `RelativePattern` — só guarda `base`/`pattern`; nenhum teste hoje
 * precisa que o glob seja de fato avaliado (o `FileSystemWatcher` abaixo
 * nunca dispara sozinho, ver seu comentário).
 */
export class RelativePattern {
  constructor(
    public readonly base: string,
    public readonly pattern: string
  ) {}
}

function noopDisposable(): { dispose: () => void } {
  return { dispose: () => undefined };
}

/**
 * Stub de `FileSystemWatcher` — só o suficiente pro ciclo de vida
 * (`start()`/`stop()`/`isRunning`) de código como `RunsWatcher` ser
 * exercitado sem lançar. Não dispara `onDidChange`/`onDidCreate` sozinho
 * (não há `fs.watch` real por trás) — testes que precisam simular "o
 * arquivo mudou" chamam o método de tratamento do próprio consumidor
 * diretamente (ex.: `RunsWatcher.handleFileEvent`), não via este stub.
 */
class FileSystemWatcherStub {
  onDidCreate(_listener: (uri: { fsPath: string }) => void): { dispose: () => void } {
    return noopDisposable();
  }
  onDidChange(_listener: (uri: { fsPath: string }) => void): { dispose: () => void } {
    return noopDisposable();
  }
  onDidDelete(_listener: (uri: { fsPath: string }) => void): { dispose: () => void } {
    return noopDisposable();
  }
  dispose(): void {
    // nada a liberar no stub
  }
}

/**
 * Overrides settáveis por teste para `workspace.getConfiguration(...).get(key)`
 * — sem isso, todo teste receberia sempre o `defaultValue` do chamador,
 * impossível de exercitar um caminho que depende de uma setting ligada
 * (ex.: `helyx.onlineMode`, `online-mode-environment.test.ts`). Chave é
 * `"<section>.<key>"` (ex.: `"helyx.onlineMode"`); `resetConfigOverrides()`
 * limpa entre testes — chame no `afterEach` de quem usar isto.
 */
const configOverrides = new Map<string, unknown>();

export function setConfigOverride(section: string, key: string, value: unknown): void {
  configOverrides.set(`${section}.${key}`, value);
}

export function resetConfigOverrides(): void {
  configOverrides.clear();
}

/**
 * `TextDocumentContentProvider`s registrados por esquema (documentos
 * virtuais, só em memória). O teste lê o conteúdo por aqui.
 */
export const textDocumentContentProviders = new Map<string, { provideTextDocumentContent(uri: unknown): string | undefined }>();

export const workspace = {
  /** Sem workspace aberto — os testes passam `targetDir` explicitamente. */
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      const fullKey = section ? `${section}.${key}` : key;
      return configOverrides.has(fullKey) ? (configOverrides.get(fullKey) as T) : defaultValue;
    },
  }),
  createFileSystemWatcher: (_pattern: RelativePattern | string): FileSystemWatcherStub => new FileSystemWatcherStub(),
  onDidChangeConfiguration: (_listener: (event: { affectsConfiguration: (section: string) => boolean }) => void) => noopDisposable(),
  registerTextDocumentContentProvider: (scheme: string, provider: { provideTextDocumentContent(uri: unknown): string | undefined }) => {
    textDocumentContentProviders.set(scheme, provider);
    return { dispose: () => textDocumentContentProviders.delete(scheme) };
  },
  /** Workspace Trust: o stub trata toda pasta como confiável, como o VS Code depois do aceite. */
  isTrusted: true,
};

/** Extensões instaladas (F2.5): o stub não tem nenhuma; os testes da API usam o fake rico. */
export const extensions = {
  getExtension: (_id: string): unknown => undefined,
  all: [] as unknown[],
};

export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  registerTreeDataProvider: () => ({ dispose: () => undefined }),
};

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
  from: (c: { scheme: string; path: string; query?: string }) => ({
    scheme: c.scheme,
    path: c.path,
    query: c.query ?? "",
    fsPath: c.path,
    toString: () => `${c.scheme}:${c.path}${c.query ? `?${c.query}` : ""}`,
  }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join("/"),
  }),
};
