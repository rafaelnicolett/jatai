import { describe, it, expect, afterAll, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StateCommands } from "../src/state/application/StateCommands";
import { YamlStateRepository } from "../src/state/repository/StateRepository";
import { appendRunEvent } from "../src/state/runs/run-event-log";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { EventBus } from "../src/server/EventBus";
import { parseRunEvents } from "../src/core/contracts/run-events-contract.pure";

/**
 * O caso de uso dos eventos de agente (F5.2): `runs append` no CLI, o
 * `POST /runs/append` e a tool MCP `append_run_event` rodam
 * `StateCommands.appendRunEvent`.
 */
const tmpDirs: string[] = [];
let server: StateServiceServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-sc-runs-"));
  tmpDirs.push(root);
  return root;
}

const commands = (root: string, harness?: "cli"): StateCommands =>
  new StateCommands({ root, repository: new YamlStateRepository(), recordEvent: appendRunEvent, ...(harness ? { harness } : {}) });

const readRuns = (root: string, name: string) => parseRunEvents(fs.readFileSync(path.join(root, ".github/artifacts/runs", `${name}.jsonl`), "utf-8"));

describe("StateCommands.prepareRunEvent", () => {
  it("completa run_id (r-AAAAMMDD), horário e o harness do adaptador; reason vira metadata.reason", () => {
    const r = commands(workspace(), "cli").prepareRunEvent({ event_type: "blocked", agent_id: "@a", reason: "falta insumo" });
    expect(r.ok).toBe(true);
    const e = (r as { value: Record<string, unknown> }).value;
    expect(e.run_id).toMatch(/^r-\d{8}$/);
    expect(Date.parse(String(e.timestamp))).not.toBeNaN();
    expect(e).toMatchObject({ event_type: "blocked", harness: "cli", metadata: { reason: "falta insumo" } });
  });

  it("o harness informado vence o do adaptador", () => {
    const r = commands(workspace(), "cli").prepareRunEvent({ event_type: "agent-started", harness: "claude-code" });
    expect((r as { value: { harness: string } }).value.harness).toBe("claude-code");
  });

  it("caminho absoluto dentro do workspace vira relativo; fora dele, USAGE", () => {
    const root = workspace();
    const inside = commands(root).prepareRunEvent({ event_type: "artifact-written", artifact_path: path.join(root, ".github", "artifacts", "x.md") });
    expect((inside as { value: { artifact_path: string } }).value.artifact_path).toBe(".github/artifacts/x.md");
    const outside = commands(root).prepareRunEvent({ event_type: "artifact-written", artifact_path: path.join(os.tmpdir(), "fora.md") });
    expect(outside).toMatchObject({ ok: false, error: { code: "USAGE", field: "artifact_path" } });
  });

  it.each(["gate-approved", "item-approved", "decision-made"])("agente não registra %s (ADR-0024): INVALID_ENUM", (type) => {
    expect(commands(workspace()).prepareRunEvent({ event_type: type })).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "event_type" } });
  });
});

describe("POST /runs/append", () => {
  async function start(root: string): Promise<number> {
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), eventBus: new EventBus(), token: "t", approverName: async () => null });
    return server.start();
  }
  const post = async (port: number, body: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/runs/append`, { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("grava o evento com os nomes do contrato e devolve { ok, path, event }; sem harness, o servidor não inventa um", async () => {
    const root = workspace();
    const port = await start(root);
    const r = await post(port, { event_type: "artifact-written", initiative_id: "mod-x", artifact_path: "execution/relatorio.md", agent_id: "@a" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, event: { event_type: "artifact-written", initiative_id: "mod-x", artifact_path: "execution/relatorio.md" } });
    const [event] = readRuns(root, "mod-x");
    expect(event).toMatchObject({ event_type: "artifact-written", agent_id: "@a" });
    expect(event!.harness).toBeUndefined();
  });

  it("decisão humana e campo inválido: 400 no envelope de sempre, nada gravado", async () => {
    const root = workspace();
    const port = await start(root);
    expect(await post(port, { event_type: "decision-made", by: "X" })).toMatchObject({ status: 400, body: { ok: false, error: { code: "INVALID_ENUM" } } });
    expect(await post(port, { event_type: "agent-started", harness: "cursor" })).toMatchObject({ status: 400, body: { ok: false, error: { code: "INVALID_ENUM", field: "harness" } } });
    expect(fs.existsSync(path.join(root, ".github/artifacts/runs"))).toBe(false);
  });
});
