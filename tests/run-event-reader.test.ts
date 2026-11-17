import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RunEventReader, nodeRunFiles, type RunFiles } from "../src/state/runs/RunEventReader";
import { parseRunEvents, type RunEvent } from "../src/core/contracts/run-events-contract.pure";
import { loadRunEvents } from "../src/data/run-events-contract";

/**
 * Leitura incremental dos runs (F5.2, H-GAP-18). A prova principal é de
 * equivalência: depois de qualquer sequência de gravações (append, linha a
 * meio, reescrita, truncamento, arquivo novo, arquivo apagado, lixo), o
 * leitor incremental devolve exatamente o que a leitura completa de antes
 * devolveria.
 */
const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace(): { root: string; dir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-reader-"));
  tmpDirs.push(root);
  const dir = path.join(root, ".github/artifacts/runs");
  fs.mkdirSync(path.join(dir, "previous"), { recursive: true });
  return { root, dir };
}

/**
 * A leitura completa de referência: a `loadRunEvents` até a onda 4 (todos os arquivos, inteiros, a cada chamada),
 * com a janela ao vivo da F5.2, que é o topo de `runs/` mais `runs/previous/`.
 */
function fullRead(root: string, limit: number): RunEvent[] {
  const dir = path.join(root, ".github/artifacts/runs");
  const all: RunEvent[] = [];
  for (const d of [dir, path.join(dir, "previous")]) {
    if (!fs.existsSync(d)) continue;
    for (const file of fs.readdirSync(d).filter((f) => f.endsWith(".jsonl"))) all.push(...parseRunEvents(fs.readFileSync(path.join(d, file), "utf-8")));
  }
  all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return all.slice(-limit);
}

/** PRNG com semente: a mesma sequência em todo SO e toda execução. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function counting(): { files: RunFiles; bytes: () => number } {
  let total = 0;
  return {
    files: { ...nodeRunFiles, read: (file, start, end) => { const b = nodeRunFiles.read(file, start, end); total += b.length; return b; } },
    bytes: () => total,
  };
}

const line = (ts: string, i: number, extra = ""): string => `${JSON.stringify({ run_id: `r${i}`, event_type: "agent-progress", timestamp: ts, agent_id: `@a${i % 3}`, message: `m${i}${extra}` })}\n`;

describe("RunEventReader — equivalência com a leitura completa", () => {
  it.each([1, 2, 3, 4, 5])("sequência aleatória %i: em todo passo, o mesmo resultado da leitura completa (janelas 5 e 200)", (seed) => {
    const rand = prng(seed);
    const { root, dir } = workspace();
    const small = new RunEventReader();
    const big = new RunEventReader();
    const names = ["a.jsonl", "b.jsonl", "previous/c.jsonl"];
    let n = 0;
    for (let step = 0; step < 120; step++) {
      const file = path.join(dir, names[Math.floor(rand() * names.length)]!);
      const op = rand();
      // horários com repetição e atrasados, para o desempate e o M4 aparecerem
      const ts = `2026-11-15T12:${String(Math.floor(rand() * 20)).padStart(2, "0")}:00Z`;
      if (op < 0.5) fs.appendFileSync(file, line(ts, n++));
      else if (op < 0.6) fs.appendFileSync(file, line(ts, n++).slice(0, 20));
      else if (op < 0.68) fs.appendFileSync(file, "\n");
      else if (op < 0.74) fs.appendFileSync(file, "lixo que não é json\n");
      else if (op < 0.8 && fs.existsSync(file)) fs.writeFileSync(file, line(ts, n++, "-reescrito") + line(ts, n++));
      else if (op < 0.84 && fs.existsSync(file)) fs.truncateSync(file, Math.floor(fs.statSync(file).size / 2));
      else if (op < 0.88 && fs.existsSync(file)) fs.rmSync(file);
      else fs.appendFileSync(file, line(ts, n++) + line(ts, n++));
      expect(small.read(root, 5), `passo ${step}`).toEqual(fullRead(root, 5));
      expect(big.read(root, 200), `passo ${step}`).toEqual(fullRead(root, 200));
    }
  });

  it("a mesma instância atende janelas diferentes sem misturar", () => {
    const { root, dir } = workspace();
    for (let i = 0; i < 30; i++) fs.appendFileSync(path.join(dir, "a.jsonl"), line(`2026-11-15T12:00:${String(i).padStart(2, "0")}Z`, i));
    const reader = new RunEventReader();
    expect(reader.read(root, 5)).toEqual(fullRead(root, 5));
    expect(reader.read(root, 20)).toEqual(fullRead(root, 20));
    expect(reader.read(root, 5)).toEqual(fullRead(root, 5));
  });

  it("o arquivo cheio mais recente (runs/previous/) entra na janela ao vivo; o histórico (runs/archive/) não", () => {
    const { root, dir } = workspace();
    fs.mkdirSync(path.join(dir, "previous"), { recursive: true });
    fs.mkdirSync(path.join(dir, "archive"), { recursive: true });
    fs.writeFileSync(path.join(dir, "mod-x.jsonl"), line("2026-11-15T12:00:03Z", 3));
    fs.writeFileSync(path.join(dir, "previous", "mod-x.jsonl"), line("2026-11-15T12:00:01Z", 1) + line("2026-11-15T12:00:02Z", 2));
    fs.writeFileSync(path.join(dir, "archive", "mod-x.20261115T000000Z.jsonl"), line("2026-11-15T11:00:00Z", 0));
    const reader = new RunEventReader();
    expect(reader.read(root).map((e) => e.run_id)).toEqual(["r1", "r2", "r3"]);
    // a rotação seguinte: o previous some da janela (foi para o histórico) e o ativo é outro arquivo
    fs.rmSync(path.join(dir, "previous", "mod-x.jsonl"));
    expect(reader.read(root).map((e) => e.run_id)).toEqual(["r3"]);
  });

  it("sem a pasta runs/: lista vazia; a pasta aparece depois: lê", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-reader-vazio-"));
    tmpDirs.push(root);
    const reader = new RunEventReader();
    expect(reader.read(root)).toEqual([]);
    fs.mkdirSync(path.join(root, ".github/artifacts/runs"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github/artifacts/runs/x.jsonl"), line("2026-11-15T12:00:00Z", 1));
    expect(reader.read(root)).toHaveLength(1);
  });
});

describe("RunEventReader — só lê o que é novo (H-GAP-18)", () => {
  it("depois da primeira leitura, um append custa os bytes novos mais a âncora de 64 bytes", () => {
    const { root, dir } = workspace();
    const file = path.join(dir, "mod-x.jsonl");
    for (let i = 0; i < 500; i++) fs.appendFileSync(file, line("2026-11-15T12:00:00Z", i));
    const { files, bytes } = counting();
    const reader = new RunEventReader(files);
    reader.read(root);
    const first = bytes();
    expect(first).toBe(fs.statSync(file).size);
    const extra = line("2026-11-15T12:30:00Z", 999);
    fs.appendFileSync(file, extra);
    expect(reader.read(root)).toEqual(fullRead(root, 200));
    expect(bytes() - first).toBe(Buffer.byteLength(extra) + 64);
    const before = bytes();
    reader.read(root);
    expect(bytes() - before).toBe(64);
  });

  it("loadRunEvents usa o leitor incremental e devolve o mesmo de antes", () => {
    const { root, dir } = workspace();
    fs.writeFileSync(path.join(dir, "a.jsonl"), line("2026-11-15T12:00:02Z", 1) + line("2026-11-15T12:00:01Z", 2));
    expect(loadRunEvents(root)).toEqual(fullRead(root, 200));
    fs.appendFileSync(path.join(dir, "a.jsonl"), line("2026-11-15T12:00:00Z", 3));
    expect(loadRunEvents(root)).toEqual(fullRead(root, 200));
  });
});
