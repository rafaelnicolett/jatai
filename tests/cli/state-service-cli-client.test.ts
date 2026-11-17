import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { tryStateServiceWrite, STATE_SERVICE_CLI_TIMEOUT_MS } from "../../src/cli/lib/state-service-cli-client";
import { writeStateServiceInfo } from "../../src/server/state-service-info";

/**
 * Cliente HTTP de ESCRITA do CLI (item 3.1, roadmap `mod-state-service`) —
 * a peça que decide "tenta o State Service, cai pro fallback se não der".
 * Testado isoladamente aqui (unidade); o comportamento fim-a-fim do CLI
 * (fallback real gravando YAML, uso real da resposta HTTP quando o serviço
 * está de pé) é coberto em `tests/cli/state-service-fallback.test.ts`.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-cli-client-"));

const TEST_TOKEN = "cli-client-token";

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => ({
    json: async () => handler(String(input), init),
  })) as unknown as typeof fetch;
}

describe("tryStateServiceWrite", () => {
  it("sem server.json: { ok: false }, fetch nunca chamado", async () => {
    const root = tmpDir();
    let called = false;
    const result = await tryStateServiceWrite(
      "/initiatives",
      { id: "feat-x" },
      { root, fetchImpl: fakeFetch(() => { called = true; return {}; }) }
    );
    expect(result).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it("com server.json: POST na porta certa, com Authorization Bearer <token> e corpo JSON", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await tryStateServiceWrite(
      "/initiatives",
      { id: "feat-x" },
      {
        root,
        fetchImpl: fakeFetch((url, init) => {
          calls.push({ url, init });
          return { ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "feat-x" };
        }),
      }
    );

    expect(result).toEqual({ ok: true, body: { ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "feat-x" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:4321/initiatives");
    expect(calls[0]!.init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "feat-x" }),
    });
  });

  it("propaga o corpo mesmo quando o State Service respondeu com ok:false (erro de validação do servidor) — quem chama decide o que fazer", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const result = await tryStateServiceWrite(
      "/initiatives/nao-existe/bump-phase",
      { phase: "product" },
      { root, fetchImpl: fakeFetch(() => ({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", message: "não existe" } })) }
    );

    expect(result).toEqual({ ok: true, body: { ok: false, error: { code: "INITIATIVE_NOT_FOUND", message: "não existe" } } });
  });

  it("fetch falha (ECONNREFUSED — serviço parou depois do server.json ser escrito): { ok: false }, não lança", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(tryStateServiceWrite("/initiatives", { id: "x" }, { root, fetchImpl: failingFetch })).resolves.toEqual({ ok: false });
  });

  it("timeout: aborta a conexão depois de `timeoutMs`, devolve { ok: false } sem lançar, sem esperar além do timeout", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    // fetch que só resolve se a conexão for abortada (nunca responde de verdade) — simula um servidor pendurado/inalcançável.
    const hangingFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;

    const start = Date.now();
    const result = await tryStateServiceWrite("/initiatives", { id: "x" }, { root, fetchImpl: hangingFetch, timeoutMs: 30 });
    const elapsed = Date.now() - start;

    expect(result).toEqual({ ok: false });
    expect(elapsed).toBeLessThan(300);
  });

  it("STATE_SERVICE_CLI_TIMEOUT_MS default é 300ms (documentado no módulo)", () => {
    expect(STATE_SERVICE_CLI_TIMEOUT_MS).toBe(300);
  });
});
