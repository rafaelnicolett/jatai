import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getInitiatives, getDeliveryState, checkStateServiceHealth, STATE_SERVICE_NOT_RUNNING_ERROR } from "../../src/mcp/state-service-client";
import { writeStateServiceInfo } from "../../src/server/state-service-info";

/**
 * Anti-Corruption Layer do servidor MCP (item 2.4, roadmap `mod-state-service`,
 * ADR-0004) — a única coisa que fala HTTP com o State Service. Testes cobrem:
 * descoberta de porta via `server.json`, chamada do endpoint certo, resposta
 * propagada tal como veio, e o fallback (arquivo ausente / fetch falha) nunca
 * lança, sempre devolve `{ ok: false, error }` com mensagem clara.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-mcp-client-"));

const TEST_TOKEN = "test-token-mcp-client";

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => ({ json: async () => handler(String(input), init) })) as unknown as typeof fetch;
}

describe("state-service-client — chama o endpoint certo e propaga a resposta", () => {
  it("getInitiatives chama GET /initiatives na porta descoberta via server.json", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: string[] = [];
    const result = await getInitiatives({
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: { initiatives: [{ id: "mod-x" }] } };
      }),
    });

    expect(calls).toEqual(["http://127.0.0.1:4321/initiatives"]);
    expect(result).toEqual({ ok: true, state: { initiatives: [{ id: "mod-x" }] } });
  });

  it("toda chamada envia o header Authorization: Bearer <token> lido do server.json (item 2.5)", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const headersSeen: (HeadersInit | undefined)[] = [];
    await getInitiatives({
      root,
      fetchImpl: fakeFetch((_url, init) => {
        headersSeen.push(init?.headers);
        return { ok: true, state: null };
      }),
    });
    await checkStateServiceHealth({
      root,
      fetchImpl: fakeFetch((_url, init) => {
        headersSeen.push(init?.headers);
        return { ok: true };
      }),
    });

    expect(headersSeen).toEqual([{ Authorization: `Bearer ${TEST_TOKEN}` }, { Authorization: `Bearer ${TEST_TOKEN}` }]);
  });

  it("getDeliveryState sem initiativeId chama /delivery-state sem query string", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: string[] = [];
    const result = await getDeliveryState(undefined, {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: null };
      }),
    });

    expect(calls).toEqual(["http://127.0.0.1:4321/delivery-state"]);
    expect(result).toEqual({ ok: true, state: null });
  });

  it("getDeliveryState com initiativeId chama /delivery-state?initiativeId=<id>", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: string[] = [];
    await getDeliveryState("mod-x", {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: { phases: {} } };
      }),
    });

    expect(calls).toEqual(["http://127.0.0.1:4321/delivery-state?initiativeId=mod-x"]);
  });

  it("getDeliveryState escapa o initiativeId na query string", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: string[] = [];
    await getDeliveryState("mod x/y", {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: null };
      }),
    });

    expect(calls).toEqual(["http://127.0.0.1:4321/delivery-state?initiativeId=mod%20x%2Fy"]);
  });

  it("checkStateServiceHealth chama GET /health e propaga a resposta", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 9999, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });

    const calls: string[] = [];
    const result = await checkStateServiceHealth({
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true };
      }),
    });

    expect(calls).toEqual(["http://127.0.0.1:9999/health"]);
    expect(result).toEqual({ ok: true });
  });

  it("sem server.json (State Service nunca subiu): erro claro, sem lançar, fetch nunca chamado", async () => {
    const root = tmpDir();
    let fetchCalled = false;

    const result = await getInitiatives({
      root,
      fetchImpl: fakeFetch(() => {
        fetchCalled = true;
        return {};
      }),
    });

    expect(result).toEqual({ ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR });
    expect(fetchCalled).toBe(false);
  });

  it("fetch falha (serviço parou depois do server.json ser escrito): erro claro, não lança", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(checkStateServiceHealth({ root, fetchImpl: failingFetch })).resolves.toEqual({
      ok: false,
      error: STATE_SERVICE_NOT_RUNNING_ERROR,
    });
  });

  it("server.json corrompido (JSON inválido): tratado como serviço fora do ar, não lança", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    fs.writeFileSync(path.join(root, ".github", "artifacts", ".state-service", "server.json"), "{ isto não é json", "utf-8");

    const result = await getInitiatives({ root });
    expect(result).toEqual({ ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR });
  });
});
