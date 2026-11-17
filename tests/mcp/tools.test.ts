import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStateServiceTools } from "../../src/mcp/tools";
import { writeStateServiceInfo } from "../../src/server/state-service-info";

/**
 * As 3 tools MCP (item 2.4, roadmap `mod-state-service`) registradas por
 * `registerStateServiceTools`, mapeando 1:1 os 3 endpoints de leitura do
 * State Service. `FakeMcpServer` (hand-written, sem `vi.mock`) captura as
 * tools registradas pra invocar o handler diretamente — mesmo padrão de
 * Fake já usado no resto do repositório (`FakeGit implements GitRunner`).
 */

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  structuredContent: unknown;
  isError: boolean;
}

type Handler = (args: Record<string, unknown>) => Promise<ToolCallResult>;

class FakeMcpServer {
  tools = new Map<string, { config: unknown; handler: Handler }>();
  registerTool(name: string, config: unknown, handler: Handler): void {
    this.tools.set(name, { config, handler });
  }
}

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-mcp-tools-"));

const TEST_TOKEN = "test-token-mcp-tools";

function fakeFetch(handler: (url: string) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => ({ json: async () => handler(String(input)) })) as unknown as typeof fetch;
}

interface CapturedPost {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Fake de `fetch` para as tools de ESCRITA — captura URL/método/headers/body enviados e devolve o corpo fornecido como resposta JSON. */
function fakePostFetch(calls: CapturedPost[], respond: (call: CapturedPost) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: CapturedPost = {
      url: String(input),
      method: init?.method,
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    };
    calls.push(call);
    return { json: async () => respond(call) };
  }) as unknown as typeof fetch;
}

describe("registerStateServiceTools — as tools mapeiam 1:1 os endpoints do State Service", () => {
  it("registra exatamente as 3 tools de leitura, as 6 de escrita e append_run_event (F5.2)", () => {
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer);

    expect([...fake.tools.keys()].sort()).toEqual([
      "append_run_event",
      "bump_initiative_phase",
      "check_state_service_health",
      "get_delivery_state",
      "get_initiatives",
      "switch_active_initiative",
      "upsert_delivery_checklist_item",
      "upsert_delivery_phase",
      "upsert_initiative",
      "upsert_wave_item",
    ]);
  });

  it("get_initiatives chama GET /initiatives e devolve o envelope como structuredContent", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: string[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: { initiatives: [] } };
      }),
    });

    const result = await fake.tools.get("get_initiatives")!.handler({});

    expect(calls).toEqual(["http://127.0.0.1:4321/initiatives"]);
    expect(result.structuredContent).toEqual({ ok: true, state: { initiatives: [] } });
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain('"initiatives"');
  });

  it("get_delivery_state propaga initiativeId pro endpoint via query string", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: string[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: { phases: {} } };
      }),
    });

    const result = await fake.tools.get("get_delivery_state")!.handler({ initiativeId: "mod-x" });

    expect(calls).toEqual(["http://127.0.0.1:4321/delivery-state?initiativeId=mod-x"]);
    expect(result.structuredContent).toEqual({ ok: true, state: { phases: {} } });
  });

  it("get_delivery_state sem initiativeId chama o endpoint global", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: string[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true, state: null };
      }),
    });

    await fake.tools.get("get_delivery_state")!.handler({});

    expect(calls).toEqual(["http://127.0.0.1:4321/delivery-state"]);
  });

  it("check_state_service_health chama GET /health e propaga { ok: true }", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: string[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        return { ok: true };
      }),
    });

    const result = await fake.tools.get("check_state_service_health")!.handler({});

    expect(calls).toEqual(["http://127.0.0.1:4321/health"]);
    expect(result.structuredContent).toEqual({ ok: true });
    expect(result.isError).toBe(false);
  });

  it("qualquer tool sem State Service no ar devolve isError: true com mensagem clara, nunca lança", async () => {
    const root = tmpDir(); // sem server.json — extensão nunca subiu neste workspace
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer, { root });

    const result = await fake.tools.get("get_initiatives")!.handler({});

    expect(result.isError).toBe(true);
    expect((result.structuredContent as { error?: string }).error).toContain("State Service não está rodando");
  });
});

/**
 * As 6 tools de ESCRITA (item 3.3, roadmap `mod-state-service`) — mapeiam
 * 1:1 os 6 endpoints `POST` que o item 3.1 criou no `StateServiceServer`.
 * Cada teste confirma: rota/método/corpo enviados ao `state-service-write-client`
 * (via `fakePostFetch`), o envelope de resposta devolvido tal como veio
 * (`structuredContent`), e que erro (validação, 404, service down) nunca
 * lança — sempre `isError: true` com o envelope propagado.
 */
describe("registerStateServiceTools — as 6 tools de escrita mapeiam 1:1 os endpoints POST do State Service", () => {
  it("upsert_initiative chama POST /initiatives com o corpo e o token corretos", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x" })),
    });

    const result = await fake.tools.get("upsert_initiative")!.handler({ id: "mod-x", name: "Mod X", status: "in-progress", active: true });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/initiatives",
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
        body: { id: "mod-x", name: "Mod X", status: "in-progress", active: true },
      },
    ]);
    expect(result.structuredContent).toEqual({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x" });
    expect(result.isError).toBe(false);
  });

  it("switch_active_initiative chama POST /initiatives/:id/switch-active com corpo vazio", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x" })),
    });

    const result = await fake.tools.get("switch_active_initiative")!.handler({ id: "mod-x" });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:4321/initiatives/mod-x/switch-active",
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
        body: {},
      },
    ]);
    expect(result.structuredContent).toEqual({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x" });
  });

  it("bump_initiative_phase chama POST /initiatives/:id/bump-phase com { phase }", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x", phase: "execution" })),
    });

    const result = await fake.tools.get("bump_initiative_phase")!.handler({ id: "mod-x", phase: "execution" });

    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/initiatives/mod-x/bump-phase",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: { phase: "execution" },
    });
    expect(result.structuredContent).toEqual({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x", phase: "execution" });
  });

  it("bump_initiative_phase propaga erro 404 (iniciativa inexistente) como isError:true, nunca lança", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch([], () => ({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", message: "iniciativa 'mod-x' não existe", id: "mod-x" } })),
    });

    const result = await fake.tools.get("bump_initiative_phase")!.handler({ id: "mod-x", phase: "execution" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: { code: "INITIATIVE_NOT_FOUND", message: "iniciativa 'mod-x' não existe", id: "mod-x" },
    });
  });

  it("upsert_wave_item chama POST /initiatives/:id/wave-items/:wave/:item com o corpo sem id/wave/item", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x", wave: "1", item: "repo-a", status: "done" })),
    });

    const result = await fake.tools
      .get("upsert_wave_item")!
      .handler({ id: "mod-x", wave: "1", item: "repo-a", status: "done", artifacts: ["report.md"] });

    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/initiatives/mod-x/wave-items/1/repo-a",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: { status: "done", artifacts: ["report.md"] },
    });
    expect(result.structuredContent).toEqual({
      ok: true,
      path: "/tmp/initiatives.yaml",
      changed: true,
      id: "mod-x",
      wave: "1",
      item: "repo-a",
      status: "done",
    });
  });

  it("ADR-0006: upsert_wave_item repassa group:'epic' no corpo da requisição", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/initiatives.yaml", changed: true, id: "mod-x", wave: "epic-1", item: "task-1.1", status: "done" })),
    });

    await fake.tools
      .get("upsert_wave_item")!
      .handler({ id: "mod-x", wave: "epic-1", item: "task-1.1", status: "done", group: "epic" });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:4321/initiatives/mod-x/wave-items/epic-1/task-1.1",
      body: { status: "done", group: "epic" },
    });
  });

  it("upsert_delivery_phase chama POST /delivery-state/upsert-phase com o escopo e os campos da fase", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/delivery-state.yaml", changed: true, phase: "execution", status: "done" })),
    });

    const result = await fake.tools
      .get("upsert_delivery_phase")!
      .handler({ initiativeId: "mod-x", phase: "execution", status: "done", agent: "@feature-adder" });

    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/delivery-state/upsert-phase",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: { initiativeId: "mod-x", phase: "execution", status: "done", agent: "@feature-adder" },
    });
    expect(result.structuredContent).toEqual({ ok: true, path: "/tmp/delivery-state.yaml", changed: true, phase: "execution", status: "done" });
  });

  it("upsert_delivery_phase propaga erro de validação (MISSING_SCOPE) como isError:true, nunca lança", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch([], () => ({ ok: false, error: { code: "MISSING_SCOPE", message: "informe --global ou --initiative <id>" } })),
    });

    const result = await fake.tools.get("upsert_delivery_phase")!.handler({ phase: "execution", status: "done" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ ok: false, error: { code: "MISSING_SCOPE", message: "informe --global ou --initiative <id>" } });
  });

  it("upsert_delivery_checklist_item chama POST /delivery-state/upsert-checklist com global:true e checked booleano", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, {
      root,
      fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/delivery-state.yaml", changed: true, phase: "execution", item: "PR aberto", checked: true })),
    });

    const result = await fake.tools
      .get("upsert_delivery_checklist_item")!
      .handler({ global: true, phase: "execution", item: "PR aberto", checked: true });

    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/delivery-state/upsert-checklist",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: { global: true, phase: "execution", item: "PR aberto", checked: true },
    });
    expect(result.structuredContent).toEqual({
      ok: true,
      path: "/tmp/delivery-state.yaml",
      changed: true,
      phase: "execution",
      item: "PR aberto",
      checked: true,
    });
    expect(result.isError).toBe(false);
  });

  it("qualquer tool de escrita sem State Service no ar devolve isError:true com mensagem clara, nunca lança", async () => {
    const root = tmpDir(); // sem server.json — extensão nunca subiu neste workspace
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer, { root });

    const result = await fake.tools.get("upsert_initiative")!.handler({ id: "mod-x" });

    expect(result.isError).toBe(true);
    expect((result.structuredContent as { error?: string }).error).toContain("State Service não está rodando");
  });
});

describe("registerStateServiceTools — append_run_event (F5.2, contrato agent-activity)", () => {
  it("chama POST /runs/append com os nomes do contrato e harness mcp quando o agente não diz", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    const event = { run_id: "r-20261115", event_type: "artifact-written", timestamp: "2026-11-15T12:00:00.000Z", artifact_path: "execution/relatorio.md", harness: "mcp" };
    registerStateServiceTools(fake as unknown as McpServer, { root, fetchImpl: fakePostFetch(calls, () => ({ ok: true, path: "/tmp/runs/mod-x.jsonl", event })) });

    const result = await fake.tools.get("append_run_event")!.handler({ event_type: "artifact-written", artifact_path: "execution/relatorio.md", initiative_id: "mod-x" });

    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/runs/append",
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, "Content-Type": "application/json" },
      body: { event_type: "artifact-written", artifact_path: "execution/relatorio.md", initiative_id: "mod-x", harness: "mcp" },
    });
    expect(result).toMatchObject({ isError: false, structuredContent: { ok: true, event } });
  });

  it("o harness informado pelo agente vai como veio (ex.: copilot)", async () => {
    const root = tmpDir();
    writeStateServiceInfo(root, { port: 4321, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN });
    const fake = new FakeMcpServer();
    const calls: CapturedPost[] = [];
    registerStateServiceTools(fake as unknown as McpServer, { root, fetchImpl: fakePostFetch(calls, () => ({ ok: true })) });
    await fake.tools.get("append_run_event")!.handler({ event_type: "agent-started", agent_id: "@a", harness: "copilot" });
    expect((calls[0]!.body as { harness: string }).harness).toBe("copilot");
  });

  it("sem State Service no ar: isError:true, sem fallback (ADR-0004)", async () => {
    const fake = new FakeMcpServer();
    registerStateServiceTools(fake as unknown as McpServer, { root: tmpDir() });
    const result = await fake.tools.get("append_run_event")!.handler({ event_type: "agent-started" });
    expect(result.isError).toBe(true);
  });
});
