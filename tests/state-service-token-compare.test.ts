import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";

/**
 * A16d / L12 (F6.2): o State Service comparava o header `Authorization` com
 * `===` de string, que termina na primeira diferença (tempo depende do
 * prefixo certo). Agora a comparação passa por `crypto.timingSafeEqual`
 * sobre digests de mesmo tamanho, então header de tamanho diferente também
 * não lança. A semântica do contrato fica igual: só `Bearer <token>` exato
 * autentica (ver `tests/contract/state-service-http.contract.test.ts`).
 *
 * `vi.mock("crypto")` pontual: delega tudo ao módulo real e só conta as
 * chamadas de `timingSafeEqual`. Tempo de CPU não dá teste determinístico.
 */

const spy = vi.hoisted(() => ({ timingSafeEqual: 0 }));

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  const timingSafeEqual = (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView): boolean => {
    spy.timingSafeEqual += 1;
    return actual.timingSafeEqual(a, b);
  };
  return { ...actual, default: { ...actual, timingSafeEqual }, timingSafeEqual };
});

import { StateServiceServer, UNAUTHORIZED_ERROR } from "../src/server/StateServiceServer";
import { isBearerTokenValid } from "../src/server/state-service-auth";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";

const TOKEN = "f".repeat(64);

function get(port: number, authorization?: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers = authorization !== undefined ? { Authorization: authorization } : undefined;
    const req = http.request({ host: "127.0.0.1", port, path: "/initiatives", method: "GET", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
    });
    req.on("error", reject);
    req.end();
  });
}

let server: StateServiceServer | undefined;
let root: string | undefined;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("StateServiceServer — comparação do token em tempo constante (A16d)", () => {
  it.each([
    ["token certo", 200, `Bearer ${TOKEN}`],
    ["token errado de mesmo tamanho", 401, `Bearer ${"0".repeat(64)}`],
    ["token com prefixo certo e tamanho diferente", 401, `Bearer ${TOKEN.slice(0, 10)}`],
    ["header muito maior que o esperado", 401, `Bearer ${TOKEN}${"x".repeat(4096)}`],
  ])("REGRESSÃO: %s passa por crypto.timingSafeEqual e responde %i", async (_caso, status, authorization) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-token-"));
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TOKEN });
    const port = await server.start();
    spy.timingSafeEqual = 0;

    const res = await get(port, authorization);

    expect(res.status).toBe(status);
    if (status === 401) expect(res.body).toEqual({ ok: false, error: UNAUTHORIZED_ERROR });
    expect(spy.timingSafeEqual).toBe(1);
  });

  it("isBearerTokenValid: só 'Bearer <token>' exato vale (mesma semântica do contrato)", () => {
    expect(isBearerTokenValid(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isBearerTokenValid(undefined, TOKEN)).toBe(false);
    expect(isBearerTokenValid("", TOKEN)).toBe(false);
    expect(isBearerTokenValid(TOKEN, TOKEN)).toBe(false);
    expect(isBearerTokenValid(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(isBearerTokenValid(`Bearer  ${TOKEN}`, TOKEN)).toBe(false);
    expect(isBearerTokenValid(`Bearer ${TOKEN.toUpperCase()}`, TOKEN)).toBe(false);
  });
});
