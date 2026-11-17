/**
 * FileWatcher.ts — porta de observação de arquivos (F3.6).
 *
 * Vigia arquivos de uma pasta por um padrão glob e avisa com o caminho
 * absoluto do arquivo criado ou alterado. Sem `vscode` nem I/O.
 */

export interface FileWatch {
  onDidCreate(listener: (filePath: string) => void): void;
  onDidChange(listener: (filePath: string) => void): void;
  dispose(): void;
}

export interface FileWatcher {
  /** Começa a vigiar `glob` (ex.: `*.jsonl`) dentro de `baseDir`. */
  watch(baseDir: string, glob: string): FileWatch;
}

/** Observador manual, para testes: o teste dispara os eventos. */
export class ManualFileWatcher implements FileWatcher {
  readonly watches: Array<{ baseDir: string; glob: string; disposed: boolean; fire(kind: "create" | "change", filePath: string): void }> = [];

  watch(baseDir: string, glob: string): FileWatch {
    const created: Array<(p: string) => void> = [];
    const changed: Array<(p: string) => void> = [];
    const entry = {
      baseDir,
      glob,
      disposed: false,
      fire: (kind: "create" | "change", filePath: string): void => {
        for (const l of kind === "create" ? created : changed) l(filePath);
      },
    };
    this.watches.push(entry);
    return {
      onDidCreate: (l) => void created.push(l),
      onDidChange: (l) => void changed.push(l),
      dispose: (): void => {
        entry.disposed = true;
      },
    };
  }
}
