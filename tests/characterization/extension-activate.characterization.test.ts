import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
vi.mock("vscode", () => import("./helpers/fake-vscode"));
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { fake, type FakeExtensionContext } from "./helpers/fake-vscode";
import { activate, deactivate } from "../../src/extension";
import { foundationPrompt, helyxCommandContent } from "../../src/data/foundation-prompt";
import { STATE_SERVICE_INFO_FILE_MODE } from "../../src/server/state-service-info";
import { callsEndingWith, listSourceFiles, uniqSorted } from "../contract/helpers/source-scan";
import { installNetGuard, type NetGuard } from "./helpers/net-guard";
import { cleanupWorkspaces, listTree, makeNormalizer, makeTempDir, makeWorkspace } from "./helpers/workspace-fixture";
import { goldenBrandSnapshotSerializer } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * X1 — caracterização de `activate()` (`src/extension.ts`, 774 LOC; antes só
 * `resumePendingFoundation` tinha teste). F0.4 (lane B),
 * arquitetura-e-refatoracao.md §2.5 passo X1: "Snapshot dos IDs registrados
 * + teste de consistência" e §1.9 (efeitos colaterais na ativação).
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * `activate()` roda de verdade contra o fake de `vscode`: o State Service
 * sobe em 127.0.0.1 (porta 0), o RunsWatcher, o participante de chat e o
 * CodeLens são registrados (o sql.js saiu com o espelho SQLite, ADR-0017). Os
 * dois `setTimeout` de UX (Cockpit em 800 ms, Wizard em 1200 ms) são
 * CAPTURADOS em vez de agendados — o teste dispara o callback na mão. Tudo é
 * desmontado no fim (`subscriptions.dispose()` + `deactivate()`), e a rede
 * externa fica travada.
 *
 * Rede dos passos X2–X4 (um módulo por comando, startup em módulos,
 * container): a lista de comandos e os efeitos colaterais não podem mudar
 * sem revisão. C7 / H-BUG-14 ("grava em qualquer pasta") foi corrigido na
 * F2.2: State Service, `server.json`, RunsWatcher e `/helyx` só em workspace
 * Helyx (`helyx.config.yaml` ou `ai-sdk.config.yaml` na raiz).
 */

const startedAt = new Date();
let net: NetGuard;
let ctx: FakeExtensionContext | undefined;
let uxTimers: Array<{ delay: number; fn: () => void }> = [];
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  fake.reset();
  net = installNetGuard();
  uxTimers = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 800 || delay === 1200) {
      uxTimers.push({ delay, fn });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return (realSetTimeout as unknown as (...a: unknown[]) => ReturnType<typeof setTimeout>)(fn, delay, ...args);
  }) as typeof setTimeout);
});

afterEach(async () => {
  for (const d of ctx?.subscriptions ?? []) d.dispose();
  for (const p of fake.panels) p.dispose();
  deactivate();
  ctx = undefined;
  await new Promise((r) => realSetTimeout(r, 20)); // deixa o stop() do servidor fechar
  vi.restoreAllMocks();
  net.restore();
});

afterAll(() => cleanupWorkspaces());

const serverJson = (root: string): string => path.join(root, ".github/artifacts/.state-service/server.json");

/**
 * `server`: o workspace é Helyx, então o State Service sobe e grava
 * `server.json` (espera por ele). `claudeCommand`: layout Claude (`.claude/`),
 * então `/helyx` é garantido (espera o conteúdo).
 */
async function activateIn(
  root: string | undefined,
  opts: { wizardSeen?: boolean; server?: boolean; claudeCommand?: boolean } = {}
): Promise<FakeExtensionContext> {
  fake.setWorkspaceRoot(root);
  ctx = fake.createExtensionContext("/fake/ext");
  if (opts.wizardSeen) ctx._globalStore.set(`${BRAND.name}.wizardSeen`, true);
  activate(ctx as never);
  if (root && opts.server) await vi.waitFor(() => expect(fs.existsSync(serverJson(root))).toBe(true), { timeout: 3000, interval: 10 });
  // `ensureHelyx_command` usa `fs.writeFile` assíncrono: o arquivo EXISTE antes
  // de ter conteúdo — esperar só `existsSync` dava leitura vazia sob carga.
  if (root && opts.claudeCommand) {
    const cmd = path.join(root, `.claude/commands/${BRAND.files.slashCommand}`);
    await vi.waitFor(() => expect(fs.existsSync(cmd) && fs.statSync(cmd).size > 0).toBe(true), { timeout: 3000, interval: 10 });
  }
  // `isConfigured()` é assíncrono: espera o ramo (timer OU setContext) acontecer
  await vi.waitFor(
    () => expect(uxTimers.length > 0 || fake.calls("commands.executeCommand").some((c) => c[0] === "setContext") || opts.wizardSeen === true).toBe(true),
    { timeout: 3000, interval: 10 }
  );
  await new Promise((r) => realSetTimeout(r, 20));
  return ctx;
}

/** Registro estático (AST de `src/**`) — o mesmo do contrato de IDs. */
const staticRegistered = uniqSorted(
  listSourceFiles("src").flatMap((f) => callsEndingWith(f, "registerCommand").map((c) => c.value.args[0]).filter((v): v is string => typeof v === "string"))
);

function summary(root: string | undefined, c: FakeExtensionContext): unknown {
  const normalize = makeNormalizer({ roots: root ? [root] : [], since: startedAt, volatileKeys: ["token", "pid", "port"] });
  const secretKeys = fake.calls("secrets.store").map((a) => a[0]);
  return normalize({
    commandsRegistered: [...fake.commands.keys()].sort(),
    chatParticipants: fake.chatParticipants.map((p) => p.id),
    webviewViewProviders: fake.webviewViewProviders.map((v) => ({ viewType: v.viewType, options: v.options })),
    codeLensSelectors: fake.codeLensProviders.map((p) => p.selector),
    statusBar: fake.statusBarItems.map((i) => ({ text: i.text, command: i.command, tooltip: i.tooltip, alignment: i.alignment, priority: i.priority, shown: i.shown })),
    fileWatchers: fake.watchers.map((w) => w.pattern),
    secretsStored: secretKeys,
    // ordenado por chave: o State Service e o `isConfigured()` correm em paralelo (ordem não garantida)
    globalStateUpdates: fake.calls("globalState.update").map(([k, v]) => [k, k === `${BRAND.name}.stateServicePort` ? "<port>" : v]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    environmentVariableCollection: fake.log.filter((l) => l.api.startsWith("environmentVariableCollection.")).map((l) => l.api),
    executeCommand: fake.calls("commands.executeCommand").sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    messages: fake.log.filter((l) => l.api.startsWith("window.show")).map((l) => ({ [l.api]: l.args })),
    uxTimers: uxTimers.map((t) => t.delay),
    webviewPanels: fake.panels.map((p) => p.viewType),
    subscriptions: c.subscriptions.length,
    network: net.blocked,
    filesInWorkspace: root ? listTree(root) : "(sem pasta)",
  });
}

describe("X1 — activate() numa pasta vazia qualquer (não-Helyx)", () => {
  it("snapshot do que é registrado e dos efeitos colaterais", async () => {
    const root = makeWorkspace("x1-vazia");
    const c = await activateIn(root);
    expect(summary(root, c)).toMatchSnapshot();
  });

  it("os comandos registrados em runtime == os registerCommand estáticos de src/ (fecha o contrato de IDs)", async () => {
    await activateIn(makeWorkspace("x1-ids"));
    expect([...fake.commands.keys()].sort()).toEqual(staticRegistered);
    expect(fake.commands.size).toBe(20);
  });

  // C7 / H-BUG-14 (crítico), corrigido na F2.2: antes, a ativação era
  // `onStartupFinished` e QUALQUER pasta aberta ganhava `.claude/commands/helyx.md`
  // e `.github/artifacts/.state-service/server.json` (com o token), além de um
  // servidor HTTP em 127.0.0.1. Fora de workspace Helyx, nada disso acontece.
  it("numa pasta não-Helyx: não grava nada, não sobe o State Service, não guarda token nem vigia runs (C7 / H-BUG-14)", async () => {
    const root = makeWorkspace("x1-c7", { "README.md": "# projeto qualquer\n" });
    await activateIn(root);
    await new Promise((r) => realSetTimeout(r, 100)); // dá tempo de qualquer escrita assíncrona aparecer
    expect(listTree(root)).toEqual(["README.md"]);
    expect(fake.calls("secrets.store")).toEqual([]);
    expect(fake.watchers).toEqual([]);
    expect(fake.calls("globalState.update").filter(([k]) => k === `${BRAND.name}.stateServicePort`)).toEqual([]);
  });

  it("numa pasta não-Helyx com .claude/ (projeto Claude Code qualquer): não cria .claude/commands/helyx.md (C7 / H-BUG-14)", async () => {
    const root = makeWorkspace("x1-c7-claude", { ".claude/settings.json": "{}\n" });
    await activateIn(root);
    await new Promise((r) => realSetTimeout(r, 100));
    expect(listTree(root)).toEqual([".claude/", ".claude/settings.json"]);
  });

  it("1ª ativação sem config: marca helyx.wizardSeen e agenda o Wizard para 1200 ms; o callback abre o painel helyxWizard", async () => {
    const root = makeWorkspace("x1-wizard");
    await activateIn(root);
    expect(uxTimers.map((t) => t.delay)).toEqual([1200]);
    expect(ctx!._globalStore.get(`${BRAND.name}.wizardSeen`)).toBe(true);
    uxTimers[0]!.fn();
    await vi.waitFor(() => expect(fake.panels.map((p) => p.viewType)).toEqual([`${BRAND.name}Wizard`]), { timeout: 2000, interval: 10 });
  });

  it("com helyx.wizardSeen já gravado: nenhum timer de UX", async () => {
    await activateIn(makeWorkspace("x1-wizard-visto"), { wizardSeen: true });
    expect(uxTimers).toEqual([]);
  });

  it("deactivate() para o State Service (apaga server.json)", async () => {
    const root = makeWorkspace("x1-deactivate", { [BRAND.files.config]: 'kit_version: "99.0.0"\nrepos: {}\n' });
    await activateIn(root, { server: true });
    for (const d of ctx!.subscriptions) d.dispose();
    deactivate();
    await vi.waitFor(() => expect(fs.existsSync(serverJson(root))).toBe(false), { timeout: 2000, interval: 10 });
  });
});

describe("X1 — activate() num workspace greenfield configurado (host Copilot)", () => {
  const CONFIG = 'version: "1"\nkit_version: "99.0.0"\nproject:\n  name: "loja-demo"\n  slug: "loja-demo"\nhost_adapter: "copilot"\n';

  it("snapshot: setContext helyx.projectInitialized + Cockpit agendado para 800 ms (sem Wizard)", async () => {
    const root = makeWorkspace("x1-configurado", { "ai-sdk.config.yaml": CONFIG });
    const c = await activateIn(root, { server: true });
    expect(summary(root, c)).toMatchSnapshot();
    uxTimers[0]!.fn();
    await vi.waitFor(() => expect(fake.panels.map((p) => p.viewType)).toEqual([`${BRAND.name}CockpitNext`]), { timeout: 2000, interval: 10 });
  });

  // C7 / H-BUG-14 ("inclusive em workspace Copilot"), corrigido na F2.2: o
  // `/helyx` é do layout Claude e só é garantido quando o workspace tem `.claude/`.
  it("workspace Helyx Copilot (sem .claude/) não ganha .claude/commands/helyx.md (C7 / H-BUG-14)", async () => {
    const root = makeWorkspace("x1-copilot", { "ai-sdk.config.yaml": CONFIG });
    await activateIn(root, { server: true });
    await new Promise((r) => realSetTimeout(r, 100));
    expect(fs.existsSync(path.join(root, ".claude"))).toBe(false);
  });

  it("kit defasado (kit_version 0.1.0): aviso com 3 ações; 'Agora não' grava o nag dispensado para <root>@<versão>", async () => {
    const root = makeWorkspace("x1-kit-nag", { "ai-sdk.config.yaml": CONFIG.replace("99.0.0", "0.1.0") });
    fake.responders["window.showInformationMessage"] = (msg: unknown) => (String(msg).includes("estrutura 0.1.0") ? "Agora não" : undefined);
    await activateIn(root, { server: true });
    await vi.waitFor(() => expect(fake.calls("globalState.update").some(([k]) => k === `${BRAND.name}.kitNagDismissed`)).toBe(true), { timeout: 2000, interval: 10 });
    const normalize = makeNormalizer({ roots: [root], since: startedAt });
    const nag = fake.calls("window.showInformationMessage").find((a) => String(a[0]).includes("estrutura 0.1.0"))!;
    expect(normalize(nag.map((x) => String(x).replace(/plugin é \d+\.\d+\.\d+/, "plugin é <kitVersion>")))).toEqual([
      `${BRAND.displayName}: este workspace usa a estrutura 0.1.0 e o plugin é <kitVersion>. Agentes e skills podem estar defasados.`,
      "Migrar agora",
      "Ver o que muda",
      "Agora não",
    ]);
    const dismissed = fake.calls("globalState.update").find(([k]) => k === `${BRAND.name}.kitNagDismissed`)!;
    expect(normalize(dismissed[1])).toMatch(/^<ROOT>@\d+\.\d+\.\d+$/);
  });

  // Achado da F6.1 (frente B): desde o A6 o migrateKit recusa projeto
  // greenfield, mas o aviso de kit defasado ainda oferecia "Migrar agora", e o
  // clique só avisava que a migração é para brownfield.
  it("REGRESSÃO: kit defasado num projeto greenfield não oferece 'Migrar agora' (a migração é só brownfield)", async () => {
    const greenfield = 'version: "1"\nkit_version: "0.1.0"\nproject:\n  name: "loja-demo"\n  slug: "loja-demo"\nstacks:\n  backend: "python-api"\nhost_adapter: "copilot"\n';
    const root = makeWorkspace("x1-kit-nag-greenfield", { "ai-sdk.config.yaml": greenfield });
    await activateIn(root, { server: true });
    const nagOf = (): unknown[] | undefined => fake.calls("window.showInformationMessage").find((a) => String(a[0]).includes("estrutura 0.1.0"));
    await vi.waitFor(() => expect(nagOf()).toBeDefined(), { timeout: 2000, interval: 10 });
    expect(nagOf()!.slice(1)).toEqual(["Ver o que muda", "Agora não"]);
  });
});

// A5 / H-BUG-09: depois do Foundation o config fica só com `kit_version` +
// `repos:` (sem `host_adapter`). O `migrateKit` lia o host por `load()`, que
// devolve null para esse formato, e instalava o kit Copilot num workspace Claude.
describe("X1 — helyx.migrateKit num workspace Claude depois do Foundation (A5 / H-BUG-09)", () => {
  it("REGRESSÃO: migra o kit Claude (.claude/agents, CLAUDE.md) e não cria .github/agents, chatmodes nem copilot-instructions", async () => {
    const root = makeWorkspace("x1-a5", {
      [BRAND.files.config]: 'kit_version: "0.1.0"\nrepos:\n  app-a:\n    skills:\n      - coding-guidelines-app-a\n',
      [`.claude/agents/${BRAND.files.orchestratorAgent}`]: "# orquestrador\n",
      ".claude/agents/discovery/assessor.agent.md": "# assessor antigo\n",
      "CLAUDE.md": "# instruções antigas\n",
    });
    await activateIn(root, { wizardSeen: true });
    fake.responders["window.showWarningMessage"] = (msg: unknown) => (String(msg).startsWith("Migrar a estrutura") ? "Migrar" : undefined);

    await fake.commands.get(`${BRAND.commandPrefix}.migrateKit`)!();

    expect(fake.calls("window.showErrorMessage")).toEqual([]);
    expect(fs.existsSync(path.join(root, ".github/agents"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".github/chatmodes"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".github/copilot-instructions.md"))).toBe(false);
    expect(fs.readFileSync(path.join(root, ".claude/agents/discovery/assessor.agent.md"), "utf-8")).not.toBe("# assessor antigo\n");
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf-8")).not.toBe("# instruções antigas\n");
    expect(fs.readFileSync(path.join(root, BRAND.files.config), "utf-8")).toContain("repos:\n  app-a:");
  });
});

// A6 / H-BUG-10: o `migrateKit` não checava o modo e aplicava o kit brownfield
// num projeto greenfield (CLAUDE.md trocado, repos/, docs/input/ e .gitignore criados).
describe("X1 — helyx.migrateKit num projeto greenfield (A6 / H-BUG-10)", () => {
  it("REGRESSÃO: avisa que a migração é só para brownfield, não pede confirmação e não muda nenhum arquivo", async () => {
    const root = makeWorkspace("x1-a6", {
      "ai-sdk.config.yaml": 'version: "1.0.0"\nkit_version: "0.1.0"\nproject:\n  name: "orbita"\n  slug: "orbita"\n  \nstacks:\n  backend: "python-api"\nhost_adapter: "claude"\n',
      "CLAUDE.md": "# orbita — Claude Instructions\n",
      [`.claude/agents/${BRAND.files.orchestratorAgent}`]: "# orquestrador greenfield\n",
    });
    await activateIn(root, { wizardSeen: true });
    const before = listTree(root).map((p) => (p.endsWith("/") ? p : `${p} ${fs.readFileSync(path.join(root, p), "utf-8")}`));
    fake.responders["window.showWarningMessage"] = (msg: unknown) => (String(msg).startsWith("Migrar a estrutura") ? "Migrar" : undefined);

    await fake.commands.get(`${BRAND.commandPrefix}.migrateKit`)!();

    const warnings = fake.calls("window.showWarningMessage").map((a) => String(a[0]));
    expect(warnings.filter((m) => m.startsWith("Migrar a estrutura"))).toEqual([]);
    expect(warnings).toContainEqual(expect.stringMatching(/greenfield/));
    expect(listTree(root).map((p) => (p.endsWith("/") ? p : `${p} ${fs.readFileSync(path.join(root, p), "utf-8")}`))).toEqual(before);
  });
});

describe("X1 — activate() num workspace Helyx com layout Claude (.claude/)", () => {
  const CONFIG = 'kit_version: "99.0.0"\nrepos: {}\n';

  it("sobe o State Service com server.json (token, 0600) e recria .claude/commands/helyx.md se faltar", async () => {
    const root = makeWorkspace("x1-helyx-claude", { [BRAND.files.config]: CONFIG, ".claude/agents/.gitkeep": "" });
    await activateIn(root, { server: true, claudeCommand: true });
    expect(fs.readFileSync(path.join(root, `.claude/commands/${BRAND.files.slashCommand}`), "utf-8")).toBe(helyxCommandContent("claude"));
    const info = JSON.parse(fs.readFileSync(serverJson(root), "utf-8")) as { token: string; port: number };
    expect(info.token).toMatch(/^[0-9a-f]{64}$/);
    expect(fake.calls("secrets.store")).toEqual([[`${BRAND.name}.stateServiceToken`, info.token]]);
    if (process.platform !== "win32") expect(fs.statSync(serverJson(root)).mode & 0o777).toBe(STATE_SERVICE_INFO_FILE_MODE);
  });

  it("não sobrescreve .claude/commands/helyx.md já existente", async () => {
    const root = makeWorkspace("x1-cmd-existente", { [BRAND.files.config]: CONFIG, [`.claude/commands/${BRAND.files.slashCommand}`]: "conteúdo do usuário\n" });
    await activateIn(root, { server: true, claudeCommand: true });
    await new Promise((r) => realSetTimeout(r, 50));
    expect(fs.readFileSync(path.join(root, `.claude/commands/${BRAND.files.slashCommand}`), "utf-8")).toBe("conteúdo do usuário\n");
  });

  // G12 (F2.2, ADR-0015): o manifesto declara `untrustedWorkspaces.supported:
  // false`, então o VS Code nem ativa a extensão em Restricted Mode. Defesa em
  // profundidade: se ativar mesmo assim, nada é gravado e nenhum servidor sobe.
  it("workspace Helyx NÃO confiável (Restricted Mode): não sobe State Service, não grava server.json nem /helyx (G12)", async () => {
    const root = makeWorkspace("x1-nao-confiavel", { [BRAND.files.config]: CONFIG, ".claude/agents/.gitkeep": "" });
    fake.setTrusted(false);
    await activateIn(root);
    await new Promise((r) => realSetTimeout(r, 100));
    expect(listTree(root)).toEqual([".claude/", ".claude/agents/", ".claude/agents/.gitkeep", BRAND.files.config]);
    expect(fake.calls("secrets.store")).toEqual([]);
    expect(fake.watchers).toEqual([]);
  });

  it("instalar o kit na pasta aberta (não-Helyx na ativação) sobe o State Service logo depois, sem reload", async () => {
    const root = makeWorkspace("x1-install-aberta");
    await activateIn(root);
    expect(fs.existsSync(serverJson(root))).toBe(false);
    await fake.commands.get(`${BRAND.commandPrefix}._installAgentStructure`)!("x1-install-aberta", root, "claude", ["dora-4keys"]);
    await vi.waitFor(() => expect(fs.existsSync(serverJson(root))).toBe(true), { timeout: 3000, interval: 10 });
  });

  // H-BUG-24, corrigido na F3.7: o Foundation abria sempre o chat do Copilot,
  // mesmo com o host Claude escolhido no Wizard. No Claude Code, o pedido vai
  // para o /<marca> (área de transferência + foco), como o Cockpit já fazia.
  it("REGRESSÃO: instalar com host Claude na pasta aberta leva o Foundation ao Claude Code, não ao chat do Copilot (H-BUG-24)", async () => {
    const root = makeWorkspace("x1-install-claude");
    await activateIn(root);
    await fake.commands.get(`${BRAND.commandPrefix}._installAgentStructure`)!("x1-install-claude", root, "claude", []);
    const copied = fake.calls("env.clipboard.writeText").map((a) => String(a[0]));
    expect(copied).toEqual([`/${BRAND.name} ${foundationPrompt("claude")}`]);
    expect(fake.calls("commands.executeCommand").filter((a) => a[0] === "workbench.action.chat.open")).toEqual([]);
  });

  it("REGRESSÃO: instalar com host Copilot na pasta aberta leva o Foundation ao agente no chat do Copilot (H-BUG-24)", async () => {
    const root = makeWorkspace("x1-install-copilot");
    await activateIn(root);
    await fake.commands.get(`${BRAND.commandPrefix}._installAgentStructure`)!("x1-install-copilot", root, "copilot", []);
    expect(fake.calls("env.clipboard.writeText")).toEqual([]);
    expect(fake.calls("commands.executeCommand").filter((a) => a[0] === "workbench.action.chat.open")).toEqual([
      ["workbench.action.chat.open", { query: foundationPrompt("copilot"), mode: BRAND.participant.name }],
    ]);
  });
});

// A8 / H-BUG-12: o clone ignorava o `pinned_sha` (trazia o HEAD do remote) e o
// sync regravava o pin com esse HEAD, em silêncio. Os findings `arquivo:linha`
// ficavam ancorados na versão errada. Roda o handler de verdade, com o `git`
// do sistema contra um remote local (`file://`, sem rede).
describe("X1 — helyx.syncRepos com pinned_sha (A8 / H-BUG-12)", () => {
  // Isola as chamadas de git DO TESTE (commit) da config do usuário: sem
  // assinatura, hooks ou identidade global. O handler usa o git do sistema como é.
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=Teste", "-c", "user.email=teste@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, env: gitEnv, encoding: "utf-8" }).trim();

  /** Remote local com 2 commits: devolve a URL e os dois SHAs (o pin é o 1º, o HEAD é o 2º). */
  function makeRemote(): { url: string; first: string; head: string } {
    const dir = makeTempDir("x1-a8-remote");
    git(dir, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "app.txt"), "versão 1\n");
    git(dir, "add", "app.txt");
    git(dir, "commit", "-q", "-m", "versão 1");
    const first = git(dir, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(dir, "app.txt"), "versão 2\n");
    git(dir, "commit", "-q", "-am", "versão 2");
    return { url: pathToFileURL(dir).href, first, head: git(dir, "rev-parse", "HEAD") };
  }

  const reposYaml = (url: string, pin: string): string =>
    `version: 1\nrepos:\n  - id: app-a\n    source: git\n    url: '${url}'\n    pinned_sha: "${pin}"\n`;

  it("REGRESSÃO: o clone fica no commit do pin e o pinned_sha do repos.yaml não é regravado com o HEAD do remote", async () => {
    const remote = makeRemote();
    const root = makeWorkspace("x1-a8-clone", { ".github/artifacts/repos.yaml": reposYaml(remote.url, remote.first) });
    await activateIn(root, { wizardSeen: true });

    await fake.commands.get(`${BRAND.commandPrefix}.syncRepos`)!();

    expect(git(path.join(root, "repos", "app-a"), "rev-parse", "HEAD")).toBe(remote.first);
    expect(fs.readFileSync(path.join(root, "repos", "app-a", "app.txt"), "utf-8")).toBe("versão 1\n");
    const repos = fs.readFileSync(path.join(root, ".github/artifacts/repos.yaml"), "utf-8");
    expect(repos).toContain(`pinned_sha: "${remote.first}"`);
    expect(repos).not.toContain(remote.head);
  });

  it("REGRESSÃO: repositório já materializado em outro commit: o pin não muda e o aviso nomeia a divergência", async () => {
    const remote = makeRemote();
    const root = makeWorkspace("x1-a8-divergente", { ".github/artifacts/repos.yaml": reposYaml(remote.url, remote.first) });
    git(root, "clone", "-q", remote.url, path.join(root, "repos", "app-a"));
    await activateIn(root, { wizardSeen: true });

    await fake.commands.get(`${BRAND.commandPrefix}.syncRepos`)!();

    expect(git(path.join(root, "repos", "app-a"), "rev-parse", "HEAD")).toBe(remote.head);
    expect(fs.readFileSync(path.join(root, ".github/artifacts/repos.yaml"), "utf-8")).toContain(`pinned_sha: "${remote.first}"`);
    const warnings = fake.calls("window.showWarningMessage").map((a) => String(a[0]));
    expect(warnings).toContainEqual(expect.stringMatching(/app-a/));
    expect(warnings.find((m) => m.includes("app-a"))).toContain(remote.first.slice(0, 7));
  });

  // A10 / D13 (ADR-0017): a âncora de versão era gravada com fs.writeFile
  // direto, sem o lock que o CLI usa, e podia apagar uma escrita concorrente.
  it("REGRESSÃO: a âncora de versão espera o lock de repos.yaml e não apaga a escrita do CLI (A10)", async () => {
    const remote = makeRemote();
    const root = makeWorkspace("x1-a10-lock", {
      ".github/artifacts/repos.yaml": `version: 1\nrepos:\n  - id: app-a\n    source: git\n    url: '${remote.url}'\n`,
    });
    await activateIn(root, { wizardSeen: true });
    const file = path.join(root, ".github/artifacts/repos.yaml");
    const before = fs.readFileSync(file, "utf-8");
    fs.writeFileSync(`${file}.lock`, "99999");

    const running = fake.commands.get(`${BRAND.commandPrefix}.syncRepos`)!();
    await vi.waitFor(() => expect(fs.existsSync(path.join(root, "repos", "app-a", "app.txt"))).toBe(true), { timeout: 10_000, interval: 20 });
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.readFileSync(file, "utf-8"), "gravou com o lock do CLI de pé").toBe(before);

    fs.writeFileSync(file, `${before}# escrito pelo CLI\n`, "utf-8");
    fs.rmSync(`${file}.lock`);
    await running;
    const after = fs.readFileSync(file, "utf-8");
    expect(after).toContain("# escrito pelo CLI");
    expect(after).toMatch(new RegExp(`pinned_sha: "?${remote.head}"?`));
  });
});

describe("X1 — primeiro uso: a context key e a view de boas-vindas (G9, F4.3)", () => {
  const KEY = `${BRAND.name}.isWorkspace`;
  const keyValues = (): unknown[] => fake.calls("commands.executeCommand").filter((c) => c[0] === "setContext" && c[1] === KEY).map((c) => c[2]);

  it("numa pasta qualquer a key vale false, sem pasta também, e num workspace da marca vale true", async () => {
    await activateIn(makeWorkspace("x1-g9-qualquer"), { wizardSeen: true });
    expect(keyValues()).toEqual([false]);
    fake.reset();
    await activateIn(undefined, { wizardSeen: true });
    expect(keyValues()).toEqual([false]);
    fake.reset();
    await activateIn(makeWorkspace("x1-g9-workspace", { [BRAND.files.config]: 'kit_version: "99.0.0"\nrepos: {}\n' }), { wizardSeen: true, server: true });
    expect(keyValues()).toEqual([true]);
  });

  it("registra a view de boas-vindas como provedor de árvore sem itens (é onde o VS Code desenha o viewsWelcome)", async () => {
    await activateIn(makeWorkspace("x1-g9-view"), { wizardSeen: true });
    expect(fake.treeDataProviders.map((p) => p.viewId)).toEqual([`${BRAND.name}.welcome`]);
    const provider = fake.treeDataProviders[0]!.provider as { getChildren(): unknown[] };
    expect(provider.getChildren()).toEqual([]);
  });

  it("a key se refaz quando as pastas abertas mudam, sem recarregar a janela", async () => {
    const root = makeWorkspace("x1-g9-muda");
    await activateIn(root, { wizardSeen: true });
    const next = makeWorkspace("x1-g9-muda-ws", { [BRAND.files.config]: 'kit_version: "99.0.0"\nrepos: {}\n' });
    fake.setWorkspaceRoot(next);
    fake.fireWorkspaceFoldersChanged();
    await vi.waitFor(() => expect(keyValues()).toEqual([false, true]), { timeout: 2000, interval: 10 });
  });

  it("depois que o Wizard instala na pasta aberta, a key vira true sem recarregar", async () => {
    const root = makeWorkspace("x1-g9-instala");
    await activateIn(root, { wizardSeen: true });
    expect(keyValues()).toEqual([false]);
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    const panel = fake.panels.at(-1)!;
    await panel.webview.deliver({ type: "switchToBrownfield" });
    await panel.webview.deliver({ type: "stepUpdate", payload: { targetDirectory: root, hostAdapter: "claude" } });
    await panel.webview.deliver({ type: "submit", keepOpen: true });
    await vi.waitFor(() => expect(keyValues()).toEqual([false, true]), { timeout: 8000, interval: 20 });
    expect(panel.webview.posted.some((m) => (m as { type?: string }).type === "installed")).toBe(true);
  }, 15_000);
});

// H-BUG-53: cada comando criava um controller novo, e a guarda do "já está aberto" era por instância.
describe("X1 — painel único do Wizard (H-BUG-53)", () => {
  it("REGRESSÃO: pedir o Wizard duas vezes seguidas abre um só painel", async () => {
    await activateIn(makeWorkspace("x1-b53-dois"), { wizardSeen: true });
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    expect(fake.panels.map((p) => p.viewType)).toEqual([`${BRAND.name}Wizard`]);
  });

  it("REGRESSÃO: a abertura automática da primeira ativação e o comando abrem um só painel", async () => {
    await activateIn(makeWorkspace("x1-b53-auto"));
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    uxTimers[0]!.fn();
    await new Promise((r) => realSetTimeout(r, 50));
    expect(fake.panels.map((p) => p.viewType)).toEqual([`${BRAND.name}Wizard`]);
  });

  it("fechado o painel, o pedido seguinte abre um Wizard novo", async () => {
    await activateIn(makeWorkspace("x1-b53-reabre"), { wizardSeen: true });
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    fake.panels[0]!.dispose();
    await fake.commands.get(`${BRAND.commandPrefix}.initializeDeliveryKit`)!();
    expect(fake.panels).toHaveLength(2);
  });
});

describe("X1 — activate() sem pasta aberta", () => {
  it("snapshot: registra tudo, mas não sobe State Service, não grava arquivo e agenda o Wizard", async () => {
    const c = await activateIn(undefined);
    expect(summary(undefined, c)).toMatchSnapshot();
  });
});
