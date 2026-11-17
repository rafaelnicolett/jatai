import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./helpers/fake-vscode"));
import * as fs from "fs";
import * as path from "path";
import { fake, type FakeWebviewPanel } from "./helpers/fake-vscode";
import { CockpitNextController } from "../../src/views/CockpitNextController";
import { SystemClock } from "../../src/adapters/clock/Clock";
import { VsCodeWorkspaceRoot } from "../../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeSettings } from "../../src/adapters/settings/VsCodeSettings";
import { ConfigLoader } from "../../src/adapters/config/ConfigLoader";
import { StateServiceServer } from "../../src/server/StateServiceServer";
import { EventBus } from "../../src/server/EventBus";
import { YamlStateRepository } from "../../src/cli/lib/StateRepository";
import { kitVersion } from "../../src/data/kit-version";
import { installNetGuard, type NetGuard } from "./helpers/net-guard";
import { cleanupWorkspaces, makeNormalizer, makeWorkspace, writeFiles, type Normalizer } from "./helpers/workspace-fixture";
import { goldenBrandSnapshotSerializer } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * CK1 — caracterização do host do Cockpit (`CockpitNextController`). F0.4
 * (lane B), arquitetura-e-refatoracao.md §2.9 passo CK1: "Golden do
 * `CockpitSnapshot` (normalizando `generatedAt`, `seq`) para 3 fixtures
 * (vazio, brownfield em Foundation, greenfield com sprint) + sequência de
 * mensagens no handshake".
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Montagem real, sem atalho: workspace SINTÉTICO num tmp dir, State Service
 * REAL em 127.0.0.1 (porta 0, EventBus próprio) — o controller lê
 * iniciativas/delivery-state por HTTP loopback como em produção (N5) —,
 * `FakeWebviewPanel` capturando todo `postMessage`, e a rede externa travada
 * (telemetria/registry viram efeito gravado, nunca saem da máquina).
 *
 * Rede dos passos CK2 (`CockpitSnapshotBuilder`), CK3 (`RunEventNotifier`) e
 * CK4 (leitura in-process no lugar do loopback — que deve manter este golden,
 * exceto onde o @known-bug A12 for corrigido de propósito).
 */

const TOKEN = "cockpit-ck1-token";
const startedAt = new Date();

let net: NetGuard;
const servers: StateServiceServer[] = [];

beforeEach(() => {
  fake.reset();
  net = installNetGuard();
});

afterEach(async () => {
  for (const panel of fake.panels) panel.dispose(); // para o timer de 4 s e o cliente SSE
  while (servers.length) await servers.pop()!.stop();
  net.restore();
});

afterAll(() => cleanupWorkspaces());

// ── fixtures sintéticas ─────────────────────────────────────────────────────

const RUNS_BROWNFIELD = [
  { run_id: "r1", event_type: "agent-started", timestamp: "2025-02-01T09:00:00Z", phase_id: "tech-stack", agent_id: "@tech-mapper", repo_id: "pedidos-api", message: "lendo manifests" },
  { run_id: "r1", event_type: "agent-done", timestamp: "2025-02-01T09:30:00Z", phase_id: "tech-stack", agent_id: "@tech-mapper", repo_id: "pedidos-api" },
  { run_id: "r2", event_type: "agent-started", timestamp: "2025-02-02T10:00:00Z", phase_id: "arch", agent_id: "@arch-discoverer", repo_id: "pedidos-api", message: "mapeando camadas" },
  { run_id: "r3", event_type: "gate-approved", timestamp: "2025-02-03T10:00:00Z", phase_id: "gate-d1", repo_id: "catalogo-web" },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

const BROWNFIELD_FILES: Record<string, string> = {
  [BRAND.files.config]: 'kit_version: "0.1.0"\nrepos:\n  pedidos-api:\n    skills: [coding-guidelines-pedidos-api]\n  catalogo-web:\n    skills: []\n',
  ".github/artifacts/repos.yaml":
    'version: 1\nrepos:\n  - id: pedidos-api\n    source: git\n    url: "https://git.example.invalid/sintetico/pedidos-api.git"\n    pinned_sha: "0123abc"\n  - id: catalogo-web\n    source: local-path\n    path: "repos/catalogo-web"\n    has_history: false\n',
  ".github/artifacts/assessment/foundation-state.yaml":
    "version: 2\nphases:\n  domain:\n    status: pending\nrepos:\n  pedidos-api:\n    phases:\n      tech-stack:\n        status: agent-done\n        agent: \"@tech-mapper\"\n      arch:\n        status: in-progress\n    findings_summary:\n      critical: 0\n      high: 1\n      medium: 2\n      low: 3\n    gate_d1:\n      status: pending\n  catalogo-web:\n    phases:\n      tech-stack:\n        status: done\n      arch:\n        status: done\n    gate_d1:\n      status: approved\n      approved_at: \"2025-02-03T10:00:00Z\"\n",
  ".github/artifacts/context-repos.yaml": "version: 1\ncontexts:\n  - slug: pedidos\n    name: Pedidos\n    status: accepted\n    lives_in:\n      - repo: pedidos-api\n",
  ".github/artifacts/assessment/repo-graph.yaml": 'version: 1\nedges:\n  - from: catalogo-web\n    to: pedidos-api\n    kind: http\n    evidence: "cliente HTTP em src/api"\n',
  ".github/artifacts/runs/foundation.jsonl": `${RUNS_BROWNFIELD}\n`,
};

const RUNS_GREENFIELD = [
  { run_id: "g1", event_type: "agent-done", timestamp: "2025-03-05T12:00:00Z", phase_id: "business", agent_id: "@business" },
  { run_id: "g2", event_type: "agent-started", timestamp: "2025-03-06T09:00:00Z", phase_id: "product", agent_id: "@product" },
  { run_id: "g3", event_type: "item-approved", timestamp: "2025-03-07T09:00:00Z", phase_id: "sprint-run", message: "LD-1 aprovado" },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

const GREENFIELD_FILES: Record<string, string> = {
  "ai-sdk.config.yaml":
    'version: "1"\nkit_version: "99.0.0"\nproject:\n  name: "loja-demo"\n  slug: "loja-demo"\n  mode: greenfield\nstacks:\n  backend: "python-api"\n  frontend: "react-vite"\nhost_adapter: "copilot"\n',
  ".github/artifacts/initiatives.yaml":
    'version: 1\nactive: loja-demo\ninitiatives:\n  - id: loja-demo\n    name: "Loja Demo"\n    status: in-progress\n    mode: greenfield\n    type: feature\n    stream: downstream\n    current_phase: sprint-run\n    created_at: "2025-03-01"\n  - id: catalogo-hotfix\n    name: "Correção do Catálogo"\n    status: planned\n    type: hotfix\n',
  ".github/artifacts/initiatives/loja-demo/delivery-state.yaml":
    'phases:\n  business:\n    status: done\n    agent: "@business"\n    completed_at: "2025-03-05T12:00:00Z"\n    human_checklist:\n      human-ok: true\n  product:\n    status: done\n  sprint-planner:\n    status: done\n  sprint-run:\n    status: in-progress\n',
  ".github/artifacts/initiatives/loja-demo/sprint-backlog.yaml":
    "sprints:\n  - id: S1\n    name: Sprint 1\n    items:\n      - id: LD-1\n        title: Listar produtos\n        status: done\n        story_points: 3\n      - id: LD-2\n        title: Carrinho\n        status: review\n        story_points: 5\n      - id: LD-3\n        title: Checkout\n        status: blocked\n        blocked_reason: aguardando gateway sintético\n",
  ".github/artifacts/operations/devops-status.yaml": 'repos:\n  loja-demo-api:\n    pipeline_health: yellow\n    last_deploy:\n      at: "2025-03-08T10:00:00Z"\n      environment: staging\n      status: success\n',
  ".github/artifacts/operations/incidents.yaml": 'incidents:\n  - id: INC-1\n    title: "Fila atrasada"\n    severity: minor\n    status: active\n    started_at: "2025-03-08T11:00:00Z"\n',
  ".github/artifacts/runs/delivery.jsonl": `${RUNS_GREENFIELD}\n`,
};

// ── montagem ────────────────────────────────────────────────────────────────

async function startStateService(root: string): Promise<void> {
  const server = new StateServiceServer({ root, repository: new YamlStateRepository(), port: 0, eventBus: new EventBus(), token: TOKEN });
  await server.start();
  servers.push(server);
}

interface Opened {
  controller: CockpitNextController;
  panel: FakeWebviewPanel;
  ctx: ReturnType<typeof fake.createExtensionContext>;
  normalize: Normalizer;
}

async function openCockpit(root: string | undefined, opts: { stateService: boolean }): Promise<Opened> {
  if (root && opts.stateService) await startStateService(root);
  fake.setWorkspaceRoot(root);
  const ctx = fake.createExtensionContext("/fake/ext");
  const loader = new ConfigLoader(root ? ([{ uri: { fsPath: root } }] as never) : undefined);
  const controller = new CockpitNextController(ctx as never, { configLoader: loader, repository: new YamlStateRepository(), clock: new SystemClock(), workspaceRoot: new VsCodeWorkspaceRoot(), settings: new VsCodeSettings() });
  await controller.open();
  const panel = fake.panels[0]!;
  const base = makeNormalizer({ roots: root ? [root] : [], since: startedAt });
  // a versão do plugin (package.json) entra no snapshot via kitStatus.current —
  // normalizada para um bump de release (ou a troca de marca, P8) não quebrar o golden
  const current = JSON.stringify(kitVersion());
  const normalize = ((v: unknown) =>
    JSON.parse(base.text(JSON.stringify(v)).replace(/kit-outdated-\d+/g, "kit-outdated-<Date.now>").split(`"current":${current}`).join('"current":"<kitVersion()>"'))) as Normalizer;
  normalize.text = base.text;
  return { controller, panel, ctx, normalize };
}

type Msg = { type: string; seq?: number; payload?: unknown; generatedAt?: string };

/** Sequência compacta das mensagens host→webview (o golden do handshake). */
function sequence(messages: unknown[]): string[] {
  return (messages as Msg[]).map((m) => {
    if (m.type === "shell/snapshot") return `shell/snapshot seq=${m.seq}`;
    if (m.type === "shell/runEvents-append") return `shell/runEvents-append seq=${m.seq} (${(m.payload as unknown[]).length} eventos)`;
    if (m.type === "shell/degraded") return `shell/degraded ${JSON.stringify(m.payload)}`;
    if (m.type === "shell/toast") return `shell/toast ${JSON.stringify(m.payload)}`;
    return JSON.stringify(m);
  });
}

function lastSnapshot(panel: FakeWebviewPanel): Msg {
  return (panel.webview.posted as Msg[]).filter((m) => m.type === "shell/snapshot").at(-1)!;
}

async function deliver(o: Opened, msg: unknown): Promise<unknown> {
  const postedBefore = o.panel.webview.posted.length;
  const logBefore = fake.log.length;
  const netBefore = net.blocked.length;
  const { rejected } = await o.panel.webview.deliver(msg);
  return o.normalize({
    in: msg,
    posted: sequence(o.panel.webview.posted.slice(postedBefore)),
    vscode: fake.log.slice(logBefore).map((c) => ({ [c.api]: c.args })),
    network: net.blocked.slice(netBefore),
    ...(rejected ? { rejected } : {}),
  });
}

// ── testes ──────────────────────────────────────────────────────────────────

describe("CK1 — painel e HTML shell (N1)", () => {
  it("open(): cria o WebviewPanel com opções/ícone pinados e um shell que referencia dist/webview/main.js e assets/index.css", async () => {
    const root = makeWorkspace("ck1-shell");
    const o = await openCockpit(root, { stateService: true });
    expect(fake.calls("window.createWebviewPanel")).toMatchSnapshot();
    expect(o.panel.iconPath).toEqual({ scheme: "file", fsPath: `/fake/ext/${BRAND.assets.icon}`, _raw: undefined });
    expect(o.panel.webview.html.replace(/nonce-[A-Za-z0-9]+|nonce="[A-Za-z0-9]+"/g, "nonce-<nonce>")).toMatchSnapshot();
    expect(o.panel.webview.htmlHistory).toHaveLength(1);
  });

  // L12 / A16e (F6.2): o nonce do shell era sorteado com `Math.random`, como o do Wizard.
  it("REGRESSÃO: o nonce do shell vem de crypto, não de Math.random (L12 / A16e)", () => {
    const random = vi.spyOn(Math, "random");
    const controller = new CockpitNextController(fake.createExtensionContext("/fake/ext") as never, { configLoader: new ConfigLoader(undefined), repository: new YamlStateRepository(), clock: new SystemClock(), workspaceRoot: new VsCodeWorkspaceRoot(), settings: new VsCodeSettings() }) as unknown as {
      _buildShellHtml(webview: unknown): string;
    };
    const webview = { cspSource: "vscode-resource:", asWebviewUri: (uri: unknown) => uri };
    try {
      const html = controller._buildShellHtml(webview);
      expect(random).not.toHaveBeenCalled();
      const nonces = [...html.matchAll(/nonce(?:-|=")([A-Za-z0-9]+)/g)].map((m) => m[1]);
      expect(nonces).toHaveLength(2);
      expect(new Set(nonces).size).toBe(1);
      expect(nonces[0]).toMatch(/^[A-Za-z0-9]{32}$/);
      expect(controller._buildShellHtml(webview)).not.toBe(html);
    } finally {
      random.mockRestore();
    }
  });

  it("open() com o painel já aberto: reveal(ViewColumn.One) + novo snapshot forçado, sem recriar o HTML", async () => {
    const root = makeWorkspace("ck1-reopen");
    const o = await openCockpit(root, { stateService: true });
    const before = o.panel.webview.posted.length;
    await o.controller.open();
    expect(fake.panels).toHaveLength(1);
    expect(o.panel.reveals).toEqual([1]);
    expect(o.panel.webview.htmlHistory).toHaveLength(1);
    expect(sequence(o.panel.webview.posted.slice(before))).toEqual(["shell/snapshot seq=1"]);
  });
});

describe("CK1 — golden do CockpitSnapshot + handshake (N2/N3)", () => {
  const FIXTURES: Array<[string, Record<string, string>]> = [
    ["workspace vazio", {}],
    ["brownfield em Foundation", BROWNFIELD_FILES],
    ["greenfield com sprint", GREENFIELD_FILES],
  ];

  it.each(FIXTURES)("%s — snapshot completo (State Service no ar)", async (name, files) => {
    const root = makeWorkspace(`ck1-${name.replace(/\W+/g, "-")}`, files);
    const o = await openCockpit(root, { stateService: true });
    expect(o.normalize(lastSnapshot(o.panel).payload)).toMatchSnapshot();
  });

  it.each(FIXTURES)("%s — sequência de mensagens: open() e depois o handshake shell/ready", async (name, files) => {
    const root = makeWorkspace(`ck1-seq-${name.replace(/\W+/g, "-")}`, files);
    const o = await openCockpit(root, { stateService: true });
    const onOpen = o.normalize(sequence(o.panel.webview.posted));
    const onReady = await deliver(o, { type: "shell/ready" });
    const onRequest = await deliver(o, { type: "shell/requestSnapshot" });
    expect({ onOpen, onReady, onRequest }).toMatchSnapshot();
  });

  it("generatedAt é ISO do relógio e seq cresce por mensagem (snapshot e runEvents-append compartilham o contador)", async () => {
    const root = makeWorkspace("ck1-seq-counter", GREENFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    await o.panel.webview.deliver({ type: "shell/ready" });
    const seqs = (o.panel.webview.posted as Msg[]).filter((m) => m.seq !== undefined).map((m) => `${m.type}#${m.seq}`);
    expect(seqs).toEqual(["shell/snapshot#0", "shell/runEvents-append#1", "shell/snapshot#2", "shell/runEvents-append#3"]);
    expect(Date.parse(lastSnapshot(o.panel).generatedAt!)).toBeGreaterThanOrEqual(startedAt.getTime() - 1000);
  });

  // A12 / H-BUG-18, corrigido na F3.8 (ADR-0017): iniciativas e delivery-state
  // só vinham do State Service por HTTP para o próprio processo; sem
  // `server.json` o Cockpit mostrava "nenhuma iniciativa" com o YAML no disco.
  // Agora lê no próprio processo (StateCommands e repositório), com fallback
  // para o loader do YAML, e assina o EventBus direto, sem SSE.
  it("REGRESSÃO: sem State Service, initiatives/deliveryState vêm do YAML do workspace, sem aviso de State Service (A12 / H-BUG-18)", async () => {
    const root = makeWorkspace("ck1-a12", GREENFIELD_FILES);
    const o = await openCockpit(root, { stateService: false });
    const snap = lastSnapshot(o.panel).payload as { initiatives: { active: string } | null; deliveryState: { phases: Record<string, unknown> } | null; sprintBacklog: unknown; warnings: Array<{ source: string }> };
    expect(snap.initiatives?.active).toBe("loja-demo");
    expect(Object.keys(snap.deliveryState?.phases ?? {})).toContain("sprint-run");
    expect(snap.sprintBacklog).not.toBeNull();
    expect(snap.warnings.map((w) => w.source).filter((s) => s.startsWith("state-service"))).toEqual([]);
  });

  it("REGRESSÃO: com e sem State Service o snapshot é o mesmo (a leitura não depende do servidor) (A12 / H-BUG-18)", async () => {
    const withServer = await openCockpit(makeWorkspace("ck1-a12-com", GREENFIELD_FILES), { stateService: true });
    const a = withServer.normalize(lastSnapshot(withServer.panel).payload);
    for (const panel of fake.panels) panel.dispose();
    fake.reset();
    const without = await openCockpit(makeWorkspace("ck1-a12-sem", GREENFIELD_FILES), { stateService: false });
    expect(without.normalize(lastSnapshot(without.panel).payload)).toEqual(a);
  });

  it("REGRESSÃO: o host do Cockpit não fala HTTP com o próprio processo (sem cliente de leitura nem SSE do State Service) (A12 / ADR-0017)", () => {
    const sources = ["src/views/CockpitNextController.ts", ...fs.readdirSync(path.join(__dirname, "../../src/views/cockpit")).map((f) => `src/views/cockpit/${f}`)];
    for (const rel of sources) {
      const text = fs.readFileSync(path.join(__dirname, "../..", rel), "utf-8");
      expect(text, rel).not.toMatch(/state-service-read-client|StateServiceSseClient|state-service-discovery/);
    }
  });

  // G9 / H-GAP-12 (F4.2): sem pasta aberta o painel nasce, ainda não há snapshot para mandar, mas o webview
  // não fica no "conectando…" eterno: o host avisa que não há pasta (`shell/degraded`, fonte `workspace`) e a
  // tela oferece a ação certa. O aviso vai uma vez por handshake, não a cada tique de 4 s.
  it("REGRESSÃO: sem workspace aberto o painel avisa que não há pasta, uma vez por handshake, em vez de ficar mudo (G9 / H-GAP-12)", async () => {
    const o = await openCockpit(undefined, { stateService: false });
    expect(o.panel.webview.htmlHistory).toHaveLength(1);
    // O `open()` já avisou, mas o webview ainda não tinha carregado para ouvir: quem conta é o handshake.
    const opened = o.panel.webview.posted.length;
    await o.panel.webview.deliver({ type: "shell/ready" });
    const afterReady = o.panel.webview.posted.slice(opened);
    expect(afterReady).toHaveLength(1);
    expect(afterReady[0]).toMatchObject({ type: "shell/degraded", payload: { source: "workspace" } });
    // Nenhum snapshot sai sem pasta, e um pedido a mais no mesmo handshake não repete o aviso...
    await o.panel.webview.deliver({ type: "refresh" });
    expect(o.panel.webview.posted).toHaveLength(opened + 1);
    expect(o.panel.webview.posted.every((m) => (m as { type: string }).type === "shell/degraded")).toBe(true);
    // ...mas um novo handshake (o painel recarregou) avisa de novo.
    await o.panel.webview.deliver({ type: "shell/ready" });
    expect(o.panel.webview.posted).toHaveLength(opened + 2);
  });
});

describe("CK1 — despacho pelo registry de ações (N2) — efeitos observáveis", () => {
  it("tabela message-in → effect-out (handlers sem escrita em disco)", async () => {
    const root = makeWorkspace("ck1-dispatch", { ...GREENFIELD_FILES, "docs/leia-me.md": "# sintético\n" });
    const o = await openCockpit(root, { stateService: true });
    // comandos que `extension.ts` registra em produção (o controller sozinho não os registra)
    fake.responders[`command:${BRAND.commandPrefix}.migrateKit`] = () => undefined;
    fake.responders[`command:${BRAND.commandPrefix}.initializeDeliveryKit`] = () => undefined;
    await o.panel.webview.deliver({ type: "shell/ready" });
    const rows = [];
    for (const msg of [
      { type: "refresh" },
      { type: "tipo-desconhecido" },
      { type: "runCommand", command: `${BRAND.commandPrefix}.migrateKit` },
      { type: "runCommand", command: "workbench.action.reloadWindow" },
      { type: "openFile", relPath: "docs/leia-me.md" },
      { type: "openFile", relPath: "docs/nao-existe.md" },
      { type: "openPortal" },
      { type: "openChat" },
      { type: "injectRaw", prompt: `@${BRAND.participant.name} status sintético` },
      { type: "injectPrompt", promptId: "business" },
      { type: "newInitiative" },
      { type: "openWizard" },
    ]) {
      rows.push(await deliver(o, msg));
    }
    expect(rows).toMatchSnapshot();
  });

  // L12 / A16b (F6.2): `relPath` vem do webview. Com `path.join(root, relPath)`
  // sem contenção, `../` e symlink abriam arquivo FORA do workspace.
  it.each([
    ["'../' relativo", (_base: string) => "../fora.txt"],
    ["caminho absoluto", (base: string) => path.join(base, "fora.txt")],
    ["symlink para fora", (_base: string) => "atalho/segredo.txt"],
  ])("REGRESSÃO: openFile não abre arquivo fora do workspace (%s, path traversal, L12 / A16b)", async (_caso, relPathFor) => {
    const base = makeWorkspace("ck1-traversal", { "fora.txt": "fora do workspace\n", "fora-dir/segredo.txt": "segredo sintético\n", "ws/docs/a.md": "# a\n" });
    const root = path.join(base, "ws");
    // "junction" no Windows dispensa privilégio de admin; fora dele o tipo é ignorado
    fs.symlinkSync(path.join(base, "fora-dir"), path.join(root, "atalho"), "junction");
    const o = await openCockpit(root, { stateService: false });
    const before = fake.calls("window.showTextDocument").length;
    const row = (await deliver(o, { type: "openFile", relPath: relPathFor(base) })) as { rejected?: string };
    expect(row.rejected).toBeUndefined();
    expect(fake.calls("window.showTextDocument").slice(before)).toEqual([]);
    // dentro do workspace continua abrindo
    await deliver(o, { type: "openFile", relPath: "docs/a.md" });
    expect(fake.calls("window.showTextDocument").slice(before)).toHaveLength(1);
  });

  // L2, corrigido na F6.4: o handler executava `helyx.importExistingRepo`, que
  // não existe; no VS Code real o `executeCommand` rejeitava e a rejeição
  // escapava do controller. Importar um projeto existente é o caminho
  // "Projeto Existente" do Wizard, aberto por `helyx.initializeDeliveryKit`.
  it("REGRESSÃO: openImportWizard abre o Wizard (helyx.initializeDeliveryKit), um comando registrado, sem rejeição (L2)", async () => {
    const root = makeWorkspace("ck1-l2");
    const o = await openCockpit(root, { stateService: true });
    // comando que `extension.ts` registra em produção (o controller sozinho não o registra)
    fake.responders[`command:${BRAND.commandPrefix}.initializeDeliveryKit`] = () => undefined;
    const row = (await deliver(o, { type: "openImportWizard" })) as { rejected?: string; vscode: unknown[] };
    expect(row.rejected).toBeUndefined();
    expect(row.vscode).toEqual([{ "commands.executeCommand": [`${BRAND.commandPrefix}.initializeDeliveryKit`] }]);
  });

  it("notifications/markSeen grava globalState e o snapshot seguinte carrega notificationsLastSeenAt", async () => {
    const root = makeWorkspace("ck1-markseen", GREENFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    const row = await deliver(o, { type: "notifications/markSeen" });
    expect(row).toMatchSnapshot();
    expect((lastSnapshot(o.panel).payload as { notificationsLastSeenAt: string }).notificationsLastSeenAt).toBe(o.ctx._globalStore.get(`${BRAND.name}.notifications.lastSeenAt`));
  });

  it("switchInitiative reescreve `active:` in-place (sem aspas) e o próximo snapshot já traz a nova ativa", async () => {
    const root = makeWorkspace("ck1-switch", GREENFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    const row = await deliver(o, { type: "switchInitiative", id: "catalogo-hotfix" });
    expect(row).toMatchSnapshot();
    expect(fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8")).toMatch(/^active: catalogo-hotfix$/m);
    expect((lastSnapshot(o.panel).payload as { initiatives: { active: string } }).initiatives.active).toBe("catalogo-hotfix");
  });
});

describe("CK1 — eventos de run → append, toasts e notificação nativa (N4 / CK3)", () => {
  const appendEvents = (root: string, extra: object[]): void =>
    writeFiles(root, { ".github/artifacts/runs/foundation.jsonl": `${RUNS_BROWNFIELD}\n${extra.map((e) => JSON.stringify(e)).join("\n")}\n` });

  it("boot não gera toast; eventos NOVOS (timestamp após o cursor) geram append só do delta + toasts + notificação nativa (review e blocked)", async () => {
    const root = makeWorkspace("ck1-events", BROWNFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    const boot = o.normalize(sequence(o.panel.webview.posted));
    fake.responders["window.showWarningMessage"] = () => "Ver no Cockpit";
    appendEvents(root, [
      { run_id: "r2", event_type: "agent-done", timestamp: "2025-02-04T11:00:00Z", phase_id: "arch", agent_id: "@arch-discoverer", repo_id: "pedidos-api" },
      { run_id: "r4", event_type: "blocked", timestamp: "2025-02-04T11:05:00Z", phase_id: "domain", agent_id: "@domain-extractor", message: "contexto ambíguo" },
    ]);
    const afterEvents = await deliver(o, { type: "refresh" });
    await new Promise((r) => setImmediate(r)); // deixa o `.then` do "Ver no Cockpit" rodar
    const reconnect = await deliver(o, { type: "shell/ready" });
    expect({ boot, afterEvents, reconnect, reveals: o.panel.reveals }).toMatchSnapshot();
  });

  // M4 (gaps-and-bugs.md, destino F5.2). Era a armadilha pinada na F0.4:
  // `loadRunEvents` ordena por timestamp e o cursor era só o último evento,
  // então um evento que chega DEPOIS mas com timestamp ANTERIOR ao cursor
  // (relógio de outro processo, append tardio) nunca era "fresh": sem append,
  // sem toast, sem notificação nativa, até o próximo shell/ready. O mapa
  // (F5.3) precisa de todo evento novo em até 1 s.
  it("REGRESSÃO: evento novo com timestamp anterior ao último entregue chega no incremental, com toast e notificação nativa (M4)", async () => {
    const root = makeWorkspace("ck1-events-late", BROWNFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    appendEvents(root, [{ run_id: "r4", event_type: "blocked", timestamp: "2025-02-02T11:05:00Z", phase_id: "domain", message: "chegou atrasado" }]);
    const afterEvents = (await deliver(o, { type: "refresh" })) as { posted: string[]; vscode: unknown[] };
    const incremental = afterEvents.posted.filter((p) => !p.startsWith("shell/snapshot"));
    expect(incremental).toHaveLength(2);
    expect(incremental[0]).toMatch(/^shell\/runEvents-append seq=\d+ \(1 eventos\)$/);
    expect(incremental[1]).toContain('"id":"2025-02-02T11:05:00Z-blocked--domain"');
    expect(fake.calls("window.showWarningMessage")).toHaveLength(1);
    // o evento não volta duplicado no refresh seguinte
    const again = (await deliver(o, { type: "refresh" })) as { posted: string[] };
    expect(again.posted.filter((p) => p.startsWith("shell/runEvents-append"))).toEqual([]);
    const reconnect = (await deliver(o, { type: "shell/ready" })) as { posted: string[] };
    expect(reconnect.posted.filter((p) => p.startsWith("shell/runEvents-append"))).toEqual([expect.stringMatching(/\(5 eventos\)$/)]);
  });

  // F5.2 (protocolo do Cockpit, aditivo): o mapa (F5.3) deriva tudo de shell/snapshot e
  // shell/runEvents-append. Os campos novos do contrato agent-activity chegam nos dois, e só eles.
  it("F5.2: snapshot e runEvents-append levam os campos do contrato agent-activity, e só a lista fechada", async () => {
    const root = makeWorkspace("ck1-agent-activity", BROWNFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    const event = {
      run_id: "r5", event_type: "decision-requested", timestamp: "2025-02-05T09:00:00Z", initiative_id: "pedidos-mod", task_id: "wave-1/item-1",
      phase_id: "execution", agent_id: "@migration-agent", repo_id: "pedidos-api", artifact_path: ".github/artifacts/execution/x.md",
      actor: "human", harness: "claude-code", message: "titularidade", metadata: { reason: "titularidade" },
    };
    appendEvents(root, [{ ...event, content: "segredo do arquivo", prompt: "texto do prompt" }]);
    await o.panel.webview.deliver({ type: "refresh" });
    const posted = o.panel.webview.posted as Msg[];
    const appended = posted.filter((m) => m.type === "shell/runEvents-append").at(-1)!.payload as Array<Record<string, unknown>>;
    const inSnapshot = (lastSnapshot(o.panel).payload as { runEvents: Array<Record<string, unknown>> }).runEvents;
    for (const delivered of [appended.at(-1)!, inSnapshot.at(-1)!]) {
      expect(delivered).toEqual(event);
      expect(Object.keys(delivered).sort()).toEqual(
        ["actor", "agent_id", "artifact_path", "event_type", "harness", "initiative_id", "message", "metadata", "phase_id", "repo_id", "run_id", "task_id", "timestamp"]
      );
    }
  });

  it("kit desatualizado: toast 'kit-outdated' só na transição false→true (edge-triggered), nunca de novo no mesmo painel", async () => {
    const root = makeWorkspace("ck1-kit", BROWNFIELD_FILES);
    const o = await openCockpit(root, { stateService: true });
    await o.panel.webview.deliver({ type: "shell/ready" });
    await o.panel.webview.deliver({ type: "refresh" });
    const toasts = (o.panel.webview.posted as Msg[]).filter((m) => m.type === "shell/toast").map((m) => (m.payload as { kind: string }).kind);
    expect(toasts).toEqual(["kit-outdated"]);
  });
});
