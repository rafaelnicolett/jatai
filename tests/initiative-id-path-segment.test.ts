import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { validatePathSegmentId } from "../src/cli/lib/validation";
import { resolveDeliveryStateScope } from "../src/cli/lib/delivery-state-scope";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { EventBus } from "../src/server/EventBus";

/**
 * A20 / H-BUG-64 / D29 (F6.2): o id de iniciativa vira nome de pasta
 * (`.github/artifacts/initiatives/<id>/`). Sem validação, `--initiative ../…`
 * gravava fora do workspace. O CLI e o State Service HTTP passam a recusar,
 * com o código `USAGE` que o contrato já tem, todo id que não seja um único
 * segmento de caminho. O CLI de ponta a ponta fica no golden
 * (`tests/golden`, cenário `ds-path-traversal-initiative`).
 */

describe("validatePathSegmentId (A20)", () => {
  it.each([["mod-missao-open-source"], ["gf-alfa"], ["hotfix_2026.11"], ["Iniciativa-Ação"], ['"aspas"'], ["..prefixo"]])(
    "aceita %j",
    (id) => {
      expect(validatePathSegmentId("initiative", id)).toEqual({ ok: true, value: id });
    }
  );

  it.each([["../fora"], [".."], ["."], ["a/b"], ["a\\b"], ["..\\fora"], ["/abs"], ["C:\\fora"], ["a\0b"], ["a\nb"], ["a\u007fb"]])(
    "REGRESSÃO: recusa %j com USAGE, field e value",
    (id) => {
      const result = validatePathSegmentId("initiative", id);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ code: "USAGE", field: "initiative", value: id });
    }
  );
});

describe("resolveDeliveryStateScope com --initiative inseguro (A20)", () => {
  const repo = new YamlStateRepository();

  it("REGRESSÃO: '../../x' não vira path; o erro é USAGE", () => {
    const result = resolveDeliveryStateScope(repo, "/ws", undefined, "../../x");
    expect(result).toMatchObject({ ok: false, error: { code: "USAGE", field: "initiative" } });
  });

  it("id válido continua resolvendo para initiatives/<id>/delivery-state.yaml", () => {
    const result = resolveDeliveryStateScope(repo, "/ws", undefined, "gf-alfa");
    expect(result).toEqual({ ok: true, path: path.join("/ws", ".github", "artifacts", "initiatives", "gf-alfa", "delivery-state.yaml") });
  });
});

describe("State Service HTTP — id inseguro em create e switch-active (A20, paridade com o CLI)", () => {
  const TOKEN = "id-segment-token";
  let server: StateServiceServer | undefined;
  let base: string;

  afterEach(async () => {
    if (server) await server.stop();
    server = undefined;
    fs.rmSync(base, { recursive: true, force: true });
  });

  function post(port: number, urlPath: string, body: unknown): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: urlPath, method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
  }

  it.each([
    ["POST /initiatives com id '../fora'", "/initiatives", { id: "../fora" }],
    ["POST /initiatives/:id/switch-active com id 'a/../../fora' (%2F)", `/initiatives/${encodeURIComponent("a/../../fora")}/switch-active`, {}],
  ])("REGRESSÃO: %s dá 400 USAGE e não grava nada", async (_caso, urlPath, body) => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-id-segment-"));
    const root = path.join(base, "ws");
    fs.mkdirSync(root);
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: new EventBus(), token: TOKEN });
    const port = await server.start();

    const res = await post(port, urlPath, body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: "USAGE", field: "id" } });
    expect(fs.existsSync(path.join(root, ".github", "artifacts", "initiatives.yaml"))).toBe(false);
  });
});
