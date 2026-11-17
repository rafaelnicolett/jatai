import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer, UNAUTHORIZED_ERROR } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";

/**
 * Fluxo de auth do State Service HTTP local (item 2.5, roadmap
 * `mod-state-service`) — arquivo separado de `tests/state-service-server.test.ts`
 * (item 2.2) e `tests/state-service-server-sse.test.ts` (item 2.3) pra não
 * arriscar tocar nenhuma asserção de roteamento já existente ali, mesmo
 * padrão já usado pelos dois.
 *
 * Cobre: requisição sem header → 401; header com token errado → 401 (mesma
 * mensagem, não distingue "ausente" de "errado"); header correto → 200;
 * `/health` continua público (não exige o header, decisão documentada em
 * `StateServiceServer.ts`); `GET /events` (SSE) também exige o header, já
 * que não é mais uma exceção — a auth acontece antes do roteamento.
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-auth-"));

const TOKEN = "correct-token-abc123";

function get(port: number, urlPath: string, authorization?: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers = authorization !== undefined ? { Authorization: authorization } : undefined;
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

describe("StateServiceServer — auth (item 2.5)", () => {
  it("GET /initiatives sem header Authorization: 401 com corpo JSON de erro claro", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/initiatives");
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: UNAUTHORIZED_ERROR });
  });

  it("GET /initiatives com token errado: 401, mesma mensagem que header ausente", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/initiatives", "Bearer token-errado");
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: UNAUTHORIZED_ERROR });
  });

  it("GET /initiatives com header mal formado (sem 'Bearer '): 401", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status } = await get(port, "/initiatives", TOKEN);
    expect(status).toBe(401);
  });

  it("GET /initiatives com o token correto: 200", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/initiatives", `Bearer ${TOKEN}`);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, state: null });
  });

  it("GET /delivery-state segue a mesma regra (sem header: 401; com token certo: 200)", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const unauthorized = await get(port, "/delivery-state");
    expect(unauthorized.status).toBe(401);

    const authorized = await get(port, "/delivery-state", `Bearer ${TOKEN}`);
    expect(authorized.status).toBe(200);
  });

  it("GET /health não exige o header — 200 sem Authorization nenhuma", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("GET /health com header errado ainda responde 200 — rota pública de verdade, não ignora erro de auth por acidente", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status } = await get(port, "/health", "Bearer qualquer-coisa");
    expect(status).toBe(200);
  });

  it("GET /events (SSE) sem header Authorization: 401, nunca chega a assinar o bus", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status, body } = await get(port, "/events");
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: UNAUTHORIZED_ERROR });
  });

  it("rota desconhecida sem header também responde 401 (auth acontece antes do roteamento) — não vaza se a rota existiria", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status } = await get(port, "/nao-existe");
    expect(status).toBe(401);
  });

  it("rota desconhecida com token correto: 404 (auth passou, roteamento não achou a rota)", async () => {
    server = new StateServiceServer({ root: tmpDir(), repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();

    const { status } = await get(port, "/nao-existe", `Bearer ${TOKEN}`);
    expect(status).toBe(404);
  });
});
