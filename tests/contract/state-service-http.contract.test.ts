import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { StateServiceServer, UNAUTHORIZED_ERROR } from "../../src/server/StateServiceServer";
import { EventBus, type StateServiceEvent } from "../../src/server/EventBus";
import { YamlStateRepository } from "../../src/cli/lib/StateRepository";
import { readStateServiceInfo, stateServiceInfoFilePath } from "../../src/server/state-service-info";
import { cleanupWorkspaces, makeNormalizer, makeTempDir, writeFiles, type Normalizer } from "../characterization/helpers/workspace-fixture";

/**
 * Contrato HTTP do State Service congelado — F0.4 (lane B), passo SS1 de
 * arquitetura-e-refatoracao.md §2.8 / §7.1 ("HTTP do State Service: rotas,
 * status, envelopes, Bearer, /health público").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * As suítes `tests/state-service-server*.test.ts` testam cada rota com
 * asserções escolhidas à mão (`toMatchObject`). Este arquivo NÃO as
 * substitui: consolida tudo numa TABELA única (rota × método × auth × corpo
 * → status + content-type + envelope completo + eventos publicados no
 * EventBus), executada em sequência contra um servidor real em 127.0.0.1 e
 * comparada com snapshot. É a rede de segurança dos passos SS2 (extrair
 * `StateCommands`), SS3 (CLI reusa) e SS4 (tabela de rotas): qualquer mudança
 * de status, de envelope ou de evento quebra aqui.
 *
 * Determinismo: raiz temporária → `<ROOT>`, carimbos gerados no teste →
 * `<agora>`; o workspace é sintético (ids inventados, nenhum dado real).
 */

const TOKEN = "contract-token-f04";

interface Row {
  name: string;
  method: string;
  path: string;
  auth?: "none" | "valid" | "wrong" | "malformed";
  body?: string;
}

interface Result {
  status: number;
  contentType: string | undefined;
  body: unknown;
}

function request(port: number, row: Row): Promise<Result> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const auth = row.auth ?? "valid";
    if (auth === "valid") headers.Authorization = `Bearer ${TOKEN}`;
    if (auth === "wrong") headers.Authorization = "Bearer token-errado";
    if (auth === "malformed") headers.Authorization = TOKEN;
    if (row.body !== undefined) headers["Content-Type"] = "application/json";
    const req = http.request({ host: "127.0.0.1", port, path: row.path, method: row.method, headers }, (res) => {
      const contentType = res.headers["content-type"];
      if (contentType === "text/event-stream") {
        // SSE nunca termina sozinho — o contrato é status + headers.
        resolve({
          status: res.statusCode ?? 0,
          contentType,
          body: { "cache-control": res.headers["cache-control"], connection: res.headers["connection"] },
        });
        req.destroy();
        return;
      }
      let raw = "";
      res.on("data", (chunk: Buffer) => (raw += chunk.toString("utf-8")));
      res.on("end", () => {
        let body: unknown = raw;
        try {
          body = raw ? JSON.parse(raw) : "";
        } catch {
          // corpo não-JSON fica como texto cru
        }
        resolve({ status: res.statusCode ?? 0, contentType, body });
      });
    });
    req.on("error", reject);
    req.end(row.body);
  });
}

/** Workspace sintético inicial — uma iniciativa existente para as rotas de leitura/escrita responderem com dado. */
const SEED_INITIATIVES = `version: 1
active: loja-demo
initiatives:
  - id: loja-demo
    name: "Loja Demo"
    status: in-progress
    stream: upstream
    current_phase: business
    mode: greenfield
    type: feature
    created_at: "2025-03-01"
`;

const SEED_DELIVERY = `initiative_id: loja-demo
phases:
  business:
    status: in-progress
    agent: "@business"
`;

/** A tabela do contrato — executada NA ORDEM (as escritas alteram o estado lido pelas linhas seguintes). */
const ROWS: Row[] = [
  // ── /health: único endpoint público ─────────────────────────────────────
  { name: "GET /health sem auth", method: "GET", path: "/health", auth: "none" },
  { name: "GET /health com token errado (continua público)", method: "GET", path: "/health", auth: "wrong" },
  { name: "GET /health com token válido", method: "GET", path: "/health" },
  { name: "POST /health (só GET é público; POST cai no roteador de escrita)", method: "POST", path: "/health", auth: "none" },
  { name: "POST /health autenticado", method: "POST", path: "/health", body: "{}" },
  { name: "DELETE /health sem auth", method: "DELETE", path: "/health", auth: "none" },

  // ── auth antes do roteamento ────────────────────────────────────────────
  { name: "GET /initiatives sem auth", method: "GET", path: "/initiatives", auth: "none" },
  { name: "GET /initiatives com token errado", method: "GET", path: "/initiatives", auth: "wrong" },
  { name: "GET /initiatives com header sem 'Bearer '", method: "GET", path: "/initiatives", auth: "malformed" },
  { name: "GET rota inexistente sem auth (401, não vaza a rota)", method: "GET", path: "/nao-existe", auth: "none" },
  { name: "GET /events sem auth", method: "GET", path: "/events", auth: "none" },

  // ── leitura ─────────────────────────────────────────────────────────────
  { name: "GET /initiatives", method: "GET", path: "/initiatives" },
  { name: "GET /initiatives com query string ignorada", method: "GET", path: "/initiatives?x=1" },
  { name: "GET /delivery-state (global, inexistente → state null)", method: "GET", path: "/delivery-state" },
  { name: "GET /delivery-state?initiativeId=loja-demo", method: "GET", path: "/delivery-state?initiativeId=loja-demo" },
  { name: "GET /delivery-state?initiativeId=inexistente", method: "GET", path: "/delivery-state?initiativeId=inexistente" },
  { name: "GET /events (SSE: headers)", method: "GET", path: "/events" },
  { name: "GET rota inexistente autenticado", method: "GET", path: "/nao-existe" },
  { name: "GET /initiatives/loja-demo (não existe rota GET por id)", method: "GET", path: "/initiatives/loja-demo" },

  // ── métodos sem rota ────────────────────────────────────────────────────
  { name: "PUT /initiatives", method: "PUT", path: "/initiatives", body: "{}" },
  { name: "DELETE /initiatives", method: "DELETE", path: "/initiatives" },
  { name: "PATCH /delivery-state", method: "PATCH", path: "/delivery-state", body: "{}" },

  // ── POST /initiatives ───────────────────────────────────────────────────
  { name: "POST /initiatives sem token", method: "POST", path: "/initiatives", auth: "none", body: '{"id":"x"}' },
  { name: "POST /initiatives corpo não-JSON", method: "POST", path: "/initiatives", body: "{nao json" },
  { name: "POST /initiatives corpo vazio", method: "POST", path: "/initiatives" },
  { name: "POST /initiatives corpo JSON não-objeto (string)", method: "POST", path: "/initiatives", body: '"texto"' },
  { name: "POST /initiatives corpo JSON array", method: "POST", path: "/initiatives", body: "[1,2]" },
  { name: "POST /initiatives id vazio", method: "POST", path: "/initiatives", body: '{"id":""}' },
  { name: "POST /initiatives id não-string", method: "POST", path: "/initiatives", body: '{"id":42}' },
  { name: "POST /initiatives status fora do enum", method: "POST", path: "/initiatives", body: '{"id":"x","status":"finished"}' },
  { name: "POST /initiatives mode fora do enum", method: "POST", path: "/initiatives", body: '{"id":"x","mode":"hybrid"}' },
  { name: "POST /initiatives type fora do enum", method: "POST", path: "/initiatives", body: '{"id":"x","type":"epic"}' },
  {
    name: "POST /initiatives cria (todos os campos + active:true)",
    method: "POST",
    path: "/initiatives",
    body: JSON.stringify({
      id: "pedidos-mod",
      name: "Modernização de Pedidos",
      status: "planned",
      stream: "foundation",
      currentPhase: "assessor",
      mode: "brownfield",
      type: "modernization",
      owner: "time-plataforma",
      priority: "P1",
      createdAt: "2025-04-02",
      active: true,
    }),
  },
  { name: "POST /initiatives repetido (idempotente → changed:false)", method: "POST", path: "/initiatives", body: JSON.stringify({ id: "pedidos-mod", name: "Modernização de Pedidos" }) },
  { name: "POST /initiatives active:'true' (string não ativa)", method: "POST", path: "/initiatives", body: '{"id":"catalogo-hotfix","type":"hotfix","active":"true"}' },

  // ── switch-active ───────────────────────────────────────────────────────
  { name: "POST switch-active", method: "POST", path: "/initiatives/loja-demo/switch-active" },
  { name: "POST switch-active com id url-encoded", method: "POST", path: "/initiatives/loja%2Ddemo/switch-active" },
  { name: "POST switch-active com sufixo extra (404)", method: "POST", path: "/initiatives/loja-demo/switch-active/extra" },

  // ── bump-phase ──────────────────────────────────────────────────────────
  { name: "POST bump-phase sem phase", method: "POST", path: "/initiatives/loja-demo/bump-phase", body: "{}" },
  { name: "POST bump-phase phase vazia", method: "POST", path: "/initiatives/loja-demo/bump-phase", body: '{"phase":""}' },
  { name: "POST bump-phase", method: "POST", path: "/initiatives/loja-demo/bump-phase", body: '{"phase":"product"}' },
  { name: "POST bump-phase repetido", method: "POST", path: "/initiatives/loja-demo/bump-phase", body: '{"phase":"product"}' },
  { name: "POST bump-phase iniciativa inexistente", method: "POST", path: "/initiatives/nao-existe/bump-phase", body: '{"phase":"x"}' },

  // ── wave-items ──────────────────────────────────────────────────────────
  { name: "POST wave-item sem status", method: "POST", path: "/initiatives/pedidos-mod/wave-items/wave-1/item-1.1", body: "{}" },
  {
    name: "POST wave-item completo (wave_status)",
    method: "POST",
    path: "/initiatives/pedidos-mod/wave-items/wave-1/item-1.1",
    body: JSON.stringify({
      status: "done",
      repo: "pedidos-api",
      completedAt: "2025-04-10",
      artifacts: ["docs/adr/0001-exemplo.md", 7],
      summary: "characterization tests do módulo de pedidos",
      commit: "abc1234",
      knownBugsPinned: ["BUG-SINTETICO-1"],
      mergeBlock: "aguardando revisão",
      requiresApproval: true,
    }),
  },
  { name: "POST wave-item group:epic (epic_status)", method: "POST", path: "/initiatives/pedidos-mod/wave-items/epic-1/task-1.1", body: '{"status":"in-progress","group":"epic"}' },
  { name: "POST wave-item group desconhecido (vira wave)", method: "POST", path: "/initiatives/pedidos-mod/wave-items/wave-2/item-2.1", body: '{"status":"planned","group":"saga"}' },
  { name: "POST wave-item requiresApproval string (ignorado)", method: "POST", path: "/initiatives/pedidos-mod/wave-items/wave-2/item-2.2", body: '{"status":"planned","requiresApproval":"true"}' },
  { name: "POST wave-item iniciativa inexistente", method: "POST", path: "/initiatives/nao-existe/wave-items/w/i", body: '{"status":"done"}' },
  { name: "POST wave-item sem o segmento de item (404)", method: "POST", path: "/initiatives/pedidos-mod/wave-items/wave-1", body: '{"status":"done"}' },

  // ── delivery-state/upsert-phase ─────────────────────────────────────────
  { name: "POST upsert-phase sem escopo", method: "POST", path: "/delivery-state/upsert-phase", body: '{"phase":"business","status":"done"}' },
  { name: "POST upsert-phase global:'true' (string não vale)", method: "POST", path: "/delivery-state/upsert-phase", body: '{"global":"true","phase":"business","status":"done"}' },
  { name: "POST upsert-phase global sem phase", method: "POST", path: "/delivery-state/upsert-phase", body: '{"global":true,"status":"done"}' },
  { name: "POST upsert-phase global sem status", method: "POST", path: "/delivery-state/upsert-phase", body: '{"global":true,"phase":"business"}' },
  { name: "POST upsert-phase status fora do enum", method: "POST", path: "/delivery-state/upsert-phase", body: '{"global":true,"phase":"business","status":"round_2_done"}' },
  {
    name: "POST upsert-phase global completo",
    method: "POST",
    path: "/delivery-state/upsert-phase",
    body: JSON.stringify({ global: true, phase: "business", status: "done", agent: "@business", completedAt: "2025-04-11T10:00:00Z", artifacts: [".github/artifacts/business-brief.md"] }),
  },
  { name: "POST upsert-phase global + initiativeId (global vence)", method: "POST", path: "/delivery-state/upsert-phase", body: '{"global":true,"initiativeId":"loja-demo","phase":"product","status":"pending"}' },
  { name: "POST upsert-phase por iniciativa", method: "POST", path: "/delivery-state/upsert-phase", body: '{"initiativeId":"loja-demo","phase":"product","status":"in-progress","agent":"@product"}' },

  // ── delivery-state/upsert-checklist ─────────────────────────────────────
  { name: "POST upsert-checklist sem escopo", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"phase":"business","item":"kpi","checked":true}' },
  { name: "POST upsert-checklist sem item", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"global":true,"phase":"business","checked":true}' },
  { name: "POST upsert-checklist sem checked", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"global":true,"phase":"business","item":"kpi"}' },
  { name: "POST upsert-checklist checked inválido", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"global":true,"phase":"business","item":"kpi","checked":"sim"}' },
  { name: "POST upsert-checklist checked numérico", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"global":true,"phase":"business","item":"kpi","checked":1}' },
  { name: "POST upsert-checklist checked:true (default human_checklist)", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"global":true,"phase":"business","item":"kpi-defined","checked":true}' },
  { name: "POST upsert-checklist checked:'false' string + section", method: "POST", path: "/delivery-state/upsert-checklist", body: '{"initiativeId":"loja-demo","phase":"product","item":"prd-ok","checked":"false","section":"checklist"}' },

  // ── runs/append (F5.2, contrato agent-activity; rota nova autorizada pela ADR-0020) ──
  {
    name: "POST /runs/append evento de agente (nomes do contrato)",
    method: "POST",
    path: "/runs/append",
    body: JSON.stringify({ event_type: "artifact-written", initiative_id: "loja-demo", agent_id: "@backend", artifact_path: ".github/artifacts/execution/relatorio.md", run_id: "r-contrato", timestamp: "2025-04-12T10:00:00.000Z" }),
  },
  { name: "POST /runs/append decisão humana (agente não registra: 400)", method: "POST", path: "/runs/append", body: '{"event_type":"decision-made","by":"X"}' },

  // ── fim: estado lido de volta pela própria API ──────────────────────────
  { name: "GET /initiatives (depois das escritas)", method: "GET", path: "/initiatives" },
  { name: "GET /delivery-state global (depois das escritas)", method: "GET", path: "/delivery-state" },
];

describe("contrato — State Service HTTP (rotas × status × envelope × eventos)", () => {
  let base: string;
  let root: string;
  let server: StateServiceServer;
  let port: number;
  const events: StateServiceEvent[] = [];
  const results: Array<{ request: string; status: number; contentType: string | undefined; body: unknown; events: unknown[] }> = [];
  let normalize: Normalizer;
  const startedAt = new Date();

  beforeAll(async () => {
    base = makeTempDir("http-contract");
    root = path.join(base, "ws");
    writeFiles(root, {
      ".github/artifacts/initiatives.yaml": SEED_INITIATIVES,
      ".github/artifacts/initiatives/loja-demo/delivery-state.yaml": SEED_DELIVERY,
    });
    const bus = new EventBus();
    bus.subscribe((e) => events.push(e));
    server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: bus, token: TOKEN });
    port = await server.start();
    normalize = makeNormalizer({ roots: [root, base], since: startedAt });

    for (const row of ROWS) {
      const before = events.length;
      const res = await request(port, row);
      // escrita publica de forma síncrona antes de responder — nada de espera
      results.push({
        request: `${row.method} ${row.path} [auth:${row.auth ?? "valid"}]${row.body !== undefined ? ` body=${row.body}` : ""} — ${row.name}`,
        status: res.status,
        contentType: res.contentType,
        body: normalize(res.body),
        events: normalize(events.slice(before)) as unknown[],
      });
    }
  });

  afterAll(async () => {
    await server.stop();
    cleanupWorkspaces();
  });

  it("a tabela inteira (status + content-type + envelope + eventos) bate com o snapshot", () => {
    expect(results).toMatchSnapshot();
  });

  it("todo 401 usa o MESMO envelope (não distingue token ausente de token errado)", () => {
    const unauthorized = results.filter((r) => r.status === 401);
    expect(unauthorized.length).toBe(8);
    for (const r of unauthorized) expect(r.body).toEqual({ ok: false, error: UNAUTHORIZED_ERROR });
  });

  it("toda resposta não-SSE é application/json; charset=utf-8", () => {
    const contentTypes = new Set(results.filter((r) => r.contentType !== "text/event-stream").map((r) => r.contentType));
    expect([...contentTypes]).toEqual(["application/json; charset=utf-8"]);
  });

  it("só respostas 200 de escrita publicam evento — exatamente 1 `state-write`/`artifact-written` por escrita", () => {
    for (const r of results) {
      // F5.2: POST /runs/append não é escrita de estado; o evento vai a runs/*.jsonl e chega ao SSE pelo RunsWatcher.
      const isWrite = r.request.startsWith("POST") && r.status === 200 && !r.request.startsWith("POST /runs/append");
      expect(r.events.length, r.request).toBe(isWrite ? 1 : 0);
    }
  });

  it("distribuição de status da tabela (rede contra mudança silenciosa de código HTTP)", () => {
    const histogram: Record<string, number> = {};
    for (const r of results) histogram[String(r.status)] = (histogram[String(r.status)] ?? 0) + 1;
    expect(histogram).toMatchSnapshot();
  });

  it("bytes YAML que a API deixou em disco (golden — prova que SS2/SS3 não mudam a escrita)", () => {
    const read = (rel: string): string => normalize.text(fs.readFileSync(path.join(root, rel), "utf-8"));
    expect({
      "initiatives.yaml": read(".github/artifacts/initiatives.yaml"),
      "delivery-state.yaml (global)": read(".github/artifacts/delivery-state.yaml"),
      "initiatives/loja-demo/delivery-state.yaml": read(".github/artifacts/initiatives/loja-demo/delivery-state.yaml"),
    }).toMatchSnapshot();
  });

  it("server.json de descoberta: {port,pid,startedAt,token} com o token desta instância, e só isso", () => {
    const info = readStateServiceInfo(root);
    expect(info).not.toBeNull();
    expect(Object.keys(info!).sort()).toEqual(["pid", "port", "startedAt", "token"]);
    expect(info!.port).toBe(port);
    expect(info!.token).toBe(TOKEN);
    expect(fs.existsSync(stateServiceInfoFilePath(root))).toBe(true);
  });
});

describe("contrato — State Service HTTP (achados pinados)", () => {
  // Corrigido na F6.2 (A20 / H-BUG-64): o `initiativeId` virava segmento de
  // path sem validação, e `../` escapava a raiz do workspace. Agora o id é
  // validado (`validatePathSegmentId`) e a escrita é recusada com 400 no
  // envelope de sempre. O "fora" seria DENTRO do diretório temporário do
  // próprio teste (raiz = <tmp>/ws, escape = <tmp>/fora), nunca fora do tmp do SO.
  it("REGRESSÃO: upsert-phase com initiativeId '../../../../fora' é recusado com 400 USAGE e nada é gravado fora da raiz (A20 / H-BUG-64)", async () => {
    const base = makeTempDir("http-traversal");
    const root = path.join(base, "ws");
    fs.mkdirSync(root, { recursive: true });
    const server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: new EventBus(), token: TOKEN });
    const port = await server.start();
    try {
      const res = await request(port, {
        name: "traversal",
        method: "POST",
        path: "/delivery-state/upsert-phase",
        body: JSON.stringify({ initiativeId: "../../../../fora", phase: "business", status: "done" }),
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, error: { code: "USAGE", field: "initiative", value: "../../../../fora" } });
      expect(fs.existsSync(path.join(base, "fora"))).toBe(false);
      expect(fs.readdirSync(base)).toEqual(["ws"]);
    } finally {
      await server.stop();
      cleanupWorkspaces();
    }
  });

  // Behavior pinned on 2026-11-14 — o header tem que ser EXATAMENTE
  // `Bearer <token>`, sem tolerância a caixa/espaço. Desde a F6.2 (L12/A16d)
  // a comparação é em tempo constante (`isBearerTokenValid`), com a mesma
  // semântica; ver tests/state-service-token-compare.test.ts.
  it("Bearer é comparado literalmente: 'bearer <token>' (minúsculo) e espaço extra dão 401", async () => {
    const root = makeTempDir("http-bearer");
    const server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: new EventBus(), token: TOKEN });
    const port = await server.start();
    const raw = (authorization: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path: "/initiatives", method: "GET", headers: { Authorization: authorization } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end();
      });
    try {
      expect(await raw(`Bearer ${TOKEN}`)).toBe(200);
      expect(await raw(`bearer ${TOKEN}`)).toBe(401);
      expect(await raw(`Bearer  ${TOKEN}`)).toBe(401);
      expect(await raw(`Bearer ${TOKEN} `)).toBe(200); // o Node apara espaço final do valor do header
    } finally {
      await server.stop();
      cleanupWorkspaces();
    }
  });
});
