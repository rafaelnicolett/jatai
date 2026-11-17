/**
 * ArtifactWatcher.ts — o observador de artefatos, fallback universal de
 * atividade (F5.2, contrato agent-activity §4; ADR-0020: "no Copilot, o tempo
 * real depende do fallback por artefato").
 *
 * Cada gravação em `.github/artifacts/**` (fora `runs/`, `.state-service/` e
 * temporários; regra em `core/contracts/artifact-watch.pure.ts`) vira um
 * `artifact-written` com `harness: "watcher"`, gravado em `runs/*.jsonl` sob
 * lock (`appendRunEvent`). Gravações seguidas do mesmo arquivo esperam 500 ms
 * sem nova gravação e viram um evento só.
 *
 * O observador recebe as mudanças por uma porta, sem depender do VS Code.
 * `FileWatcher` e `FileWatch` abaixo têm a mesma forma da porta de observação
 * de arquivos do host (`adapters/files/FileWatcher`, F3.6, da frente C):
 * `watch(baseDir, glob)` devolve uma observação com `onDidCreate`,
 * `onDidChange` e `dispose`, e os avisos trazem o caminho absoluto. Por serem
 * estruturalmente iguais, o `VsCodeFileWatcher` do container da extensão serve
 * como está; na integração, estas duas interfaces podem ser trocadas por um
 * `import type` da porta do host.
 *
 * Ponto de ligação (o `extension.ts` e o `WorkspaceServices` são da frente C,
 * e esta frente não os toca). Na subida dos serviços do workspace, depois de
 * `this._runsWatcher.start()`, com o `fileWatcher` que o container já tem:
 *
 *   this._artifactWatcher = startArtifactWatcher(stateServiceRoot, fileWatcher);
 *
 * e, em `stop()`, `this._artifactWatcher?.dispose()`.
 *
 * No Claude Code os hooks do kit também registram a escrita: o mesmo arquivo
 * pode aparecer duas vezes (harness `claude-code` e `watcher`). Quem mostra
 * (`deriveColmeia`) junta os dois.
 */
import * as path from "path";
import {
  ARTIFACTS_PATH,
  ARTIFACT_WATCH_DEBOUNCE_MS,
  ARTIFACT_WATCH_GLOB,
  artifactWrittenEvent,
  watchedArtifactPath,
} from "../../core/contracts/artifact-watch.pure";
import type { FieldResult } from "../../core/validation/validation";
import { BRAND } from "../../core/brand/brand.pure";
import { appendRunEvent, type AppendedRunEvent } from "./run-event-log";

/** Uma observação em curso: avisa com o caminho absoluto do arquivo criado ou alterado. */
export interface FileWatch {
  onDidCreate(listener: (filePath: string) => void): void;
  onDidChange(listener: (filePath: string) => void): void;
  dispose(): void;
}

/** Porta: a fonte das mudanças de arquivo. Vigia `glob` (ex.: `**\/*`) dentro de `baseDir`. */
export interface FileWatcher {
  watch(baseDir: string, glob: string): FileWatch;
}

export interface ArtifactWatcherOptions {
  /** Raiz do workspace. */
  root: string;
  /** A porta de observação de arquivos. */
  files: FileWatcher;
  /** Onde o evento é gravado. Default `appendRunEvent` (runs/*.jsonl, sob lock). */
  record?: (root: string, event: unknown) => Promise<FieldResult<AppendedRunEvent>>;
  /** Default 500 ms (contrato §4). */
  debounceMs?: number;
  /** Relógio do evento. Default: agora. */
  now?: () => Date;
}

export class ArtifactWatcher {
  private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _watch: FileWatch | null = null;
  private readonly _pending = new Set<Promise<void>>();

  constructor(private readonly _options: ArtifactWatcherOptions) {}

  /** `true` entre `start()` e `dispose()`. */
  get isRunning(): boolean {
    return this._watch !== null;
  }

  /** Começa a vigiar `<raiz>/.github/artifacts` (em qualquer profundidade). Idempotente. */
  start(): void {
    if (this._watch) return;
    const watch = this._options.files.watch(path.join(this._options.root, ...ARTIFACTS_PATH), ARTIFACT_WATCH_GLOB);
    const onFile = (filePath: string): void => this.notify(filePath);
    watch.onDidCreate(onFile);
    watch.onDidChange(onFile);
    this._watch = watch;
  }

  /**
   * Uma mudança no arquivo `absolutePath`. Público porque é o ponto que um
   * teste exercita sem depender do timing do sistema de arquivos.
   */
  notify(absolutePath: string): void {
    const relative = path.relative(this._options.root, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return;
    const artifact = watchedArtifactPath(relative);
    if (!artifact) return;

    const previous = this._timers.get(artifact);
    if (previous) clearTimeout(previous);
    this._timers.set(
      artifact,
      setTimeout(() => {
        this._timers.delete(artifact);
        this._track(this._emit(artifact));
      }, this._options.debounceMs ?? ARTIFACT_WATCH_DEBOUNCE_MS)
    );
  }

  /** Espera as gravações de evento em curso (para desligar sem perder o último). */
  async settled(): Promise<void> {
    await Promise.all([...this._pending]);
  }

  /** Para de vigiar e cancela o que ainda esperava o debounce. Idempotente. */
  dispose(): void {
    this._watch?.dispose();
    this._watch = null;
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
  }

  private _track(promise: Promise<void>): void {
    this._pending.add(promise);
    void promise.finally(() => this._pending.delete(promise));
  }

  private async _emit(artifact: string): Promise<void> {
    const record = this._options.record ?? appendRunEvent;
    const timestamp = (this._options.now?.() ?? new Date()).toISOString();
    try {
      const result = await record(this._options.root, artifactWrittenEvent(artifact, timestamp));
      if (!result.ok) console.error(`[${BRAND.name}] observador de artefatos: evento recusado para ${artifact}: ${result.error.message}`);
    } catch (err) {
      console.error(`[${BRAND.name}] observador de artefatos: falha ao gravar o evento de ${artifact}:`, err);
    }
  }
}

/** Cria e liga o observador sobre a porta dada. O `dispose` do observador devolvido desliga a observação. */
export function startArtifactWatcher(root: string, files: FileWatcher): ArtifactWatcher {
  const artifactWatcher = new ArtifactWatcher({ root, files });
  artifactWatcher.start();
  return artifactWatcher;
}
