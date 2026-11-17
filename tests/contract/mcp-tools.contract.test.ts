import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerStateServiceTools } from "../../src/mcp/tools";
import { STATE_SERVICE_NOT_RUNNING_ERROR } from "../../src/mcp/state-service-client";
import { REPO_ROOT, objectPropertyLiterals } from "./helpers/source-scan";
import { cleanupWorkspaces, makeTempDir } from "../characterization/helpers/workspace-fixture";
import { goldenBrandSnapshotSerializer, toGoldenBrand } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * Contrato MCP congelado — F0.4 (lane B), arquitetura-e-refatoracao.md §7.1
 * ("9 tools MCP (nomes e schemas) → snapshot de listTools").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * `tests/mcp/tools.test.ts` usa um `FakeMcpServer` que captura o `config`
 * zod cru. Aqui o caminho é o que um agente vê de verdade: `McpServer` REAL
 * do SDK + `Client` REAL ligados por `InMemoryTransport`, e o snapshot é a
 * resposta de `tools/list` — nomes, títulos, descrições e os JSON Schemas de
 * entrada/saída que o SDK gera a partir do zod. Qualquer refactor de
 * `mcp/tools.ts` (S3: cliente único) que mude o que o agente enxerga quebra aqui.
 */

let client: Client;
let server: McpServer;
let emptyRoot: string;

beforeAll(async () => {
  emptyRoot = makeTempDir("mcp-contract");
  server = new McpServer({ name: BRAND.mcpServerName, version: "0.1.0" });
  // root sem server.json → toda tool responde "State Service não está rodando", sem rede
  registerStateServiceTools(server, { root: emptyRoot });
  client = new Client({ name: "f04-contract-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await server.close();
  cleanupWorkspaces();
});

describe("contrato — MCP tools/list", () => {
  it("identidade do servidor declarada em src/mcp/server.ts (name/version)", () => {
    // AST: `name`/`version` do `new McpServer({…})`, literal ou leitura da marca (BRAND.mcpServerName).
    const name = objectPropertyLiterals(path.join(REPO_ROOT, "src/mcp/server.ts"), "name").map((l) => l.value);
    const version = objectPropertyLiterals(path.join(REPO_ROOT, "src/mcp/server.ts"), "version").map((l) => l.value);
    expect(toGoldenBrand([name, version])).toEqual([["helyx-state-service"], ["0.1.0"]]);
  });

  // F5.2 (contrato agent-activity, autorizado pela ADR-0020): entra append_run_event, a 10ª.
  it("exatamente as 10 tools, nesta ordem de registro", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "get_initiatives",
      "get_delivery_state",
      "check_state_service_health",
      "upsert_initiative",
      "switch_active_initiative",
      "bump_initiative_phase",
      "upsert_wave_item",
      "upsert_delivery_phase",
      "upsert_delivery_checklist_item",
      "append_run_event",
    ]);
  });

  it("snapshot completo de tools/list no formato de fio (title, description, inputSchema, outputSchema, execution)", async () => {
    const { tools } = await client.listTools();
    // JSON round-trip = o que trafega no protocolo (campos `undefined` do parse do client somem)
    expect(JSON.parse(JSON.stringify(tools))).toMatchSnapshot();
  });

  it("campos obrigatórios por tool (o que o agente PRECISA mandar)", async () => {
    const { tools } = await client.listTools();
    const required = Object.fromEntries(
      tools.map((t) => [t.name, ((t.inputSchema as { required?: string[] }).required ?? []).slice().sort()])
    );
    expect(required).toEqual({
      get_initiatives: [],
      get_delivery_state: [],
      check_state_service_health: [],
      upsert_initiative: ["id"],
      switch_active_initiative: ["id"],
      bump_initiative_phase: ["id", "phase"],
      upsert_wave_item: ["id", "item", "status", "wave"],
      upsert_delivery_phase: ["phase", "status"],
      upsert_delivery_checklist_item: ["checked", "item", "phase"],
      append_run_event: ["event_type"],
    });
  });

  it("F5.2: append_run_event só aceita tipos de agente e nenhum campo de autor humano (by)", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "append_run_event")!;
    const props = (tool.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.event_type!.enum).toEqual(["agent-started", "agent-progress", "agent-done", "artifact-written", "blocked", "decision-requested"]);
    expect(Object.keys(props)).not.toContain("by");
  });

  it("ADR-0004 (só via State Service, sem fallback): sem server.json, leitura e escrita devolvem o mesmo erro estruturado, isError:true", async () => {
    const read = await client.callTool({ name: "get_initiatives", arguments: {} });
    const write = await client.callTool({ name: "switch_active_initiative", arguments: { id: "loja-demo" } });
    for (const res of [read, write]) {
      expect(res.isError).toBe(true);
      expect(res.structuredContent).toEqual({ ok: false, error: STATE_SERVICE_NOT_RUNNING_ERROR });
    }
  });

  // ADR-0024, decisão 1 do titular (2026-11-15): gate é aprovado só por humano, no Cockpit ou no
  // terminal. Agentes leem o estado do gate, nunca aprovam. Nenhuma tool fala em gate nem em aprovar,
  // nenhuma aceita o campo de quem aprova, e nenhuma chama o POST /gates/approve.
  it("ADR-0024: nenhuma tool MCP aprova gate (nem no nome, nem na descrição, nem nos campos de entrada)", async () => {
    const { tools } = await client.listTools();
    const approves = tools.filter((t) => {
      const fields = Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
      return /gate|approv|aprov/i.test(t.name)
        || /aprova(r|ção)?\s+(de\s+|o\s+|um\s+)?gate|approve\s+gate|gates\/approve/i.test(`${t.title ?? ""} ${t.description ?? ""}`)
        || fields.some((f) => /^(gate|by|approvedAt|approved_at|human_approved_at)$/.test(f));
    });
    expect(approves.map((t) => t.name)).toEqual([]);
    const source = fs.readFileSync(path.join(REPO_ROOT, "src/mcp/tools.ts"), "utf-8");
    expect(source).not.toMatch(/gates\/approve|approveGate/);
  });

  it("argumento fora do schema é recusado pelo SDK antes do handler (enum de status)", async () => {
    const res = await client.callTool({ name: "upsert_delivery_phase", arguments: { global: true, phase: "business", status: "round_2_done" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toMatch(/Input validation error|Invalid/);
  });
});
