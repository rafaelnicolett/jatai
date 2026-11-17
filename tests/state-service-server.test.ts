import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";

/**
 * Smoke test do State Service HTTP local (roadmap `mod-state-service`, item
 * 2.2) — `GET /health` responde 200, bind só em `127.0.0.1`, e os 2
 * endpoints de leitura (`/initiatives`, `/delivery-state`) respondem o que o
 * `stateRepository` devolve. Os endpoints de ESCRITA (`POST /initiatives`,
 * `/initiatives/:id/...`, `/delivery-state/...`, item 3.1) têm suíte própria
 * em `tests/state-service-server-write.test.ts` — aqui só confirma que um
 * método sem NENHUMA rota mapeada (`PUT`) ainda cai em 405. Todas as
 * chamadas aqui usam `TEST_TOKEN` — o fluxo de auth em si (401 sem header,
 * 401 com header errado, 200 com header certo, `/health` público) é coberto
 * em `tests/state-service-server-auth.test.ts` (item 2.5), arquivo separado
 * pra não misturar com as asserções de roteamento já existentes aqui.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-server-"));

/** Token fixo usado por todos os testes deste arquivo — auth em si (401/200/header errado) é coberta em `tests/state-service-server-auth.test.ts` (item 2.5), separado pra não misturar com as asserções de roteamento já existentes aqui. */
const TEST_TOKEN = "test-token-state-service-server";

function get(port: number, urlPath: string, token: string | undefined = TEST_TOKEN): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method: "GET", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
    });
    req.on("error", reject);
    req.end();
  });
}

let server: StateServiceServer | undefined;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
});

describe("StateServiceServer — bind e ciclo de vida", () => {
  it("sobe em 127.0.0.1 numa porta escolhida pelo SO (port: 0), e .port reflete a porta real", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const port = await server.start();
    expect(port).toBeGreaterThan(0);
    expect(server.port).toBe(port);
    expect(server.isRunning).toBe(true);
  });

  it("stop() derruba o servidor — isRunning volta a false, e stop() de novo não lança (idempotente)", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    await server.start();
    await server.stop();
    expect(server.isRunning).toBe(false);
    await expect(server.stop()).resolves.toBeUndefined();
    server = undefined;
  });
});

describe("StateServiceServer — endpoints de leitura", () => {
  it("GET /health responde 200 { ok: true }", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("GET /initiatives devolve o registro real do workspace (via YamlStateRepository)", async () => {
    const root = tmpDir();
    const yaml = new YamlStateRepository();
    await yaml.upsertInitiativeAtomic(root, { id: "mod-x", name: "Modernização X" });

    server = new StateServiceServer({ root, repository: yaml, port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/initiatives");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, state: { initiatives: [{ id: "mod-x", name: "Modernização X" }] } });
  });

  it("GET /initiatives num workspace vazio devolve state: null (sem lançar 500)", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/initiatives");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, state: null });
  });

  it("GET /delivery-state (global) devolve o delivery-state.yaml real", async () => {
    const root = tmpDir();
    const yaml = new YamlStateRepository();
    await yaml.upsertDeliveryPhaseAtomic(yaml.globalDeliveryStatePath(root), "business", { status: "done", agent: "@business" });

    server = new StateServiceServer({ root, repository: yaml, port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/delivery-state");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, state: { phases: { business: { status: "done", agent: "@business" } } } });
  });

  it("GET /delivery-state?initiativeId=<id> devolve o delivery-state.yaml da iniciativa, não o global", async () => {
    const root = tmpDir();
    const yaml = new YamlStateRepository();
    await yaml.upsertDeliveryPhaseAtomic(yaml.globalDeliveryStatePath(root), "business", { status: "done" });
    await yaml.upsertDeliveryPhaseAtomic(yaml.initiativeDeliveryStatePath(root, "mod-x"), "business", { status: "pending" });

    server = new StateServiceServer({ root, repository: yaml, port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const { body } = await get(port, "/delivery-state?initiativeId=mod-x");
    expect(body).toMatchObject({ ok: true, state: { phases: { business: { status: "pending" } } } });
  });

  it("rota desconhecida: 404; método sem NENHUMA rota mapeada (PUT): 405", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TEST_TOKEN });
    const port = await server.start();

    const notFound = await get(port, "/nao-existe");
    expect(notFound.status).toBe(404);

    // `POST /initiatives` virou uma rota de verdade no item 3.1 (ver
    // `tests/state-service-server-write.test.ts`) — `PUT` continua sem
    // NENHUM handler mapeado em nenhuma rota, então ainda cai em 405.
    const putResult = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/initiatives", method: "PUT", headers: { Authorization: `Bearer ${TEST_TOKEN}` } },
        (res) => {
          res.on("data", () => undefined);
          res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(putResult.status).toBe(405);
  });
});
