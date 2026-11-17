import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendRunEvent, runEventFilePath, previousRunEventFilePath, PREVIOUS_DIR, RUNS_ARCHIVE_DIR } from "../src/state/runs/run-event-log";
import { parseRunEvents } from "../src/core/contracts/run-events-contract.pure";

/**
 * A escrita de `runs/*.jsonl` (F5.2, contrato agent-activity §6): validação,
 * arquivo por iniciativa, lock e rotação. Antes o append era sem lock
 * (`appendLine`).
 */
const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-run-log-"));
  tmpDirs.push(root);
  return root;
}

const ev = (i: number, initiative: string | null = "mod-x"): Record<string, unknown> => ({
  run_id: "r1",
  event_type: "agent-progress",
  timestamp: `2026-11-15T12:00:${String(i).padStart(2, "0")}Z`,
  ...(initiative ? { initiative_id: initiative } : {}),
  message: `passo ${i}`,
});

const lines = (file: string): string[] => fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
const FAST_LOCK = { retryMs: 5, maxRetries: 400, staleMs: 60_000 };

describe("appendRunEvent — arquivo por iniciativa", () => {
  it("grava em runs/<iniciativa>.jsonl e, sem iniciativa, em runs/workspace.jsonl", async () => {
    const root = workspace();
    const a = await appendRunEvent(root, ev(1));
    const b = await appendRunEvent(root, ev(2, null));
    expect(a.ok && a.value.path).toBe(runEventFilePath(root, "mod-x"));
    expect(b.ok && b.value.path).toBe(path.join(root, ".github/artifacts/runs/workspace.jsonl"));
    expect(parseRunEvents(fs.readFileSync(runEventFilePath(root, "mod-x"), "utf-8"))).toHaveLength(1);
  });

  it("evento inválido não grava nada e devolve o erro de uso", async () => {
    const root = workspace();
    const r = await appendRunEvent(root, { run_id: "r", event_type: "x", timestamp: "t" });
    expect(r).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "event_type" } });
    expect(fs.existsSync(path.join(root, ".github/artifacts/runs"))).toBe(false);
  });

  it.each(["../fora", "a/b", ".escondido", "x\\y"])("iniciativa '%s' não vira nome de arquivo: USAGE", async (id) => {
    const root = workspace();
    const r = await appendRunEvent(root, { ...ev(1), initiative_id: id });
    expect(r).toMatchObject({ ok: false, error: { code: "USAGE", field: "initiative_id" } });
  });
});

describe("appendRunEvent — sob lock", () => {
  it("REGRESSÃO: espera o lock do arquivo e só grava depois que ele sai (o append era sem lock)", async () => {
    const root = workspace();
    const file = runEventFilePath(root, "mod-x");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.lock`, "outro-processo");
    const pending = appendRunEvent(root, ev(1), { lock: FAST_LOCK });
    await new Promise((r) => setTimeout(r, 40));
    expect(fs.existsSync(file)).toBe(false);
    fs.rmSync(`${file}.lock`);
    const r = await pending;
    expect(r.ok).toBe(true);
    expect(lines(file)).toHaveLength(1);
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });
});

describe("appendRunEvent — rotação por iniciativa", () => {
  it("no limite, o arquivo cheio vai para runs/previous/ e o evento novo abre um arquivo novo", async () => {
    const root = workspace();
    for (let i = 0; i < 3; i++) await appendRunEvent(root, ev(i), { maxEventsPerFile: 3 });
    const r = await appendRunEvent(root, ev(3), { maxEventsPerFile: 3 });
    const active = runEventFilePath(root, "mod-x");
    const previous = previousRunEventFilePath(root, "mod-x");
    expect(previous).toBe(path.join(path.dirname(active), PREVIOUS_DIR, "mod-x.jsonl"));
    expect(r.ok && r.value.rotatedTo).toBe(previous);
    expect(lines(previous)).toHaveLength(3);
    expect(lines(active)).toHaveLength(1);
  });

  it("na rotação seguinte, o previous de antes vai para runs/archive/ com carimbo, e só a iniciativa cheia roda", async () => {
    const root = workspace();
    const now = (): Date => new Date("2026-11-15T12:34:56.789Z");
    for (let i = 0; i < 7; i++) await appendRunEvent(root, ev(i), { maxEventsPerFile: 3, now });
    await appendRunEvent(root, ev(1, "outra"), { maxEventsPerFile: 3, now });
    const dir = path.join(root, ".github/artifacts/runs");
    // o topo de runs/ (o que o watcher vigia) só tem os arquivos ativos; o cheio mais recente mora em previous/
    expect(fs.readdirSync(dir).sort()).toEqual([RUNS_ARCHIVE_DIR, "mod-x.jsonl", "outra.jsonl", PREVIOUS_DIR]);
    expect(fs.readdirSync(path.join(dir, PREVIOUS_DIR))).toEqual(["mod-x.jsonl"]);
    expect(fs.readdirSync(path.join(dir, RUNS_ARCHIVE_DIR))).toEqual(["mod-x.20261115T123456Z.jsonl"]);
    expect(lines(path.join(dir, RUNS_ARCHIVE_DIR, "mod-x.20261115T123456Z.jsonl"))).toHaveLength(3);
    expect(lines(path.join(dir, PREVIOUS_DIR, "mod-x.jsonl"))).toHaveLength(3);
    expect(lines(path.join(dir, "mod-x.jsonl"))).toHaveLength(1);
  });

  it("linhas ilegíveis não contam como evento para o limite", async () => {
    const root = workspace();
    const file = runEventFilePath(root, "mod-x");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${"lixo que não é json, mas é comprido o bastante para passar do mínimo de bytes\n".repeat(5)}`);
    const r = await appendRunEvent(root, ev(1), { maxEventsPerFile: 3 });
    expect(r.ok && r.value.rotatedTo).toBeUndefined();
  });
});
