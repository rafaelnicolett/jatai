/**
 * WorkspaceRoot.ts — porta da raiz do workspace aberto (F3.6).
 *
 * Substitui as leituras espalhadas de `vscode.workspace.workspaceFolders?.[0]`.
 * A v1 trabalha com uma pasta por janela (decisão do titular, 2026-11-15):
 * a raiz é a primeira pasta aberta, e `undefined` quando não há pasta.
 * Lida a cada chamada, porque a pasta muda sem recarregar a extensão em
 * alguns fluxos. Sem `vscode` nem I/O.
 */

export interface WorkspaceRoot {
  /** Caminho absoluto da pasta aberta; `undefined` sem pasta. */
  current(): string | undefined;
  /**
   * Todas as pastas abertas, a primeira primeiro. Só serve para avisar que a
   * v1 usa uma pasta por janela (F4.3): quem trabalha usa `current()`.
   */
  all(): readonly string[];
  /** Avisa quando as pastas abertas mudam (G9, F4.3): a context key do primeiro uso se refaz. */
  onDidChange(listener: () => void): { dispose(): void };
}

/** Raiz fixa, para testes. `extra` são as outras pastas de uma janela com mais de uma. */
export class FixedWorkspaceRoot implements WorkspaceRoot {
  private readonly _listeners = new Set<() => void>();

  constructor(
    private _root: string | undefined,
    private readonly _extra: readonly string[] = []
  ) {}

  /** Troca a pasta aberta e avisa quem ouve (o teste faz o papel do editor). */
  change(root: string | undefined): void {
    this._root = root;
    for (const listener of this._listeners) listener();
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this._listeners.add(listener);
    return { dispose: (): void => void this._listeners.delete(listener) };
  }

  current(): string | undefined {
    return this._root;
  }

  all(): readonly string[] {
    return this._root === undefined ? [] : [this._root, ...this._extra];
  }
}
