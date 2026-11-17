import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { EventBus, type StateServiceEvent } from "../src/server/EventBus";

/**
 * Evento publicado no `EventBus` pelos 6 endpoints de ESCRITA (item 3.2,
 * achado corrigido nesta wave — antes NENHUM deles publicava nada, só
 * `TelemetryBuffer`/`RunsWatcher` alimentavam o bus, ver
 * `feature-report-helyx-vscode-write-endpoints-events.md`). Arquivo separado
 * de `tests/state-service-server-write.test.ts` (item 3.1, caminho
 * feliz/erros HTTP) e `tests/state-service-server-sse.test.ts` (item 2.3,
 * smoke test do transporte SSE) — não altera nenhuma asserção existente ali.
 *
 * Cobre, pra cada um dos 6 endpoints: sucesso publica exatamente 1 evento
 * reconhecível (`source: "state-write"`, `event_type: "artifact-written"`)
 * com `metadata.endpoint` identificando a rota; falha de validação (400/404)
 * NÃO publica nada.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-write-events-"));

const TOKEN = "write-events-token";

function post(port: number, urlPath: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

let server: StateServiceServer | undefined;
let root: string;
let bus: EventBus;
let received: StateServiceEvent[];

function startServer(): Promise<number> {
  root = tmpDir();
  bus = new EventBus();
  received = [];
  bus.subscribe((event) => received.push(event));
  server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TOKEN });
  return server.start();
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
});

describe("StateServiceServer — endpoints de escrita publicam evento no EventBus (item 3.2)", () => {
  it("POST /initiatives: sucesso publica 1 evento state-write/artifact-written", async () => {
    const port = await startServer();
    const { status } = await post(port, "/initiatives", { id: "mod-x", name: "Modernização X" });
    expect(status).toBe(200);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", metadata: { endpoint: "initiatives", id: "mod-x", changed: true } },
    });
  });

  it("POST /initiatives com erro de validação (sem 'id'): NÃO publica nada", async () => {
    const port = await startServer();
    const { status } = await post(port, "/initiatives", { name: "Sem id" });
    expect(status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it("POST /initiatives/:id/switch-active: sucesso publica evento", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    received.length = 0; // ignora o evento da criação acima

    const { status } = await post(port, "/initiatives/mod-x/switch-active", {});
    expect(status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", metadata: { endpoint: "initiatives/switch-active", id: "mod-x" } },
    });
  });

  it("POST /initiatives/:id/bump-phase: sucesso publica evento com phase_id", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    received.length = 0;

    const { status } = await post(port, "/initiatives/mod-x/bump-phase", { phase: "product" });
    expect(status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", phase_id: "product", metadata: { endpoint: "initiatives/bump-phase", id: "mod-x", phase: "product" } },
    });
  });

  it("POST /initiatives/:id/bump-phase com iniciativa inexistente (404): NÃO publica nada", async () => {
    const port = await startServer();
    const { status } = await post(port, "/initiatives/nao-existe/bump-phase", { phase: "product" });
    expect(status).toBe(404);
    expect(received).toHaveLength(0);
  });

  it("POST /initiatives/:id/wave-items/:wave/:item: sucesso publica evento", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    received.length = 0;

    const { status } = await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.1", { status: "done" });
    expect(status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", metadata: { endpoint: "initiatives/wave-items", id: "mod-x", wave: "wave-1", item: "item-1.1", status: "done" } },
    });
  });

  it("POST /initiatives/:id/wave-items/:wave/:item com iniciativa inexistente (404): NÃO publica nada", async () => {
    const port = await startServer();
    const { status } = await post(port, "/initiatives/nao-existe/wave-items/wave-1/item-1.1", { status: "done" });
    expect(status).toBe(404);
    expect(received).toHaveLength(0);
  });

  it("POST /delivery-state/upsert-phase: sucesso publica evento com phase_id", async () => {
    const port = await startServer();
    const { status } = await post(port, "/delivery-state/upsert-phase", { global: true, phase: "business", status: "done" });
    expect(status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", phase_id: "business", metadata: { endpoint: "delivery-state/upsert-phase", phase: "business", status: "done" } },
    });
  });

  it("POST /delivery-state/upsert-phase sem escopo (400 MISSING_SCOPE): NÃO publica nada", async () => {
    const port = await startServer();
    const { status } = await post(port, "/delivery-state/upsert-phase", { phase: "business", status: "done" });
    expect(status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it("POST /delivery-state/upsert-checklist: sucesso publica evento com phase_id", async () => {
    const port = await startServer();
    const { status } = await post(port, "/delivery-state/upsert-checklist", { global: true, phase: "business", item: "kpi-defined", checked: true });
    expect(status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      source: "state-write",
      event: { event_type: "artifact-written", phase_id: "business", metadata: { endpoint: "delivery-state/upsert-checklist", phase: "business", item: "kpi-defined", checked: true } },
    });
  });

  it("POST /delivery-state/upsert-checklist com 'checked' inválido (400 INVALID_BOOLEAN): NÃO publica nada", async () => {
    const port = await startServer();
    const { status } = await post(port, "/delivery-state/upsert-checklist", { global: true, phase: "business", item: "x", checked: "1" });
    expect(status).toBe(400);
    expect(received).toHaveLength(0);
  });
});
