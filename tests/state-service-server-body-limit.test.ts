import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer, MAX_JSON_BODY_BYTES } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";

/**
 * A16c / L12 (F6.2): `readJsonBody` acumulava o corpo inteiro em memória, sem
 * limite. Agora um corpo acima de `MAX_JSON_BODY_BYTES` é recusado com o
 * envelope que o contrato HTTP já tem para corpo inválido (`400`,
 * `{ ok:false, error:{ code:"INVALID_JSON", message } }`), sem gravar nada e
 * sem publicar evento.
 */

const TOKEN = "body-limit-token";

let server: StateServiceServer | undefined;
let root: string;

async function startServer(): Promise<number> {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-body-limit-"));
  server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TOKEN });
  return server.start();
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * POST com o corpo em pedaços. `chunked: true` omite o Content-Length (o
 * limite tem que valer também durante o streaming). Resolve com a primeira
 * resposta; erro de socket depois dela (o servidor fecha a conexão) é esperado.
 */
function postBody(port: number, parts: string[], opts: { chunked: boolean }): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const total = parts.reduce((n, p) => n + Buffer.byteLength(p), 0);
    const headers: Record<string, string | number> = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
    if (!opts.chunked) headers["Content-Length"] = total;
    let answered = false;
    const req = http.request({ host: "127.0.0.1", port, path: "/initiatives", method: "POST", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        answered = true;
        resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined });
      });
    });
    req.on("error", (err) => {
      if (!answered) reject(err);
    });
    for (const p of parts) req.write(p);
    req.end();
  });
}

/** JSON válido de create com um campo extra de `size` bytes. */
function bigCreateBody(size: number): string[] {
  const head = '{"id":"iniciativa-gigante","name":"Gigante","pad":"';
  const tail = '"}';
  const pad = "a".repeat(size);
  const parts = [head];
  for (let i = 0; i < pad.length; i += 64 * 1024) parts.push(pad.slice(i, i + 64 * 1024));
  parts.push(tail);
  return parts;
}

describe("StateServiceServer — limite de tamanho do corpo JSON (A16c)", () => {
  it.each([
    ["com Content-Length", false],
    ["chunked, sem Content-Length", true],
  ])("REGRESSÃO: corpo acima do limite (%s) dá 400 INVALID_JSON e não grava nada", async (_caso, chunked) => {
    const port = await startServer();

    const res = await postBody(port, bigCreateBody(MAX_JSON_BODY_BYTES + 1), { chunked });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "INVALID_JSON", message: `corpo da requisição excede o limite de ${MAX_JSON_BODY_BYTES} bytes` },
    });
    expect(fs.existsSync(path.join(root, ".github", "artifacts", "initiatives.yaml"))).toBe(false);
  });

  it("o servidor continua atendendo depois de recusar um corpo grande", async () => {
    const port = await startServer();
    await postBody(port, bigCreateBody(MAX_JSON_BODY_BYTES + 1), { chunked: true });

    const res = await postBody(port, ['{"id":"pequena","name":"Pequena"}'], { chunked: false });

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it("corpo dentro do limite segue o caminho normal", async () => {
    const port = await startServer();

    const res = await postBody(port, bigCreateBody(64 * 1024), { chunked: false });

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });

  it("o limite é generoso para os endpoints de escrita (1 MiB)", () => {
    expect(MAX_JSON_BODY_BYTES).toBe(1024 * 1024);
  });
});
