import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EventBus, type StateServiceEvent } from "../src/server/EventBus";
import { RunsWatcher } from "../src/server/RunsWatcher";
import { appendRunEvent } from "../src/state/runs/run-event-log";

/**
 * `RunsWatcher` é a Fonte 2 (fora do processo) do event bus do State Service
 * (item 2.3, roadmap `mod-state-service`) — cobre escritas que o Extension
 * Host nunca vê diretamente (CLI via terminal). Os testes simulam a
 * notificação do `FileSystemWatcher` chamando `handleFileEvent` diretamente
 * sobre um arquivo real num diretório temporário — o mesmo método que
 * `start()` liga a `onDidChange`/`onDidCreate` — em vez de depender do
 * timing do `fs.watch` real (evitaria flakiness sem ganhar cobertura).
 */

function tmpRunsDir(): { root: string; runsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-runs-watcher-"));
  const runsDir = path.join(root, ".github", "artifacts", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  return { root, runsDir };
}

function appendLine(filePath: string, obj: unknown): void {
  fs.appendFileSync(filePath, JSON.stringify(obj) + "\n");
}

describe("RunsWatcher — evento novo aparece no bus", () => {
  it("uma linha completa recém-escrita é publicada no bus como source: runs-watcher", () => {
    const { root, runsDir } = tmpRunsDir();
    const file = path.join(runsDir, "run-1.jsonl");
    const event = { run_id: "run-1", event_type: "agent-started", timestamp: "2026-08-26T09:00:00.000Z" };
    appendLine(file, event);

    const bus = new EventBus();
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const watcher = new RunsWatcher(root, bus);
    watcher.handleFileEvent(file);

    expect(received).toEqual([{ source: "runs-watcher", event }]);
  });

  it("só lê o delta novo — uma segunda notificação após append só publica a linha nova, não reprocessa a antiga", () => {
    const { root, runsDir } = tmpRunsDir();
    const file = path.join(runsDir, "run-2.jsonl");
    const first = { run_id: "run-2", event_type: "agent-started", timestamp: "2026-08-26T09:00:00.000Z" };
    const second = { run_id: "run-2", event_type: "agent-done", timestamp: "2026-08-26T09:05:00.000Z" };

    appendLine(file, first);
    const bus = new EventBus();
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const watcher = new RunsWatcher(root, bus);
    watcher.handleFileEvent(file);
    expect(received).toHaveLength(1);

    appendLine(file, second);
    watcher.handleFileEvent(file);

    expect(received).toHaveLength(2);
    expect(received[1]).toEqual({ source: "runs-watcher", event: second });
  });

  it("linha incompleta (escrita a meio) não é publicada — só quando o \\n final chegar numa notificação seguinte", () => {
    const { root, runsDir } = tmpRunsDir();
    const file = path.join(runsDir, "run-3.jsonl");
    const event = { run_id: "run-3", event_type: "agent-done", timestamp: "2026-08-26T09:10:00.000Z" };
    const fullLine = JSON.stringify(event);

    // Escreve só a metade da linha, sem \n — simula escrita a meio.
    fs.writeFileSync(file, fullLine.slice(0, Math.floor(fullLine.length / 2)));

    const bus = new EventBus();
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const watcher = new RunsWatcher(root, bus);
    watcher.handleFileEvent(file);
    expect(received).toHaveLength(0);

    // Completa a linha (resto + \n) — agora sim publica.
    fs.appendFileSync(file, fullLine.slice(Math.floor(fullLine.length / 2)) + "\n");
    watcher.handleFileEvent(file);

    expect(received).toEqual([{ source: "runs-watcher", event }]);
  });
});

describe("RunsWatcher — dedup contra a Fonte 1 (in-process)", () => {
  it("um evento já publicado no bus (Fonte 1) não é publicado de novo quando aparece no .jsonl (Fonte 2)", () => {
    const { root, runsDir } = tmpRunsDir();
    const file = path.join(runsDir, "run-4.jsonl");
    const event = { run_id: "run-4", event_type: "gate-approved", timestamp: "2026-08-26T09:15:00.000Z" };

    const bus = new EventBus();
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));

    // Fonte 1 já publicou este evento in-process (ex.: TelemetryBuffer).
    bus.publish({ source: "telemetry", event });

    // O mesmo evento chega no .jsonl (a mesma escrita, vista pela Fonte 2).
    appendLine(file, event);
    const watcher = new RunsWatcher(root, bus);
    watcher.handleFileEvent(file);

    // Só a publicação da Fonte 1 conta — o watcher não duplica.
    expect(received).toEqual([{ source: "telemetry", event }]);
  });

  it("eventos diferentes (mesmo run_id, timestamp distinto) não são deduplicados entre si", () => {
    const { root, runsDir } = tmpRunsDir();
    const file = path.join(runsDir, "run-5.jsonl");
    const first = { run_id: "run-5", event_type: "agent-started", timestamp: "2026-08-26T09:20:00.000Z" };
    const second = { run_id: "run-5", event_type: "agent-done", timestamp: "2026-08-26T09:21:00.000Z" };

    const bus = new EventBus();
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.publish({ source: "telemetry", event: first });
    appendLine(file, second);

    const watcher = new RunsWatcher(root, bus);
    watcher.handleFileEvent(file);

    expect(received).toEqual([
      { source: "telemetry", event: first },
      { source: "runs-watcher", event: second },
    ]);
  });
});

describe("RunsWatcher — ciclo de vida", () => {
  it("start()/stop() e isRunning refletem o estado; stop() é idempotente", () => {
    const { root } = tmpRunsDir();
    const watcher = new RunsWatcher(root, new EventBus());

    expect(watcher.isRunning).toBe(false);
    watcher.start();
    expect(watcher.isRunning).toBe(true);
    watcher.stop();
    expect(watcher.isRunning).toBe(false);
    expect(() => watcher.stop()).not.toThrow();
  });
});

describe("RunsWatcher — rotação dos runs (F5.2, contrato agent-activity §6)", () => {
  /**
   * O watcher é `*.jsonl` relativo a `runs/`: avisa só os arquivos do TOPO da
   * pasta, e só os que mudaram ou apareceram. Esta função faz o mesmo que o
   * `FileSystemWatcher` faria depois de cada gravação.
   */
  function notifyLikeTheFileWatcher(runsDir: string, watcher: RunsWatcher, known: Map<string, string>): void {
    for (const name of fs.readdirSync(runsDir).filter((f) => f.endsWith(".jsonl"))) {
      const file = path.join(runsDir, name);
      const st = fs.statSync(file);
      const signature = `${st.ino}:${st.size}`;
      if (known.get(file) === signature) continue;
      known.set(file, signature);
      watcher.handleFileEvent(file);
    }
  }

  it("REGRESSÃO: rodar o arquivo cheio não republica no bus os eventos que já foram entregues", async () => {
    const { root, runsDir } = tmpRunsDir();
    // Sem o TTL de dedup: o que se prova é o offset do watcher, não a janela de 5 s do barramento
    // (uma rotação de verdade acontece 5.000 eventos depois, muito além do TTL).
    const bus = new EventBus(-1);
    const received: StateServiceEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const watcher = new RunsWatcher(root, bus);
    const known = new Map<string, string>();

    for (let i = 0; i < 7; i++) {
      const r = await appendRunEvent(root, { run_id: "r", event_type: "agent-progress", timestamp: `2026-11-15T12:00:0${i}Z`, initiative_id: "mod-x", message: `passo ${i}` }, { maxEventsPerFile: 3 });
      expect(r.ok).toBe(true);
      notifyLikeTheFileWatcher(runsDir, watcher, known);
    }

    expect(received.map((e) => (e.event as { message: string }).message)).toEqual(["passo 0", "passo 1", "passo 2", "passo 3", "passo 4", "passo 5", "passo 6"]);
  });
});
