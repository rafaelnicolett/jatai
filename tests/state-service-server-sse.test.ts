import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { EventBus } from "../src/server/EventBus";

/**
 * Smoke test do endpoint `GET /events` (SSE, item 2.3 — roadmap
 * `mod-state-service`). Arquivo separado de `tests/state-service-server.test.ts`
 * (item 2.2, não deve ser tocado) para não arriscar alterar nenhuma asserção
 * já existente ali.
 *
 * Cobre: conecta, recebe um evento publicado manualmente no `EventBus`
 * durante o teste, e desconecta sem lançar erro nem vazar o listener no bus.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-sse-"));

/** `GET /events` também exige auth (item 2.5) — todo request deste arquivo usa este token. */
const TEST_TOKEN = "test-token-state-service-sse";

async function waitFor(predicate: () => boolean, timeoutMs = 1000, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timeout");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

let server: StateServiceServer | undefined;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
});

describe("StateServiceServer — GET /events (SSE, item 2.3)", () => {
  it("conecta, recebe headers SSE corretos e pelo menos 1 evento publicado no bus durante o teste, desconecta sem erro", async () => {
    const bus = new EventBus();
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TEST_TOKEN });
    const port = await server.start();

    const chunks: string[] = [];
    let responseHeaders: http.IncomingHttpHeaders | undefined;

    const req = http.request({ host: "127.0.0.1", port, path: "/events", method: "GET", headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
    const gotResponse = new Promise<void>((resolve, reject) => {
      req.on("response", (res) => {
        responseHeaders = res.headers;
        res.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf-8")));
        res.on("error", reject);
        resolve();
      });
      req.on("error", reject);
    });
    req.end();
    await gotResponse;

    expect(responseHeaders?.["content-type"]).toMatch(/text\/event-stream/);
    expect(responseHeaders?.["cache-control"]).toBe("no-cache");
    expect(responseHeaders?.["connection"]).toBe("keep-alive");

    // Assinatura já aconteceu no handler do servidor antes dos headers serem
    // flushados (ver StateServiceServer._handleEvents) — publicar agora chega
    // no cliente com segurança, sem sleep arbitrário.
    const event = { run_id: "sse-1", event_type: "agent-started", timestamp: "2026-08-26T10:00:00.000Z" };
    bus.publish({ source: "telemetry", event });

    await waitFor(() => chunks.join("").includes("sse-1"));
    expect(chunks.join("")).toContain(`data: ${JSON.stringify({ source: "telemetry", event })}\n\n`);

    expect(bus.subscriberCount).toBe(1);

    req.destroy();
    await waitFor(() => bus.subscriberCount === 0);
    expect(bus.subscriberCount).toBe(0);
  });

  it("dois clientes conectados recebem o mesmo evento, cada um com sua própria assinatura", async () => {
    const bus = new EventBus();
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TEST_TOKEN });
    const port = await server.start();

    async function connect(): Promise<{ chunks: string[]; req: http.ClientRequest }> {
      const chunks: string[] = [];
      const req = http.request({ host: "127.0.0.1", port, path: "/events", method: "GET", headers: { Authorization: `Bearer ${TEST_TOKEN}` } });
      await new Promise<void>((resolve, reject) => {
        req.on("response", (res) => {
          res.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf-8")));
          resolve();
        });
        req.on("error", reject);
        req.end();
      });
      return { chunks, req };
    }

    const clientA = await connect();
    const clientB = await connect();
    await waitFor(() => bus.subscriberCount === 2);

    bus.publish({ source: "runs-watcher", event: { run_id: "sse-2", event_type: "blocked", timestamp: "2026-08-26T10:05:00.000Z" } });

    await waitFor(() => clientA.chunks.join("").includes("sse-2") && clientB.chunks.join("").includes("sse-2"));

    clientA.req.destroy();
    clientB.req.destroy();
    await waitFor(() => bus.subscriberCount === 0);
  });
});
