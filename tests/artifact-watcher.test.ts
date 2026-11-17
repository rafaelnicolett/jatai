import { describe, it, expect, afterEach, vi } from "vitest";
import * as path from "path";
import { ArtifactWatcher, startArtifactWatcher, type FileWatch, type FileWatcher } from "../src/state/runs/ArtifactWatcher";
import { ARTIFACT_WATCH_GLOB, artifactWrittenEvent, initiativeOfArtifactPath, watchedArtifactPath } from "../src/core/contracts/artifact-watch.pure";
import { validateRunEvent } from "../src/core/contracts/agent-activity.pure";
import type { RunEvent } from "../src/core/contracts/run-events-contract.pure";

/** Observador de artefatos (F5.2, fallback do Copilot): núcleo puro e a classe sobre a porta `FileWatcher`. */

/** A porta, escrita à mão com a forma da porta do host (`watch(baseDir, glob)`): o teste dispara os avisos. */
class FakeFileWatcher implements FileWatcher {
  readonly watches: Array<{ baseDir: string; glob: string; disposed: boolean }> = [];
  private _created: Array<(filePath: string) => void> = [];
  private _changed: Array<(filePath: string) => void> = [];

  watch(baseDir: string, glob: string): FileWatch {
    const entry = { baseDir, glob, disposed: false };
    this.watches.push(entry);
    return {
      onDidCreate: (listener) => void this._created.push(listener),
      onDidChange: (listener) => void this._changed.push(listener),
      dispose: (): void => {
        entry.disposed = true;
        this._created = [];
        this._changed = [];
      },
    };
  }

  /** Quantos ouvintes ainda estão ligados. */
  get listeners(): number {
    return this._created.length + this._changed.length;
  }

  write(fsPath: string): void {
    for (const l of this._changed) l(fsPath);
  }

  create(fsPath: string): void {
    for (const l of this._created) l(fsPath);
  }
}

const ROOT = path.join(path.sep, "ws");
const abs = (rel: string): string => path.join(ROOT, ...rel.split("/"));

function setup(): { fake: FakeFileWatcher; watcher: ArtifactWatcher; events: RunEvent[] } {
  const fake = new FakeFileWatcher();
  const events: RunEvent[] = [];
  const watcher = new ArtifactWatcher({
    root: ROOT,
    files: fake,
    now: () => new Date("2026-11-15T12:00:00.000Z"),
    record: async (_root, event) => {
      const v = validateRunEvent(event);
      if (v.ok) events.push(v.value);
      return v.ok ? { ok: true, value: { event: v.value, path: "x" } } : v;
    },
  });
  watcher.start();
  return { fake, watcher, events };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("watchedArtifactPath — o que vira evento", () => {
  it.each([
    [".github/artifacts/execution/relatorio.md", ".github/artifacts/execution/relatorio.md"],
    [".github\\artifacts\\planning\\roadmap.md", ".github/artifacts/planning/roadmap.md"],
    [".github/artifacts/initiatives.yaml", ".github/artifacts/initiatives.yaml"],
    [".github/artifacts/runs/mod-x.jsonl", null],
    [".github/artifacts/runs/archive/mod-x.20261115T000000Z.jsonl", null],
    [".github/artifacts/.state-service/server.json", null],
    [".github/artifacts/.initiatives.yaml.tmp-123-abcdef12", null],
    [".github/artifacts/initiatives.yaml.lock", null],
    [".github/artifacts/execution/relatorio.md~", null],
    ["src/index.ts", null],
    [".github/artifacts", null],
  ])("%s → %s", (input, expected) => {
    expect(watchedArtifactPath(input)).toBe(expected);
  });

  it("a iniciativa sai do caminho initiatives/<id>/...", () => {
    expect(initiativeOfArtifactPath(".github/artifacts/initiatives/mod-x/delivery-state.yaml")).toBe("mod-x");
    expect(initiativeOfArtifactPath(".github/artifacts/initiatives.yaml")).toBeUndefined();
  });

  it("o evento é artifact-written, harness watcher, só o caminho e passa no validador", () => {
    const e = artifactWrittenEvent(".github/artifacts/initiatives/mod-x/x.md", "2026-11-15T12:00:00.000Z");
    expect(e).toEqual({ run_id: "artifact-watcher", event_type: "artifact-written", timestamp: "2026-11-15T12:00:00.000Z", initiative_id: "mod-x", artifact_path: ".github/artifacts/initiatives/mod-x/x.md", harness: "watcher" });
    expect(validateRunEvent(e)).toEqual({ ok: true, value: e });
  });
});

describe("ArtifactWatcher — debounce de 500 ms por arquivo", () => {
  it("só grava depois de 500 ms sem nova gravação, e 3 gravações seguidas viram um evento", async () => {
    vi.useFakeTimers();
    const { fake, watcher, events } = setup();
    for (let i = 0; i < 3; i++) {
      fake.write(abs(".github/artifacts/execution/relatorio.md"));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    await watcher.settled();
    expect(events.map((e) => e.artifact_path)).toEqual([".github/artifacts/execution/relatorio.md"]);
  });

  it("arquivos diferentes têm debounce próprio", async () => {
    vi.useFakeTimers();
    const { fake, watcher, events } = setup();
    fake.write(abs(".github/artifacts/execution/a.md"));
    fake.write(abs(".github/artifacts/execution/b.md"));
    await vi.advanceTimersByTimeAsync(500);
    await watcher.settled();
    expect(events.map((e) => e.artifact_path).sort()).toEqual([".github/artifacts/execution/a.md", ".github/artifacts/execution/b.md"]);
  });

  it("ignora runs/, .state-service/, temporários e arquivos fora do workspace", async () => {
    vi.useFakeTimers();
    const { fake, watcher, events } = setup();
    fake.write(abs(".github/artifacts/runs/mod-x.jsonl"));
    fake.write(abs(".github/artifacts/.state-service/server.json"));
    fake.write(abs(".github/artifacts/.initiatives.yaml.tmp-1-0a1b2c3d"));
    fake.write(path.join(path.sep, "outro", ".github", "artifacts", "x.md"));
    await vi.advanceTimersByTimeAsync(1_000);
    await watcher.settled();
    expect(events).toEqual([]);
  });

  it("dispose desliga a observação, cancela o debounce pendente e é idempotente", async () => {
    vi.useFakeTimers();
    const { fake, watcher, events } = setup();
    fake.write(abs(".github/artifacts/execution/relatorio.md"));
    watcher.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toEqual([]);
    expect(fake.watches[0]!.disposed).toBe(true);
    expect(fake.listeners).toBe(0);
    expect(watcher.isRunning).toBe(false);
    expect(() => watcher.dispose()).not.toThrow();
  });

  it("a criação de um arquivo também conta, como a alteração", async () => {
    vi.useFakeTimers();
    const { fake, watcher, events } = setup();
    fake.create(abs(".github/artifacts/planning/roadmap.md"));
    await vi.advanceTimersByTimeAsync(500);
    await watcher.settled();
    expect(events.map((e) => e.artifact_path)).toEqual([".github/artifacts/planning/roadmap.md"]);
  });
});

describe("ArtifactWatcher — ligação com a porta de observação do host", () => {
  it("vigia <raiz>/.github/artifacts com o glob recursivo, uma observação só mesmo com start() repetido", () => {
    const { fake, watcher } = setup();
    watcher.start();
    expect(fake.watches).toEqual([{ baseDir: path.join(ROOT, ".github", "artifacts"), glob: ARTIFACT_WATCH_GLOB, disposed: false }]);
    expect(ARTIFACT_WATCH_GLOB).toBe("**/*");
    expect(watcher.isRunning).toBe(true);
  });

  it("startArtifactWatcher cria e liga o observador de uma vez", () => {
    const fake = new FakeFileWatcher();
    const watcher = startArtifactWatcher(ROOT, fake);
    expect(watcher.isRunning).toBe(true);
    expect(fake.watches).toHaveLength(1);
    watcher.dispose();
  });
});
