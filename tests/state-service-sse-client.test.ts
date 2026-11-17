import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { EventEmitter } from "events";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { EventBus } from "../src/server/EventBus";
import { StateServiceSseClient } from "../src/server/StateServiceSseClient";
import type { StateServiceInfo } from "../src/server/state-service-info";

/** Fake mínimo de `http.request` — cada chamada consome o próximo passo do
 *  roteiro: "refuse" emite `error` (ECONNREFUSED); "end" entrega uma resposta
 *  que fecha logo em seguida (`res.emit("end")`, simulando o servidor
 *  derrubando o stream); "open" entrega uma resposta que fica de pé (não
 *  fecha sozinha). O último passo do roteiro se repete indefinidamente.
 *  Evita depender da semântica real de `http.Server.close()` (que só chama
 *  seu callback depois que TODA conexão keep-alive existente terminar —
 *  reconectar de verdade via um servidor real não daria pra simular uma
 *  queda a tempo sem esperar isso, ver achado no relatório). */
function fakeHttpRequestScript(script: Array<"refuse" | "end" | "open">): { httpRequest: typeof http.request; callCount: () => number } {
  let calls = 0;
  const httpRequest = ((): http.ClientRequest => {
    const step = script[Math.min(calls, script.length - 1)];
    calls++;
    const req = new EventEmitter() as unknown as http.ClientRequest;
    (req as unknown as { end: () => void }).end = (): void => {
      queueMicrotask(() => {
        if (step === "refuse") {
          req.emit("error", new Error("ECONNREFUSED"));
          return;
        }
        const res = new EventEmitter();
        req.emit("response", res);
        if (step === "end") queueMicrotask(() => res.emit("end"));
      });
    };
    (req as unknown as { destroy: () => void }).destroy = (): void => undefined;
    return req;
  }) as unknown as typeof http.request;
  return { httpRequest, callCount: () => calls };
}

/**
 * `StateServiceSseClient` (roadmap `mod-state-service`, item 3.2) — cliente
 * SSE reusado por `CockpitNextController`/`ArtifactValidationProvider` no
 * lugar de `vscode.workspace.createFileSystemWatcher`. Cobre: conecta e
 * recebe eventos publicados no bus real, re-tenta com backoff enquanto
 * `discover()` devolve `null` (servidor ainda subindo), reconecta sozinho
 * depois de o servidor cair, e `stop()` é idempotente e cancela qualquer
 * retry agendado (sem vazar timer nem listener).
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-sse-client-"));
const TEST_TOKEN = "test-token-sse-client";

async function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timeout");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

let server: StateServiceServer | undefined;
let client: StateServiceSseClient | undefined;

afterEach(async () => {
  client?.stop();
  client = undefined;
  if (server) {
    await server.stop();
    server = undefined;
  }
});

describe("StateServiceSseClient", () => {
  it("conecta e recebe um evento publicado no bus, com source/token descobertos via discover()", async () => {
    const bus = new EventBus();
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TEST_TOKEN });
    const port = await server.start();

    const received: string[] = [];
    client = new StateServiceSseClient({
      discover: (): StateServiceInfo => ({ port, pid: process.pid, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN }),
      onEvent: (raw) => received.push(raw),
    });
    client.start();

    await waitFor(() => bus.subscriberCount === 1);
    bus.publish({ source: "telemetry", event: { run_id: "sse-client-1", event_type: "agent-done", timestamp: "2026-08-26T10:00:00.000Z" } });

    await waitFor(() => received.length === 1);
    expect(JSON.parse(received[0]!)).toEqual({
      source: "telemetry",
      event: { run_id: "sse-client-1", event_type: "agent-done", timestamp: "2026-08-26T10:00:00.000Z" },
    });
  });

  it("servidor ainda subindo: discover() devolve null nas primeiras tentativas, cliente re-tenta com backoff curto até conectar", async () => {
    const bus = new EventBus();
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TEST_TOKEN });
    const port = await server.start();

    let discoverCalls = 0;
    const BECOMES_READY_AFTER = 3;
    client = new StateServiceSseClient({
      discover: (): StateServiceInfo | null => {
        discoverCalls++;
        if (discoverCalls < BECOMES_READY_AFTER) return null;
        return { port, pid: process.pid, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN };
      },
      onEvent: () => undefined,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 20,
    });
    client.start();

    await waitFor(() => bus.subscriberCount === 1);
    expect(discoverCalls).toBeGreaterThanOrEqual(BECOMES_READY_AFTER);
  });

  it("reconecta sozinho depois de uma desconexão (stream fechado), sem exigir nova chamada a start()", async () => {
    const { httpRequest, callCount } = fakeHttpRequestScript(["end", "open"]);
    const connectionEvents: boolean[] = [];

    client = new StateServiceSseClient({
      discover: (): StateServiceInfo => ({ port: 1, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN }),
      onEvent: () => undefined,
      onConnectionChange: (connected) => connectionEvents.push(connected),
      httpRequest,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 20,
    });
    client.start();

    // 1ª conexão fecha sozinha (`res.emit("end")`) — o cliente deve notar a
    // queda (`onConnectionChange(false)`) e reconectar sem precisar de novo
    // `start()`; a 2ª tentativa (roteiro "open") fica de pé.
    await waitFor(() => connectionEvents.filter((c) => c).length === 2);
    expect(connectionEvents).toEqual([true, false, true]);
    expect(callCount()).toBe(2);
  });

  it("uma falha de conexão (ECONNREFUSED) dispara onConnectionChange(false), e a tentativa seguinte que conecta dispara (true)", async () => {
    const { httpRequest } = fakeHttpRequestScript(["refuse", "open"]);
    const connectionEvents: boolean[] = [];

    client = new StateServiceSseClient({
      discover: (): StateServiceInfo => ({ port: 1, pid: 1, startedAt: "2026-08-26T00:00:00.000Z", token: TEST_TOKEN }),
      onEvent: () => undefined,
      onConnectionChange: (connected) => connectionEvents.push(connected),
      httpRequest,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 20,
    });
    client.start();

    await waitFor(() => connectionEvents.includes(true));
    expect(connectionEvents).toEqual([false, true]);
  });

  it("stop() é idempotente e cancela retry agendado — nenhuma tentativa de conexão depois de stop()", async () => {
    let discoverCalls = 0;
    client = new StateServiceSseClient({
      discover: (): StateServiceInfo | null => {
        discoverCalls++;
        return null; // nunca fica pronto — só exercitando o ciclo de retry
      },
      onEvent: () => undefined,
      initialRetryDelayMs: 5,
      maxRetryDelayMs: 10,
    });
    client.start();

    await waitFor(() => discoverCalls >= 1);
    client.stop();
    const callsAtStop = discoverCalls;

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(discoverCalls).toBe(callsAtStop);

    // Chamar stop() de novo não deve lançar.
    expect(() => client!.stop()).not.toThrow();
  });
});
