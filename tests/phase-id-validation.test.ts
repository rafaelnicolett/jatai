import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { validatePhaseId } from "../src/cli/lib/validation";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { EventBus } from "../src/server/EventBus";

/**
 * M2 (F6.3): o id de fase entra cru em `new RegExp()` no motor de escrita do
 * delivery-state. `fase(1` dava INTERNAL (exit 2) e `business|x` regravava a
 * fase `business` com `ok:true`. O CLI e o State Service HTTP passam a
 * recusar, com o código `USAGE` que o contrato já tem, todo id de fase fora
 * de `[A-Za-z0-9_-]` (o formato de todos os ids do catálogo). O CLI de ponta
 * a ponta fica no golden (`tests/golden`, cenário `ds-regex-injecao-phase`).
 */

describe("validatePhaseId (M2)", () => {
  it.each([["business"], ["sprint-plan"], ["ux-design"], ["3-execution-epic-1"], ["fase_2"], ["Domain"]])("aceita %j", (phase) => {
    expect(validatePhaseId("phase", phase)).toEqual({ ok: true, value: phase });
  });

  it.each([["fase(1"], ["business|x"], ["fase[1"], ["a.b"], ["a*"], ["fase: 1"], ["fase 1"], ["#fase"], ["fase\\1"], ["negócio"], [""]])(
    "REGRESSÃO: recusa %j com USAGE, field e value",
    (phase) => {
      const result = validatePhaseId("phase", phase);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ code: "USAGE", field: "phase", value: phase });
    }
  );
});

describe("State Service HTTP — id de fase inválido no delivery-state (M2, paridade com o CLI)", () => {
  const TOKEN = "phase-id-token";
  const DS = "initiative_id: default\nphases:\n  business:\n    status: done\n";
  let server: StateServiceServer | undefined;
  let root: string;

  afterEach(async () => {
    if (server) await server.stop();
    server = undefined;
    fs.rmSync(root, { recursive: true, force: true });
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
    ["upsert-phase com 'fase(1'", "/delivery-state/upsert-phase", { global: true, phase: "fase(1", status: "done" }],
    ["upsert-phase com 'business|x'", "/delivery-state/upsert-phase", { global: true, phase: "business|x", status: "pending" }],
    ["upsert-checklist com 'fase[1'", "/delivery-state/upsert-checklist", { global: true, phase: "fase[1", item: "x", checked: true }],
  ])("REGRESSÃO: %s dá 400 USAGE e o arquivo fica intacto", async (_caso, urlPath, body) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-phase-id-"));
    const file = path.join(root, ".github", "artifacts", "delivery-state.yaml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, DS);
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: new EventBus(), token: TOKEN });
    const port = await server.start();

    const res = await post(port, urlPath, body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: "USAGE", field: "phase" } });
    expect(fs.readFileSync(file, "utf-8")).toBe(DS);
  });
});
