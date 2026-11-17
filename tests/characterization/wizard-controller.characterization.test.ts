import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./helpers/fake-vscode"));
import * as fs from "fs";
import * as path from "path";
import { fake, type FakeWebviewPanel } from "./helpers/fake-vscode";
import { WizardController } from "../../src/wizard/WizardController";
import { getWizardSchema, getBrownfieldSchema } from "../../src/wizard/wizard-schema";
import type { ResolvedTemplateManifest, TemplateSource } from "../../src/adapters/templates/TemplateSource";
import type { TemplateManifest, WizardStep } from "../../src/types";
import { installNetGuard, type NetGuard } from "./helpers/net-guard";
import { cleanupWorkspaces, makeNormalizer, makeTempDir, makeWorkspace } from "./helpers/workspace-fixture";
import { readBoot } from "./helpers/wizard-boot";
import { goldenBrandSnapshotSerializer } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * W0 — caracterização do Wizard (host + script). F0.4 (lane B),
 * arquitetura-e-refatoracao.md §2.2 (WZ2) e §3.4 (degrau W0: "teste do host
 * com FakeWebviewPanel cobrindo as 6 mensagens e todos os ramos de §3.2").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Parte A — HOST (`WizardController`): tabela message-in → effect-out com um
 * `FakeWebviewPanel` (captura `postMessage`/re-render/dispose) e o
 * `commands.executeCommand` do fake no lugar do barramento interno
 * (`helyx._generateStructure`/`_installAgentStructure`). Rede travada
 * (`net-guard`). Sem `TemplateSource` plugada vale a `NullTemplateSource` da
 * edição aberta (F2.1); os ramos cache/registry do preview usam uma fonte
 * falsa injetada.
 *
 * Parte B — SCRIPT (até o W5 da F3.10): o script do Wizard legado rodava no
 * `fake-dom`, passo a passo, com um frame por passo no snapshot. Foi a rede
 * dos degraus W1→W5. No W4, a paridade de protocolo passou a dirigir o
 * script legado e o app React com os mesmos roteiros
 * (`webview-ui/tests/wizard-parity.test.tsx`, observações do legado no
 * snapshot de lá). No W6 o legado saiu, a Parte B saiu com ele, e o app React
 * segue conferido contra aquele snapshot.
 *
 * Bugs pinados (não corrigidos): L5/H-BUG-51 (`goNext()`), L6 (flash do
 * brownfield), A14/H-BUG-20, H-BUG-25, H-BUG-52, L12. C4/H-BUG-07 foi
 * corrigido na F6.1 (testes `REGRESSÃO:` do submit brownfield).
 */

type ControllerInternals = { _renderHtml(schema: unknown, webview: unknown): string; _session: { handle(msg: unknown): Promise<void> } };

const startedAt = new Date();
let net: NetGuard;

/**
 * Os comandos internos são registrados por `extension.ts` (fora deste teste).
 * Sem stub, o fake se comporta como o VS Code real: id não registrado
 * rejeita com "command '<id>' not found". Aqui eles simulam o sucesso do
 * gerador; cada teste de falha sobrescreve com um `throw`.
 */
function stubInternalBus(f: typeof fake): void {
  f.responders[`command:${BRAND.commandPrefix}._generateStructure`] = () => undefined;
  f.responders[`command:${BRAND.commandPrefix}._installAgentStructure`] = () => undefined;
}

beforeEach(() => {
  fake.reset();
  stubInternalBus(fake);
  net = installNetGuard();
});

afterEach(() => {
  net.restore();
  vi.restoreAllMocks();
});

afterAll(() => cleanupWorkspaces());

/** `TemplateSource` falsa que sempre devolve o mesmo manifesto (os ramos cache/registry do preview). */
function fixedTemplateSource(resolved: ResolvedTemplateManifest): TemplateSource {
  return { getManifest: () => Promise.resolve(resolved), getZip: () => Promise.resolve(null) };
}

async function openWizard(templateSource?: TemplateSource): Promise<{ controller: WizardController; panel: FakeWebviewPanel }> {
  const controller = new WizardController(fake.createExtensionContext("/fake/ext") as never, {} as never, templateSource);
  await controller.start();
  return { controller, panel: fake.panels[fake.panels.length - 1]! };
}

/** Entrega `msg` e devolve tudo que o host fez em resposta (postMessage, re-render, comandos, diálogos, dispose). */
async function send(panel: FakeWebviewPanel, msg: unknown, roots: string[] = []): Promise<unknown> {
  const postedBefore = panel.webview.posted.length;
  const rendersBefore = panel.webview.htmlHistory.length;
  const logBefore = fake.log.length;
  const disposedBefore = panel.disposed;
  const blockedBefore = net.blocked.length;
  const { rejected } = await panel.webview.deliver(msg);
  const normalize = makeNormalizer({ roots, since: startedAt });
  const rerenders = panel.webview.htmlHistory.slice(rendersBefore).map((html) => {
    // Desde o W2 da F3.10 o bootstrap é o bloco JSON #hx-boot (mesmos valores dos globals de antes).
    const boot = readBoot(html);
    const schema = boot.schema as WizardStep[];
    return `re-render: brownfield=${boot.brownfield} passos=[${schema.map((s) => s.key).join(",")}] estado=${JSON.stringify(boot.state)}`;
  });
  return normalize({
    in: msg,
    posted: panel.webview.posted.slice(postedBefore),
    rerenders,
    vscode: fake.log.slice(logBefore).map((c) => ({ [c.api]: c.args })),
    network: net.blocked.slice(blockedBefore),
    disposed: !disposedBefore && panel.disposed,
    ...(rejected ? { rejected } : {}),
  });
}

const GREENFIELD_VALID = {
  projectName: "loja-demo",
  startupIdea: "Uma vitrine sintética para o teste de caracterização.",
  domain: "ecommerce",
  hostAdapter: "claude",
  backendStack: "python-api",
  backendArchitecture: "hexagonal",
  frontendStack: "react-vite",
  frontendArchitecture: "feature-based",
  database: "postgresql",
  cloud: "aws",
  cicd: "github-actions",
} as const;

// ════════════════════════════════════════════════════════════════════════
// Parte A — host
// ════════════════════════════════════════════════════════════════════════

describe("W0 host — ciclo de vida do painel (W1)", () => {
  it("start(): cria UM WebviewPanel com as opções pinadas e renderiza o schema greenfield", async () => {
    const { panel } = await openWizard();
    expect(fake.calls("window.createWebviewPanel")).toMatchSnapshot();
    const boot = readBoot(panel.webview.html);
    expect(boot.brownfield).toBe(false);
    expect(boot.state).toEqual({});
    expect((boot.schema as WizardStep[]).map((s) => s.key)).toEqual((await getWizardSchema()).map((s) => s.key));
    expect(panel.webview.receiverCount).toBe(1);
  });

  it("start() de novo com o painel aberto só faz reveal(); depois do dispose, cria outro painel", async () => {
    const { controller, panel } = await openWizard();
    await controller.start();
    expect(fake.panels).toHaveLength(1);
    expect(panel.reveals).toEqual([undefined]);
    panel.dispose();
    await controller.start();
    expect(fake.panels).toHaveLength(2);
  });

  // Corrigido na F6.2 (L12 / A16e): o nonce era sorteado com `Math.random`
  // (não criptográfico). Agora vem de `crypto.randomBytes`, com o mesmo
  // formato (32 chars alfanuméricos), o mesmo na CSP e no <script>. Desde o
  // W6 da F3.10 o HTML só tem o <script> do bundle (antes, também o <style>
  // inline do legado): são 2 ocorrências, não 4.
  it("REGRESSÃO: o nonce da CSP vem de crypto, não de Math.random, e muda a cada render (L12 / A16e)", async () => {
    const { panel } = await openWizard();
    const random = vi.spyOn(Math, "random");
    const controller = new WizardController(fake.createExtensionContext() as never, {} as never) as unknown as ControllerInternals;
    const html = controller._renderHtml([], panel.webview);
    expect(random).not.toHaveBeenCalled();
    const nonces = [...html.matchAll(/nonce(?:-|=")([A-Za-z0-9]+)/g)].map((m) => m[1]);
    expect(nonces).toHaveLength(2);
    expect(new Set(nonces).size).toBe(1);
    expect(nonces[0]).toMatch(/^[A-Za-z0-9]{32}$/);
    const again = [...controller._renderHtml([], panel.webview).matchAll(/nonce(?:-|=")([A-Za-z0-9]+)/g)].map((m) => m[1]);
    expect(again[0]).not.toBe(nonces[0]);
  });
});

describe("W0 host — tabela message-in → effect-out (§3.2)", () => {
  it("stepUpdate / cancel / importRepo / tipo desconhecido", async () => {
    const { panel } = await openWizard();
    const rows = [
      await send(panel, { type: "stepUpdate", payload: { projectName: "loja-demo" } }),
      await send(panel, { type: "importRepo" }),
      await send(panel, { type: "tipo-que-nao-existe" }),
      await send(panel, { type: "cancel" }),
    ];
    expect(rows).toMatchSnapshot();
  });

  it("pickFolder: diálogo com pasta escolhida → folderPicked; diálogo cancelado → nada", async () => {
    const { panel } = await openWizard();
    fake.responders["window.showOpenDialog"] = () => [{ fsPath: "/sintetico/workspaces/loja-demo" }];
    const picked = await send(panel, { type: "pickFolder" });
    fake.responders["window.showOpenDialog"] = () => undefined;
    const cancelled = await send(panel, { type: "pickFolder" });
    expect([picked, cancelled]).toMatchSnapshot();
  });

  it("fetchTemplate: ramo cache → source 'cache'", async () => {
    const cached: TemplateManifest = {
      id: `${BRAND.templatePrefix}python-api`,
      name: "cacheado",
      stack: "python-api",
      version: "9.9.9",
      description: "manifest sintético em cache",
      tags: [],
      rubricsAvailable: false,
      generatedTree: ["a/"],
    };
    const { panel } = await openWizard(fixedTemplateSource({ manifest: cached, source: "cache" }));
    expect(await send(panel, { type: "fetchTemplate", templateId: `${BRAND.templatePrefix}python-api` })).toMatchSnapshot();
  });

  // F2.1 (ADR-0015): o registry saiu da edição aberta, e com ele o L10 (fallback
  // de URL em código). O badge 'registry' continua no protocolo para uma
  // `TemplateSource` plugada; o host não abre rede nenhuma.
  it("fetchTemplate: TemplateSource plugada com source 'registry' → repassa manifest e badge, sem rede no host", async () => {
    const fromRegistry: TemplateManifest = {
      id: `${BRAND.templatePrefix}java-spring`,
      name: "Spring sintético",
      stack: "java-spring",
      version: "1.2.3",
      description: "d",
      tags: ["x"],
      rubricsAvailable: false,
      generatedTree: [],
    };
    const { panel } = await openWizard(fixedTemplateSource({ manifest: fromRegistry, source: "registry" }));
    expect(await send(panel, { type: "fetchTemplate", templateId: `${BRAND.templatePrefix}java-spring` })).toMatchSnapshot();
  });

  // F2.1 (ADR-0015): sem `TemplateSource` plugada, o host não chama rede
  // nenhuma para o preview (antes: GET no registry, que caía offline).
  it("fetchTemplate sem TemplateSource plugada (NullTemplateSource, padrão da edição aberta) → manifest LOCAL montado a partir do estado, sem rede (W3)", async () => {
    const { panel } = await openWizard();
    for (const [key, value] of Object.entries(GREENFIELD_VALID)) await send(panel, { type: "stepUpdate", payload: { [key]: value } });
    const row = await send(panel, { type: "fetchTemplate", templateId: `${BRAND.templatePrefix}python-api` });
    expect((row as { network: unknown[] }).network).toEqual([]);
    expect(row).toMatchSnapshot();
  });

  it("fetchTemplate offline com estado vazio → manifest local com os defaults (python-api, copilot, meu-projeto)", async () => {
    const { panel } = await openWizard();
    const row = (await send(panel, { type: "fetchTemplate", templateId: `${BRAND.templatePrefix}python-api` })) as { posted: Array<{ manifest: unknown }> };
    expect(row.posted[0]!.manifest).toMatchSnapshot();
  });

  it("submit greenfield com estado vazio → validationError com os fieldErrors do zod; nenhum comando", async () => {
    const { panel } = await openWizard();
    expect(await send(panel, { type: "submit" })).toMatchSnapshot();
  });

  // Behavior pinned on 2026-11-14 — A14 / H-BUG-20: o `projectName` inválido
  // atravessa o `stepUpdate` sem validação e só é recusado no submit (passo 14).
  it("@known-bug: projectName inválido ('Loja Demo') só é recusado no submit, com 'Invalid' (A14 / H-BUG-20)", async () => {
    const { panel } = await openWizard();
    for (const [key, value] of Object.entries({ ...GREENFIELD_VALID, projectName: "Loja Demo" })) {
      expect(await send(panel, { type: "stepUpdate", payload: { [key]: value } })).toMatchObject({ posted: [], vscode: [] });
    }
    expect(await send(panel, { type: "submit" })).toMatchSnapshot();
  });

  it("submit greenfield válido → executeCommand('helyx._generateStructure', estado com defaults do zod) → dispose", async () => {
    fake.setWorkspaceRoot("/sintetico/aberta"); // F4.3: sem pasta aberta e sem lugar escolhido o projeto não é criado
    const { panel } = await openWizard();
    for (const [key, value] of Object.entries(GREENFIELD_VALID)) await send(panel, { type: "stepUpdate", payload: { [key]: value } });
    expect(await send(panel, { type: "submit" })).toMatchSnapshot();
  });

  it("submit greenfield com o gerador lançando → generationError com a mensagem; painel continua aberto", async () => {
    fake.setWorkspaceRoot("/sintetico/aberta");
    const { panel } = await openWizard();
    fake.responders[`command:${BRAND.commandPrefix}._generateStructure`] = () => {
      throw new Error("falha sintética do gerador");
    };
    for (const [key, value] of Object.entries(GREENFIELD_VALID)) await send(panel, { type: "stepUpdate", payload: { [key]: value } });
    expect(await send(panel, { type: "submit" })).toMatchSnapshot();
  });

  // F4.3, decisão do titular (2026-11-15): sem pasta aberta, a Jataí pede onde criar; nunca nasce em ~/<projeto> em silêncio.
  it("REGRESSÃO: submit greenfield válido sem pasta aberta e sem lugar escolhido → validationError 'Escolha onde criar o projeto.'; nenhum comando roda", async () => {
    const { panel } = await openWizard();
    for (const [key, value] of Object.entries(GREENFIELD_VALID)) await send(panel, { type: "stepUpdate", payload: { [key]: value } });
    const row = await send(panel, { type: "submit" });
    expect(row).toMatchSnapshot();
    expect((row as { vscode: unknown[]; disposed: boolean }).vscode).toEqual([]);
    expect((row as { disposed: boolean }).disposed).toBe(false);
  });

  it("o bootstrap informa a pasta aberta e quantas pastas a janela tem (F4.3)", async () => {
    fake.setWorkspaceRoot("/sintetico/aberta");
    const { panel } = await openWizard();
    expect(readBoot(panel.webview.html).workspace).toEqual({ folder: "/sintetico/aberta", folderCount: 1 });
    fake.reset();
    const semPasta = await openWizard();
    expect(readBoot(semPasta.panel.webview.html).workspace).toEqual({ folder: null, folderCount: 0 });
  });

  it("switchToBrownfield → re-render COMPLETO com o schema brownfield e estado zerado", async () => {
    const { panel } = await openWizard();
    await send(panel, { type: "stepUpdate", payload: { projectName: "loja-demo" } });
    const row = await send(panel, { type: "switchToBrownfield" });
    expect(row).toMatchSnapshot();
    expect(readBoot(panel.webview.html).brownfield).toBe(true);
  });
});

// F4.3 (GAP-20): mensagem aditiva, simétrica a switchToBrownfield. A linha da tabela é nova; as
// demais do protocolo congelado não mudam.
describe("W0 host — switchToGreenfield (aditiva da F4.3)", () => {
  it("switchToGreenfield → re-render COMPLETO com o schema do projeto novo e estado zerado, depois de um switchToBrownfield", async () => {
    const { panel } = await openWizard();
    await send(panel, { type: "switchToBrownfield" });
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: "/sintetico/ws" } });
    const row = await send(panel, { type: "switchToGreenfield" });
    expect(row).toMatchSnapshot();
    expect(readBoot(panel.webview.html)).toMatchObject({ brownfield: false, state: {}, modeChosen: true });
  });

  it("o bootstrap diz se o modo já foi trocado: começa sem, e os dois switchTo* ligam (F4.3)", async () => {
    const { panel } = await openWizard();
    expect(readBoot(panel.webview.html).modeChosen).toBe(false);
    await send(panel, { type: "switchToBrownfield" });
    expect(readBoot(panel.webview.html)).toMatchObject({ brownfield: true, modeChosen: true });
  });
});

// F4.3: o passo "Pronto". Linhas novas da tabela, aditivas: o `submit` sem keepOpen e as demais não mudam.
describe("W0 host — instalação concluída com o painel aberto e abrir o Cockpit (aditivas da F4.3)", () => {
  it("submit com keepOpen → executeCommand('helyx._generateStructure', …) → installed (painel aberto, sem dispose)", async () => {
    fake.setWorkspaceRoot("/sintetico/aberta");
    const { panel } = await openWizard();
    for (const [key, value] of Object.entries(GREENFIELD_VALID)) await send(panel, { type: "stepUpdate", payload: { [key]: value } });
    const row = await send(panel, { type: "submit", keepOpen: true });
    expect(row).toMatchSnapshot();
    expect((row as { disposed: boolean }).disposed).toBe(false);
  });

  it("openCockpit → executeCommand('helyx.openCockpitNext')", async () => {
    fake.responders[`command:${BRAND.commandPrefix}.openCockpitNext`] = () => undefined;
    const { panel } = await openWizard();
    expect(await send(panel, { type: "openCockpit" })).toMatchSnapshot();
  });
});

describe("W0 host — submit brownfield (validação da pasta + barramento de instalação)", () => {
  async function brownfieldPanel(): Promise<FakeWebviewPanel> {
    const { panel } = await openWizard();
    await panel.webview.deliver({ type: "switchToBrownfield" });
    return panel;
  }

  it("sem targetDirectory → validationError 'Selecione a pasta vazia do workspace'", async () => {
    const panel = await brownfieldPanel();
    expect(await send(panel, { type: "submit" })).toMatchSnapshot();
  });

  it("pasta não vazia / pasta-repositório (.git) / pasta inexistente → validationError com o motivo de validateWorkspaceDir", async () => {
    const base = makeTempDir("wizard-bf");
    const notEmpty = makeWorkspace("wizard-bf-cheia", { "README.md": "x" });
    const repo = makeWorkspace("wizard-bf-repo", { ".git/HEAD": "ref: refs/heads/main\n" });
    const missing = path.join(base, "nao-existe");
    const rows = [];
    for (const dir of [notEmpty, repo, missing]) {
      const panel = await brownfieldPanel();
      await send(panel, { type: "stepUpdate", payload: { targetDirectory: dir } });
      rows.push(await send(panel, { type: "submit" }, [notEmpty, repo, base]));
    }
    expect(rows).toMatchSnapshot();
  });

  it("pasta vazia → executeCommand('helyx._installAgentStructure', basename, dir, 'copilot', ['dora-4keys']) → dispose", async () => {
    const empty = makeTempDir("wizard-bf-vazia");
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: `  ${empty}  ` } });
    expect(await send(panel, { type: "submit" }, [empty])).toMatchSnapshot();
  });

  it("host claude + frameworks escolhidos são repassados; instalação lançando → generationError, painel aberto", async () => {
    const empty = makeTempDir("wizard-bf-claude");
    const panel = await brownfieldPanel();
    fake.responders[`command:${BRAND.commandPrefix}._installAgentStructure`] = () => {
      throw new Error("falha sintética da instalação");
    };
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: empty } });
    await send(panel, { type: "stepUpdate", payload: { hostAdapter: "claude" } });
    await send(panel, { type: "stepUpdate", payload: { maturityFrameworks: ["tech-radar", "owasp-samm"] } });
    expect(await send(panel, { type: "submit" }, [empty])).toMatchSnapshot();
  });

  // C4 / H-BUG-07 (crítico), corrigido na F6.1: `.github/` não prova que a
  // pasta é um workspace Helyx (quase todo repo GitHub tem). Sem
  // `helyx.config.yaml`, uma pasta com `.git` é recusada como repositório e o
  // kit NÃO é instalado dentro do repo do cliente.
  it("REGRESSÃO: repositório com .git + .github/workflows é recusado e NÃO recebe _installAgentStructure (C4 / H-BUG-07)", async () => {
    const clientRepo = makeWorkspace("wizard-bf-c4", { ".git/HEAD": "ref: refs/heads/main\n", ".github/workflows/ci.yml": "on: push\n", "src/app.py": "print(1)\n" });
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: clientRepo } });
    const row = (await send(panel, { type: "submit" }, [clientRepo])) as { vscode: Array<Record<string, unknown[]>>; posted: Array<{ type: string; errors?: Record<string, string[]> }>; disposed: boolean };
    expect(row.posted).toHaveLength(1);
    expect(row.posted[0]!.type).toBe("validationError");
    expect(row.posted[0]!.errors!.targetDirectory![0]).toMatch(/é um repositório/);
    expect(row.vscode.filter((c) => "commands.executeCommand" in c)).toEqual([]);
    expect(row.disposed).toBe(false);
    expect(fs.readdirSync(clientRepo).sort()).toEqual([".git", ".github", "src"]);
  });

  it("pasta só com .claude/ (sem helyx.config.yaml): pede confirmação modal; fechar o diálogo não instala nada e reabilita o botão", async () => {
    const dir = makeWorkspace("wizard-bf-c4-confirma", { ".claude/settings.local.json": "{}\n" });
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: dir } });
    const row = (await send(panel, { type: "submit" }, [dir])) as { vscode: Array<Record<string, unknown[]>>; posted: Array<{ type: string; message?: string }>; disposed: boolean };
    const dialogs = row.vscode.filter((c) => "window.showWarningMessage" in c).map((c) => c["window.showWarningMessage"]!);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]![0]).toMatch(new RegExp(`não é um workspace ${BRAND.displayName}`, "i"));
    expect(dialogs[0]!.slice(1)).toEqual([{ modal: true }, "Instalar mesmo assim"]);
    expect(row.vscode.filter((c) => "commands.executeCommand" in c)).toEqual([]);
    expect(row.posted.map((p) => p.type)).toEqual(["generationError"]);
    expect(row.posted[0]!.message).toMatch(/cancelada/i);
    expect(row.disposed).toBe(false);
  });

  it("pasta só com .claude/: confirmar 'Instalar mesmo assim' → executeCommand('helyx._installAgentStructure', …) → dispose", async () => {
    const dir = makeWorkspace("wizard-bf-c4-confirmada", { ".claude/settings.local.json": "{}\n" });
    fake.responders["window.showWarningMessage"] = () => "Instalar mesmo assim";
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: dir } });
    const row = (await send(panel, { type: "submit" }, [dir])) as { vscode: Array<Record<string, unknown[]>>; posted: unknown[]; disposed: boolean };
    expect(row.vscode).toContainEqual({ "commands.executeCommand": [`${BRAND.commandPrefix}._installAgentStructure`, "<basename ROOT>", "<ROOT>", "copilot", ["dora-4keys"]] });
    expect(row.posted).toEqual([]);
    expect(row.disposed).toBe(true);
  });

  it("workspace Helyx (helyx.config.yaml) versionado em git: retomada sem diálogo de confirmação", async () => {
    const dir = makeWorkspace("wizard-bf-retomada", { ".git/HEAD": "ref: refs/heads/main\n", [`.claude/agents/${BRAND.files.orchestratorAgent}`]: "# orq\n", [BRAND.files.config]: 'version: "1.0.0"\n' });
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: dir } });
    const row = (await send(panel, { type: "submit" }, [dir])) as { vscode: Array<Record<string, unknown[]>>; disposed: boolean };
    expect(row.vscode.filter((c) => "window.showWarningMessage" in c)).toEqual([]);
    expect(row.vscode).toContainEqual({ "commands.executeCommand": [`${BRAND.commandPrefix}._installAgentStructure`, "<basename ROOT>", "<ROOT>", "claude", ["dora-4keys"]] });
    expect(row.disposed).toBe(true);
  });

  // Achado da F6.1 (frente B): na retomada, o Wizard repassava o host escolhido
  // na tela (default "copilot"). Num workspace Claude, a cópia do que falta
  // acrescentava o kit Copilot ao lado, e o Foundation abria no host errado.
  it.each([
    ["host_adapter: claude no config, tela no default (copilot)", { "helyx.config.yaml": 'kit_version: "0.1.0"\nhost_adapter: "claude"\nrepos: {}\n' }, undefined, "claude"],
    ["host_adapter: copilot no config, tela em claude", { "helyx.config.yaml": 'kit_version: "0.1.0"\nhost_adapter: "copilot"\nrepos: {}\n', ".github/agents/helyx.agent.md": "# orq\n" }, "claude", "copilot"],
    ["sem host_adapter, orquestrador do Claude Code no disco (config pós-Foundation)", { "helyx.config.yaml": 'kit_version: "0.1.0"\nrepos:\n  app-a: {}\n', ".claude/agents/helyx.agent.md": "# orq\n" }, "copilot", "claude"],
  ] as const)("REGRESSÃO: retomada usa o host do workspace, não o da tela — %s", async (_name, files, screenHost, expected) => {
    const dir = makeWorkspace("wizard-bf-retomada-host", files);
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: dir } });
    if (screenHost) await send(panel, { type: "stepUpdate", payload: { hostAdapter: screenHost } });
    const row = (await send(panel, { type: "submit" }, [dir])) as { vscode: Array<Record<string, unknown[]>> };
    const install = row.vscode.find((c) => "commands.executeCommand" in c)!["commands.executeCommand"]!;
    expect(install.slice(0, 4)).toEqual([`${BRAND.commandPrefix}._installAgentStructure`, "<basename ROOT>", "<ROOT>", expected]);
  });

  it("pasta vazia (instalação nova) continua usando o host escolhido na tela", async () => {
    const empty = makeTempDir("wizard-bf-host-tela");
    const panel = await brownfieldPanel();
    await send(panel, { type: "stepUpdate", payload: { targetDirectory: empty } });
    await send(panel, { type: "stepUpdate", payload: { hostAdapter: "claude" } });
    const row = (await send(panel, { type: "submit" }, [empty])) as { vscode: Array<Record<string, unknown[]>> };
    expect(row.vscode).toContainEqual({ "commands.executeCommand": [`${BRAND.commandPrefix}._installAgentStructure`, "<basename ROOT>", "<ROOT>", "claude", ["dora-4keys"]] });
  });
});

// W6 da F3.10 (ADR-0019): o Wizard é só o app React do webview. O legado
// (template literal até o W1, assets estáticos no W2) e a flag
// `<marca>.wizard.experimentalUi` (W3 a W5) saíram.
describe("W6 host — HTML do Wizard (app React)", () => {
  it("o painel abre o bundle do app React (dist/webview/wizard.js), com a CSP do Cockpit e o bootstrap JSON", async () => {
    const { panel } = await openWizard();
    const html = panel.webview.html;
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script nonce="[0-9a-f]{32}" type="module" src="vscode-webview:\/\/fake[^"]*\/dist\/webview\/wizard\.js"><\/script>/);
    expect(html).toMatch(/<link rel="stylesheet" href="vscode-webview:\/\/fake[^"]*\/dist\/webview\/assets\/wizard\.css">/);
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1]!.replace(/nonce-[0-9a-f]+/, "nonce-<nonce>");
    expect(csp).toBe("default-src 'none'; img-src vscode-webview://fake-csp-source data:; style-src vscode-webview://fake-csp-source; font-src vscode-webview://fake-csp-source; script-src 'nonce-<nonce>'");
    expect(readBoot(html)).toMatchObject({ brownfield: false, state: {}, brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix } });
  });

  // hotfix-wizard-intro-blank-screen: um escape consumido pelo TypeScript
  // dentro do template literal quebrou o <script> inline inteiro. Desde o W6
  // não existe script executável no HTML: só o bloco de dados JSON e o bundle
  // externo, que o build do webview compila e o typecheck confere.
  it("REGRESSÃO: o HTML do Wizard não tem script executável inline (só o bootstrap JSON e o bundle externo)", async () => {
    const { panel } = await openWizard();
    const scripts = [...panel.webview.html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1]!, body: m[2]! }));
    const kinds = scripts.map((t) => (t.attrs.includes('type="application/json"') ? "dados" : t.attrs.includes("src=") && t.body.trim() === "" ? "externo" : "inline"));
    expect(kinds).toEqual(["dados", "externo"]);
  });

  it("um fechamento de script digitado no estado não fecha o bloco do bootstrap antes da hora", async () => {
    const { controller, panel } = await openWizard();
    const internals = controller as unknown as ControllerInternals;
    await internals._session.handle({ type: "stepUpdate", payload: { projectName: "a</script>b" } });
    const html = internals._renderHtml([], panel.webview);
    expect(html.split("</script>")).toHaveLength(3);
    expect(readBoot(html).state).toEqual({ projectName: "a</script>b" });
  });

  it("switchToBrownfield re-renderiza o app com o schema brownfield e o estado zerado", async () => {
    const { panel } = await openWizard();
    await send(panel, { type: "stepUpdate", payload: { projectName: "loja-demo" } });
    const row = (await send(panel, { type: "switchToBrownfield" })) as { rerenders: string[] };
    expect(row.rerenders).toEqual([`re-render: brownfield=true passos=[${(await getBrownfieldSchema()).map((s) => s.key).join(",")}] estado={}`]);
    expect(panel.webview.html).toContain('<div id="root"></div>');
  });
});

// F2.1 (ADR-0015): a edição greenfield-only (`HELYX_EDITION=greenfield`,
// `scripts/package-greenfield.js`) saiu. O env não tem mais efeito: o
// brownfield fica sempre disponível. O global `__HX_BROWNFIELD_ENABLED__`
// continuava no bootstrap do script legado, sempre `true`; o app React (W6)
// mostra sempre os dois caminhos.
describe("W0 host — sem edição greenfield-only (HELYX_EDITION não tem efeito)", () => {
  it("com HELYX_EDITION=greenfield no load do módulo, o Wizard abre normalmente e switchToBrownfield re-renderiza no brownfield", async () => {
    vi.resetModules();
    vi.stubEnv(`${BRAND.envPrefix}EDITION`, "greenfield");
    try {
      const { WizardController: Reloaded } = await import("../../src/wizard/WizardController");
      // a instância do fake que o módulo recarregado enxerga é a do módulo `vscode` mockado
      const { fake: freshFake } = (await import("vscode")) as unknown as { fake: typeof fake };
      freshFake.reset();
      const controller = new Reloaded(freshFake.createExtensionContext() as never, {} as never);
      await controller.start();
      const panel = freshFake.panels[0]!;
      expect(readBoot(panel.webview.html).brownfield).toBe(false);

      await panel.webview.deliver({ type: "switchToBrownfield" });
      expect(panel.webview.htmlHistory).toHaveLength(2);
      expect(readBoot(panel.webview.html).brownfield).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
