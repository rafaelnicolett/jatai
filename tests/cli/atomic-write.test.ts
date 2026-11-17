import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { atomicWrite, readFileOrEmpty, appendLine } from "../../src/cli/lib/atomic-write";

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-atomic-write-"));

describe("readFileOrEmpty", () => {
  it("devolve '' quando o arquivo não existe, sem lançar", () => {
    expect(readFileOrEmpty(path.join(tmpDir(), "nao-existe.yaml"))).toBe("");
  });
});

describe("atomicWrite", () => {
  it("cria o diretório e o arquivo do zero quando nenhum dos dois existe", async () => {
    const root = tmpDir();
    const target = path.join(root, "a", "b", "delivery-state.yaml");
    const { changed } = await atomicWrite(target, (current) => {
      expect(current).toBe("");
      return "phases:\n  business:\n    status: done\n";
    });
    expect(changed).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toContain("status: done");
  });

  it("changed: false e nenhuma escrita em disco quando mutate devolve o mesmo conteúdo", async () => {
    const root = tmpDir();
    const target = path.join(root, "delivery-state.yaml");
    fs.writeFileSync(target, "phases:\n  business:\n    status: done\n", "utf-8");
    const mtimeBefore = fs.statSync(target).mtimeMs;

    const { changed } = await atomicWrite(target, (current) => current); // no-op

    expect(changed).toBe(false);
    expect(fs.statSync(target).mtimeMs).toBe(mtimeBefore);
  });

  it("não deixa arquivo .tmp-* pra trás depois de uma escrita bem-sucedida", async () => {
    const root = tmpDir();
    const target = path.join(root, "delivery-state.yaml");
    await atomicWrite(target, () => "phases:\n  business:\n    status: done\n");

    const leftovers = fs.readdirSync(root).filter((f) => f.includes(".tmp-"));
    expect(leftovers).toEqual([]);
  });

  it("libera o lock mesmo quando `mutate` lança — e a próxima escrita não fica travada", async () => {
    const root = tmpDir();
    const target = path.join(root, "delivery-state.yaml");

    await expect(
      atomicWrite(target, () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    // Se o lock não tivesse sido liberado, esta segunda chamada travaria
    // até estourar o timeout (~6s) — o teste falharia por timeout do vitest.
    const { changed } = await atomicWrite(target, () => "phases:\n  business:\n    status: done\n");
    expect(changed).toBe(true);
  });

  // A11 / L11: o State Service e o Cockpit escrevem de dentro do Extension
  // Host. Com `Atomics.wait`, um lock ocupado congelava a thread (e todas as
  // extensões) por até ~6 s, e nem o timer do outro processo liberando o lock
  // conseguia rodar.
  it("REGRESSÃO: esperar um lock ocupado não bloqueia o event loop; a escrita entra quando o lock sai (A11)", async () => {
    const root = tmpDir();
    const target = path.join(root, "initiatives.yaml");
    const lockPath = `${target}.lock`;
    fs.writeFileSync(lockPath, "99999"); // lock recente de outro processo
    let ticks = 0;
    const ticker = setInterval(() => { ticks++; }, 5);
    setTimeout(() => fs.rmSync(lockPath, { force: true }), 60); // o outro processo termina
    try {
      const { changed } = await atomicWrite(target, () => "active: x\n", { retryMs: 20, maxRetries: 20 });
      expect(changed).toBe(true);
    } finally {
      clearInterval(ticker);
    }
    expect(ticks).toBeGreaterThan(0);
    expect(fs.readFileSync(target, "utf-8")).toBe("active: x\n");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("lock que nunca sai: desiste com LOCK_TIMEOUT depois das tentativas, sem gravar", async () => {
    const root = tmpDir();
    const target = path.join(root, "initiatives.yaml");
    fs.writeFileSync(`${target}.lock`, "99999");
    await expect(atomicWrite(target, () => "active: x\n", { retryMs: 5, maxRetries: 3 })).rejects.toThrow(/LOCK_TIMEOUT/);
    expect(fs.existsSync(target)).toBe(false);
  });

  it("chamadas sequenciais no MESMO arquivo compõem (segunda escrita enxerga o resultado da primeira)", async () => {
    const root = tmpDir();
    const target = path.join(root, "delivery-state.yaml");

    await atomicWrite(target, () => "phases:\n  business:\n    status: done\n");
    await atomicWrite(target, (current) => current + "  product:\n    status: in-progress\n");

    const final = fs.readFileSync(target, "utf-8");
    expect(final).toContain("business:");
    expect(final).toContain("product:");
  });
});

describe("appendLine", () => {
  it("cria o arquivo e o diretório se não existirem, e faz append sem sobrescrever", () => {
    const root = tmpDir();
    const target = path.join(root, "runs", "foundation-2026-08-04.jsonl");

    appendLine(target, JSON.stringify({ event_type: "agent-started" }));
    appendLine(target, JSON.stringify({ event_type: "agent-done" }));

    const lines = fs.readFileSync(target, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event_type: "agent-started" });
    expect(JSON.parse(lines[1]!)).toMatchObject({ event_type: "agent-done" });
  });
});
