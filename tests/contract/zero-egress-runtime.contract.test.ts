import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
vi.mock("vscode", () => import("../characterization/helpers/fake-vscode"));
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { fake, type FakeExtensionContext, type FakeWebviewPanel } from "../characterization/helpers/fake-vscode";
import { cleanupWorkspaces, makeTempDir, makeWorkspace } from "../characterization/helpers/workspace-fixture";
import { activate, deactivate } from "../../src/extension";
import { installEgressGuard, type EgressGuard } from "./helpers/egress-guard";
import { BRAND } from "../../src/data/brand.pure";

/**
 * Zero egress em runtime — F2.1, ADR-0015 ("Um teste de CI garante zero
 * egress de rede por padrão").
 *
 * `activate()` roda de verdade contra o fake do `vscode`, com a configuração
 * padrão, num workspace Helyx sintético. Depois o teste percorre os fluxos
 * principais: Cockpit (handshake e snapshot pelo State Service), ação de fase
 * no Cockpit (onde ficava a telemetria), preview do Wizard (onde ficava o
 * registry) e geração greenfield. O `egress-guard` corta no socket: só passa
 * conexão para loopback. A asserção é dupla: nenhuma tentativa para fora, e
 * pelo menos uma conexão local (prova de que o guard estava vendo o tráfego).
 */

const CONFIG = 'version: "1"\nkit_version: "99.0.0"\nproject:\n  name: "projeto-ficticio"\n  slug: "projeto-ficticio"\nhost_adapter: "claude"\n';
const DELIVERY_STATE = "initiative_id: default\nphases:\n  business:\n    status: in-progress\n";

let guard: EgressGuard;
let ctx: FakeExtensionContext | undefined;
let uxTimers: Array<{ delay: number; fn: () => void }> = [];
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  fake.reset();
  uxTimers = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 800 || delay === 1200) {
      uxTimers.push({ delay, fn });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return (realSetTimeout as unknown as (...a: unknown[]) => ReturnType<typeof setTimeout>)(fn, delay, ...args);
  }) as typeof setTimeout);
  guard = installEgressGuard();
});

afterEach(async () => {
  for (const d of ctx?.subscriptions ?? []) d.dispose();
  for (const p of fake.panels) p.dispose();
  deactivate();
  ctx = undefined;
  await new Promise((r) => realSetTimeout(r, 20));
  guard.restore();
  vi.restoreAllMocks();
});

afterAll(() => cleanupWorkspaces());

function lastPanel(viewType: string): FakeWebviewPanel {
  const panel = [...fake.panels].reverse().find((p) => p.viewType === viewType);
  if (!panel) throw new Error(`painel ${viewType} não abriu`);
  return panel;
}

function posted(panel: FakeWebviewPanel, type: string): unknown[] {
  return panel.webview.posted.filter((m) => (m as { type?: string }).type === type);
}

describe("zero egress em runtime — configuração padrão", () => {
  it("ativação + Cockpit + ação de fase + preview do Wizard + geração greenfield: nenhuma conexão sai da máquina", async () => {
    const root = makeWorkspace("zero-egress", {
      [BRAND.files.config]: CONFIG,
      ".github/artifacts/delivery-state.yaml": DELIVERY_STATE,
    });
    fake.setWorkspaceRoot(root);
    ctx = fake.createExtensionContext("/fake/ext");
    activate(ctx as never);
    const serverJson = path.join(root, ".github/artifacts/.state-service/server.json");
    await vi.waitFor(() => expect(fs.existsSync(serverJson)).toBe(true), { timeout: 3000, interval: 10 });

    // Cockpit: handshake e snapshot lidos no próprio processo (A12 / ADR-0017, sem loopback)
    await fake.commands.get(`${BRAND.commandPrefix}.openCockpitNext`)!();
    const cockpit = lastPanel(`${BRAND.name}CockpitNext`);
    await cockpit.webview.deliver({ type: "shell/ready" });
    await vi.waitFor(() => expect(posted(cockpit, "shell/snapshot").length).toBeGreaterThan(0), { timeout: 5000, interval: 20 });

    // Ação de fase no Cockpit (antes: POST de telemetria para api.helyx.build)
    await cockpit.webview.deliver({ type: "markPhaseDone", phaseId: "business" });
    expect(fs.readFileSync(path.join(root, ".github/artifacts/delivery-state.yaml"), "utf-8")).toMatch(/business:\n\s+status: done/);

    // Preview do Wizard (antes: GET no registry de templates)
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    const wizard = lastPanel(`${BRAND.name}Wizard`);
    await wizard.webview.deliver({ type: "fetchTemplate", templateId: `${BRAND.templatePrefix}python-api` });
    expect(posted(wizard, "templateManifest")).toMatchObject([{ source: "local" }]);

    // Geração greenfield (antes: download do zip no registry e cache em ~/.helyx)
    const target = path.join(makeTempDir("zero-egress-gen"), "projeto-gerado");
    await fake.commands.get(`${BRAND.commandPrefix}._generateStructure`)!({ projectName: "projeto-gerado", hostAdapter: "claude", backendStack: "python-api", targetDirectory: target });
    expect(fs.existsSync(path.join(target, "CLAUDE.md"))).toBe(true);

    expect(guard.attempts).toEqual([]);
    // Controle de que a guarda enxerga conexão local (então "nenhuma tentativa"
    // não é falso negativo). Desde a A12 o Cockpit não faz loopback; a conexão
    // local vem de um GET /health explícito no State Service desta ativação.
    const { port } = JSON.parse(fs.readFileSync(serverJson, "utf-8")) as { port: number };
    const before = guard.localConnects;
    await fetch(`http://127.0.0.1:${port}/health`);
    expect(guard.localConnects).toBeGreaterThan(before);
  }, 30_000);

  it("controle positivo: o guard pega fetch e http para fora da máquina (e não deixa sair)", async () => {
    await expect(fetch("http://192.0.2.1/sonda")).rejects.toThrow();
    await new Promise<void>((resolve) => {
      const req = http.get("http://192.0.2.1/sonda", () => resolve());
      req.on("error", () => resolve());
    });
    expect(guard.attempts.map((a) => a.target)).toEqual(["192.0.2.1:80", "192.0.2.1:80"]);
  });
});
