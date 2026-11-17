import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { StateServiceServer } from "../src/server/StateServiceServer";
import { YamlStateRepository } from "../src/cli/lib/StateRepository";
import { parseInitiativesYaml } from "../src/data/initiatives-contract.pure";
import { parseDeliveryState } from "../src/data/delivery-state-contract.pure";

/**
 * Endpoints de ESCRITA do State Service (item 3.1, roadmap
 * `mod-state-service`, wave 3) — arquivo separado de
 * `tests/state-service-server.test.ts` (item 2.2, leitura) e
 * `tests/state-service-server-auth.test.ts` (item 2.5, auth genérica) pra
 * não misturar com as asserções já existentes ali. Cobre: caminho feliz de
 * cada endpoint (o arquivo real é gravado em disco, igual ao CLI faria), 401
 * sem token, e erro de validação com 4xx claro (400 pra flag/enum inválido,
 * 404 pra iniciativa inexistente).
 */

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "helyx-state-service-write-"));

const TOKEN = "write-endpoints-token";

function post(port: number, urlPath: string, body: unknown, token: string | null = TOKEN): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method: "POST", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

function postRaw(port: number, urlPath: string, rawBody: string, token: string | undefined = TOKEN): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method: "POST", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined }));
    });
    req.on("error", reject);
    req.end(rawBody);
  });
}

let server: StateServiceServer | undefined;
let root: string;

/** Quem aprova nos testes de gate (ADR-0024): fixo, para não depender do `user.name` do git de quem roda a suíte. */
const APPROVER = "Pessoa Fictícia";

async function startServer(approverName: () => Promise<string | null> = async () => APPROVER): Promise<number> {
  root = tmpDir();
  server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, token: TOKEN, approverName });
  return server.start();
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }
});

function readInitiativesYaml(): string {
  return fs.readFileSync(path.join(root, ".github", "artifacts", "initiatives.yaml"), "utf-8");
}

function readGlobalDeliveryStateYaml(): string {
  return fs.readFileSync(path.join(root, ".github", "artifacts", "delivery-state.yaml"), "utf-8");
}

describe("StateServiceServer — POST /initiatives (create/upsert)", () => {
  it("caminho feliz: 200, changed:true, initiatives.yaml gravado de verdade", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives", { id: "mod-x", name: "Modernização X", status: "planned" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, changed: true, id: "mod-x" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]).toMatchObject({ id: "mod-x", name: "Modernização X", status: "planned" });
  });

  it("sem token: 401, nada é gravado", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives", { id: "mod-x" }, null);
    expect(status).toBe(401);
    expect(body).toMatchObject({ ok: false });
    expect(fs.existsSync(path.join(root, ".github", "artifacts", "initiatives.yaml"))).toBe(false);
  });

  it("sem 'id': 400 MISSING_FLAG", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives", { name: "Sem id" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "id" } });
  });

  it("'status' fora do enum: 400 INVALID_ENUM", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives", { id: "mod-x", status: "bogus" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "status", value: "bogus" } });
  });

  it("corpo não é JSON válido: 400 INVALID_JSON", async () => {
    const port = await startServer();
    const { status, body } = await postRaw(port, "/initiatives", "{ isto não é json");
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_JSON" } });
  });
});

describe("StateServiceServer — POST /initiatives/:id/switch-active", () => {
  it("caminho feliz: 200, active: no YAML aponta pro id", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });

    const { status, body } = await post(port, "/initiatives/mod-x/switch-active", {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "mod-x" });
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.active).toBe("mod-x");
  });

  it("sem token: 401", async () => {
    const port = await startServer();
    const { status } = await post(port, "/initiatives/mod-x/switch-active", {}, null);
    expect(status).toBe(401);
  });

  // @known-bug (já pinado no CLI — ver initiatives-command.test.ts, item
  // 1.3): switch-active nunca valida se o id existe em `initiatives:`, e
  // rodado num arquivo que ainda não tem NENHUMA iniciativa, grava só
  // `active: "..."` sem a chave `initiatives:` — o mesmo parser que a UI
  // usa devolve `state: null` pra esse YAML. O endpoint HTTP chama a MESMA
  // `switchActiveInitiativeAtomic` que o CLI já chamava — o bug se
  // manifesta IDENTICAMENTE via HTTP: 200 (não 404), `changed:true`, e o
  // arquivo fica ilegível pro parser. Documentado aqui, não corrigido.
  it("iniciativa inexistente (nunca criada): 200 igual, sem validar — mesmo known-bug do CLI, agora via HTTP", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives/nao-existe/switch-active", {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, changed: true, id: "nao-existe" });

    const raw = readInitiativesYaml();
    expect(raw).toContain('active: "nao-existe"');
    expect(raw).not.toContain("initiatives:");
    const { state } = parseInitiativesYaml(raw);
    expect(state).toBeNull(); // known-bug: GET /initiatives também devolveria state: null depois disso
  });
});

describe("StateServiceServer — POST /initiatives/:id/bump-phase", () => {
  it("caminho feliz: 200, current_phase atualizado", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });

    const { status, body } = await post(port, "/initiatives/mod-x/bump-phase", { phase: "product" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "mod-x", phase: "product" });
    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]).toMatchObject({ current_phase: "product" });
  });

  it("iniciativa inexistente: 404 INITIATIVE_NOT_FOUND", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives/nao-existe/bump-phase", { phase: "product" });
    expect(status).toBe(404);
    expect(body).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND", id: "nao-existe" } });
  });

  it("sem 'phase': 400 MISSING_FLAG", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    const { status, body } = await post(port, "/initiatives/mod-x/bump-phase", {});
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "phase" } });
  });
});

describe("StateServiceServer — POST /initiatives/:id/wave-items/:wave/:item", () => {
  it("caminho feliz: 200, wave item gravado com artifacts/known-bugs", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });

    const { status, body } = await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.1", {
      status: "done",
      repo: "billing-api",
      commit: "4a2cf26",
      artifacts: ["docs/adr/0003.md", "code/README.md"],
      knownBugsPinned: ["BUG-001"],
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "mod-x", wave: "wave-1", item: "item-1.1", status: "done" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    const item = state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(item).toMatchObject({ status: "done", repo: "billing-api", commit: "4a2cf26", artifacts: ["docs/adr/0003.md", "code/README.md"] });
  });

  it("iniciativa inexistente: 404 INITIATIVE_NOT_FOUND", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/initiatives/nao-existe/wave-items/wave-1/item-1.1", { status: "done" });
    expect(status).toBe(404);
    expect(body).toMatchObject({ ok: false, error: { code: "INITIATIVE_NOT_FOUND" } });
  });

  it("ADR-0006: body.group:'epic' grava em epic_status, não wave_status", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });

    const { status, body } = await post(port, "/initiatives/mod-x/wave-items/epic-1/task-1.1", { status: "done", group: "epic" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "mod-x", wave: "epic-1", item: "task-1.1", status: "done" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    const initiative = state!.initiatives[0]!;
    expect(initiative.epic_status?.["epic-1"]?.items?.["task-1.1"]).toMatchObject({ status: "done" });
    expect(initiative.wave_status).toBeUndefined();
  });

  it("ADR-0006: sem 'group' no body continua gravando em wave_status (default retrocompatível)", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.1", { status: "done" });

    const { state } = parseInitiativesYaml(readInitiativesYaml());
    expect(state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"]).toMatchObject({ status: "done" });
    expect(state!.initiatives[0]!.epic_status).toBeUndefined();
  });

  it("sem 'status': 400 MISSING_FLAG", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    const { status, body } = await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.1", {});
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "status" } });
  });

  it("requiresApproval: true grava requires_approval no item; ausente nunca escreve o campo", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });

    await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.1", { status: "in-progress" });
    const withoutFlag = parseInitiativesYaml(readInitiativesYaml()).state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(withoutFlag).not.toHaveProperty("requires_approval");

    const { status, body } = await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1.2", { status: "done", requiresApproval: true });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "mod-x", wave: "wave-1", item: "item-1.2", status: "done" });

    const item = parseInitiativesYaml(readInitiativesYaml()).state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.2"];
    expect(item).toMatchObject({ status: "done", requires_approval: true });
  });
});

describe("StateServiceServer — POST /delivery-state/upsert-phase", () => {
  it("--global: 200, arquivo global gravado de verdade", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-phase", {
      global: true,
      phase: "business",
      status: "done",
      agent: "@business",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, changed: true, phase: "business", status: "done" });

    const parsed = parseDeliveryState(readGlobalDeliveryStateYaml());
    expect(parsed!.phases.business).toMatchObject({ status: "done", agent: "@business" });
  });

  it("sem 'global' nem 'initiativeId': 400 MISSING_SCOPE", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-phase", { phase: "business", status: "done" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "MISSING_SCOPE" } });
  });

  it("'status' fora do enum: 400 INVALID_ENUM", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-phase", { global: true, phase: "business", status: "bogus" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_ENUM", field: "status", value: "bogus" } });
  });

  it("sem token: 401", async () => {
    const port = await startServer();
    const { status } = await post(port, "/delivery-state/upsert-phase", { global: true, phase: "business", status: "done" }, null);
    expect(status).toBe(401);
  });
});

describe("StateServiceServer — POST /delivery-state/upsert-checklist", () => {
  it("caminho feliz com 'checked' booleano de verdade: 200, item marcado", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-checklist", {
      global: true,
      phase: "business",
      item: "problem-section",
      checked: true,
      section: "human_checklist",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, changed: true, phase: "business", item: "problem-section", checked: true });

    const parsed = parseDeliveryState(readGlobalDeliveryStateYaml());
    expect(parsed!.phases.business!.human_checklist).toMatchObject({ "problem-section": true });
  });

  it("'checked' como string 'true'/'false' também funciona (paridade com o CLI)", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-checklist", {
      global: true,
      phase: "business",
      item: "kpi-defined",
      checked: "false",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, checked: false });
  });

  it("'checked' com valor inválido (nem boolean nem 'true'/'false'): 400 INVALID_BOOLEAN", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-checklist", {
      global: true,
      phase: "business",
      item: "x",
      checked: "1",
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_BOOLEAN", field: "checked" } });
  });

  it("--initiative (initiativeId no corpo): grava no path da iniciativa, não no global", async () => {
    const port = await startServer();
    const { status, body } = await post(port, "/delivery-state/upsert-checklist", {
      initiativeId: "mod-x",
      phase: "business",
      item: "kpi-defined",
      checked: true,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(fs.existsSync(path.join(root, ".github", "artifacts", "delivery-state.yaml"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".github", "artifacts", "initiatives", "mod-x", "delivery-state.yaml"))).toBe(true);
  });
});

// G2 (ADR-0024, proposta): o `gates approve` do CLI tenta este endpoint antes do fallback.
describe("StateServiceServer — POST /gates/approve (G2)", () => {
  /** Iniciativa "mod-x" com o roadmap e a matriz de risco aprovados: o D2 pode fechar (ADR-0024, decisão 3). */
  function writePlanningApproved(): void {
    const file = path.join(root, ".github", "artifacts", "initiatives.yaml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "active: mod-x\ninitiatives:\n  - id: mod-x\n    name: mod-x\n    status: in-progress\n    roadmap_gate:\n      status: approved\n    risk_matrix_gate:\n      status: approved\n", "utf-8");
  }

  it("aprova o D2 de uma iniciativa: 200 com o envelope do CLI e o gate gravado com human_approved_at e quem aprovou", async () => {
    const port = await startServer();
    writePlanningApproved();
    const { status, body } = await post(port, "/gates/approve", { gate: "d2", initiativeId: "mod-x", at: "2026-11-15T12:00:00.000Z", note: "ok" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, changed: true, gate: "d2", initiative: "mod-x", human_approved_at: "2026-11-15T12:00:00.000Z", by: APPROVER });
    expect(readInitiativesYaml()).toContain('human_approved_at: "2026-11-15T12:00:00.000Z"');
  });

  it("ADR-0024: D2 sem roadmap e matriz de risco aprovados é 400 GATE_NOT_CLOSED com o que falta", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    const { status, body } = await post(port, "/gates/approve", { gate: "d2", initiativeId: "mod-x" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "GATE_NOT_CLOSED", gate: "d2", open: [{ gate: "roadmap_gate", status: "missing" }, { gate: "risk_matrix_gate", status: "missing" }] } });
  });

  it("ADR-0024: sem by e sem user.name no git, 400 MISSING_FLAG com field by (o Cockpit pergunta o nome)", async () => {
    const port = await startServer(async () => null);
    writePlanningApproved();
    const { status, body } = await post(port, "/gates/approve", { gate: "d2", initiativeId: "mod-x" });
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "MISSING_FLAG", field: "by" } });
  });

  it("gate fora de d1/d2/d3: 400 INVALID_ENUM; iniciativa inexistente: 404 INITIATIVE_NOT_FOUND", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    expect(await post(port, "/gates/approve", { gate: "d9", initiativeId: "mod-x" })).toMatchObject({ status: 400, body: { ok: false, error: { code: "INVALID_ENUM" } } });
    expect(await post(port, "/gates/approve", { gate: "d3", initiativeId: "nao-existe" })).toMatchObject({ status: 404, body: { ok: false, error: { code: "INITIATIVE_NOT_FOUND" } } });
  });
});

describe("StateServiceServer — eventos agent-activity das escritas (F5.2)", () => {
  const runsFile = (name: string): string => path.join(root, ".github", "artifacts", "runs", `${name}.jsonl`);
  const events = (name: string): Array<Record<string, unknown>> =>
    fs.readFileSync(runsFile(name), "utf-8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

  it("escrita bem-sucedida grava o evento em runs/<iniciativa>.jsonl, sem harness (o servidor não sabe quem chamou)", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    const { status } = await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1", { status: "in-progress" });
    expect(status).toBe(200);
    const recorded = events("mod-x");
    expect(recorded.map((e) => e.event_type)).toEqual(["artifact-written", "artifact-written"]);
    expect(recorded[1]).toMatchObject({ run_id: "state-commands", initiative_id: "mod-x", task_id: "wave-1/item-1", artifact_path: ".github/artifacts/initiatives.yaml" });
    expect(recorded[1]!.harness).toBeUndefined();
  });

  it("escrita recusada (400) não grava evento", async () => {
    const port = await startServer();
    await post(port, "/initiatives", { id: "mod-x" });
    expect((await post(port, "/initiatives/mod-x/wave-items/wave-1/item-1", { status: "blocked" })).status).toBe(400);
    expect(events("mod-x")).toHaveLength(1);
  });
});
