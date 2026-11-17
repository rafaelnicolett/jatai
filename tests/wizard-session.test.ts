import { describe, it, expect } from "vitest";
import { WizardSession, buildLocalManifest, type WizardHostPort } from "../src/wizard/WizardSession";
import { getBrownfieldSchema, getWizardSchema } from "../src/wizard/wizard-schema";
import type { HostAdapter, WizardStep } from "../src/types";
import type { HostToWizardMessage } from "../src/shared/wizard-protocol";
import type { ResolvedTemplateManifest, TemplateSource } from "../src/adapters/templates/TemplateSource";
import type { WorkspaceValidation } from "../src/wizard/workspace-validation";
import { BRAND } from "../src/data/brand.pure";
import { FixedWorkspaceRoot } from "../src/adapters/workspace/WorkspaceRoot";

/**
 * `WizardSession` (F3.10, passo W1 da ADR-0019): o estado e as regras do
 * Wizard, sem VS Code. Dublê escrito à mão da `WizardHostPort` (nada de
 * `vi.mock`). A tabela completa message-in → effect-out, com o VS Code
 * falso e disco de verdade, continua na caracterização W0
 * (`tests/characterization/wizard-controller.characterization.test.ts`).
 */

class FakeHost implements WizardHostPort {
  log: Array<[string, ...unknown[]]> = [];
  folder: string | undefined = undefined;
  confirmAnswer = false;
  commandError: Error | null = null;
  workspaceHost: HostAdapter = "claude";
  installedCalls = 0;

  onInstalled(): void {
    this.installedCalls++;
  }

  postMessage(msg: HostToWizardMessage): void {
    this.log.push(["postMessage", msg]);
  }
  render(schema: readonly WizardStep[]): void {
    this.log.push(["render", schema.map((s) => s.key)]);
  }
  dispose(): void {
    this.log.push(["dispose"]);
  }
  async pickFolder(): Promise<string | undefined> {
    this.log.push(["pickFolder"]);
    return this.folder;
  }
  async confirm(message: string, action: string): Promise<boolean> {
    this.log.push(["confirm", message, action]);
    return this.confirmAnswer;
  }
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    this.log.push(["executeCommand", command, ...args]);
    if (this.commandError) throw this.commandError;
    return undefined;
  }
  async workspaceHostAdapter(dir: string): Promise<HostAdapter> {
    this.log.push(["workspaceHostAdapter", dir]);
    return this.workspaceHost;
  }
}

function validation(result: WorkspaceValidation): (dir: string) => Promise<WorkspaceValidation> {
  return () => Promise.resolve(result);
}

const VALID = {
  projectName: "loja-demo",
  startupIdea: "Uma vitrine sintética.",
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

describe("WizardSession — estado", () => {
  it("stepUpdate faz merge raso, um campo por vez", async () => {
    const session = new WizardSession(new FakeHost());
    await session.handle({ type: "stepUpdate", payload: { projectName: "a" } });
    await session.handle({ type: "stepUpdate", payload: { domain: "fintech" } });
    await session.handle({ type: "stepUpdate", payload: { projectName: "b" } });
    expect(session.state).toEqual({ projectName: "b", domain: "fintech" });
  });

  it("switchToBrownfield zera o estado, liga o modo e re-renderiza com o schema brownfield", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "stepUpdate", payload: { projectName: "a" } });
    await session.handle({ type: "switchToBrownfield" });
    expect(session.state).toEqual({});
    expect(session.isBrownfield).toBe(true);
    expect(host.log).toEqual([["render", (await getBrownfieldSchema()).map((s) => s.key)]]);
  });

  it("modeChosen sobe nas duas trocas de modo e começa desligado (o painel reabre depois da escolha do modo)", async () => {
    const session = new WizardSession(new FakeHost());
    expect(session.modeChosen).toBe(false);
    await session.handle({ type: "switchToBrownfield" });
    expect(session.modeChosen).toBe(true);
    await session.handle({ type: "switchToGreenfield" });
    expect(session.modeChosen).toBe(true);
  });

  it("switchToGreenfield (aditiva, GAP-20) zera o estado, desliga o modo e re-renderiza com o schema do projeto novo", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "switchToBrownfield" });
    await session.handle({ type: "stepUpdate", payload: { targetDirectory: "/sintetico/ws" } });
    host.log = [];
    await session.handle({ type: "switchToGreenfield" });
    expect(session.state).toEqual({});
    expect(session.isBrownfield).toBe(false);
    expect(host.log).toEqual([["render", (await getWizardSchema()).map((s) => s.key)]]);
  });

  it("pickFolder: pasta escolhida vai para o estado e volta como folderPicked; cancelado não faz nada", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "pickFolder" });
    expect(host.log).toEqual([["pickFolder"]]);
    host.folder = "/sintetico/ws";
    await session.handle({ type: "pickFolder" });
    expect(session.state.targetDirectory).toBe("/sintetico/ws");
    expect(host.log.at(-1)).toEqual(["postMessage", { type: "folderPicked", folder: "/sintetico/ws" }]);
  });

  it("cancel fecha o painel; importRepo não faz nada (declarado e morto, H-GAP-20)", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "importRepo" });
    await session.handle({ type: "cancel" });
    expect(host.log).toEqual([["dispose"]]);
  });
});

describe("WizardSession — preview do template", () => {
  it("TemplateSource com manifest → repassa manifest e origem", async () => {
    const host = new FakeHost();
    const resolved: ResolvedTemplateManifest = { manifest: buildLocalManifest("x", {}), source: "cache" };
    const source: TemplateSource = { getManifest: () => Promise.resolve(resolved), getZip: () => Promise.resolve(null) };
    await new WizardSession(host, source).handle({ type: "fetchTemplate", templateId: "x" });
    expect(host.log).toEqual([["postMessage", { type: "templateManifest", manifest: resolved.manifest, source: "cache" }]]);
  });

  it("REGRESSÃO (H-BUG-25): TemplateSource que lança → o host ainda responde, com o manifest local (o Wizard espera a prévia para liberar a instalação)", async () => {
    const host = new FakeHost();
    const source: TemplateSource = { getManifest: () => Promise.reject(new Error("fonte fora do ar")), getZip: () => Promise.resolve(null) };
    await new WizardSession(host, source).handle({ type: "fetchTemplate", templateId: "x" });
    expect(host.log).toHaveLength(1);
    const [kind, msg] = host.log[0] as [string, Extract<HostToWizardMessage, { type: "templateManifest" }>];
    expect(kind).toBe("postMessage");
    expect(msg).toMatchObject({ type: "templateManifest", source: "local" });
  });

  it("REGRESSÃO: a prévia põe o config na raiz, com o nome da marca, e o estado em .github/artifacts/ nos dois harnesses", async () => {
    for (const host of ["claude", "copilot"] as const) {
      const host_ = new FakeHost();
      const session = new WizardSession(host_);
      await session.handle({ type: "stepUpdate", payload: { projectName: "loja", hostAdapter: host } });
      await session.handle({ type: "fetchTemplate", templateId: "x" });
      const [, msg] = host_.log[0] as [string, Extract<HostToWizardMessage, { type: "templateManifest" }>];
      const tree = msg.manifest.generatedTree;
      expect(tree, host).toContain(BRAND.files.config);
      // o nome antigo, e a pasta errada: o config nunca ficou dentro de .claude/ nem de .github/
      expect(tree.filter((p) => p.endsWith("ai-sdk.config.yaml")), host).toEqual([]);
      expect(tree, host).toContain(".github/artifacts/");
      if (host === "claude") expect(tree.filter((p) => p.startsWith(".claude/") && /chatmodes|artifacts/.test(p))).toEqual([]);
      else expect(tree).toContain(".github/chatmodes/");
    }
  });

  it("sem TemplateSource → manifest local montado do estado, origem 'local'", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "stepUpdate", payload: { projectName: "loja", hostAdapter: "claude", frontendStack: "react-vite" } });
    await session.handle({ type: "fetchTemplate", templateId: `${BRAND.templatePrefix}python-api` });
    const [, msg] = host.log[0] as [string, Extract<HostToWizardMessage, { type: "templateManifest" }>];
    expect(msg.source).toBe("local");
    expect(msg.manifest.generatedTree).toContain(".claude/agents/");
    expect(msg.manifest.generatedTree).toContain("code/apps/loja-web/");
    expect(msg.manifest.description).toBe("FastAPI + React + Vite · Host: claude · Preview gerado localmente.");
  });
});

/** Pasta aberta no editor: com ela, o projeto novo nasce dentro dela quando a pessoa não escolhe outro lugar. */
const OPEN_FOLDER = new FixedWorkspaceRoot("/sintetico/aberta");

describe("WizardSession — submit greenfield", () => {
  it("estado inválido → validationError com os fieldErrors do zod, sem comando", async () => {
    const host = new FakeHost();
    await new WizardSession(host).handle({ type: "submit" });
    expect(host.log).toHaveLength(1);
    const [kind, msg] = host.log[0] as [string, HostToWizardMessage];
    expect(kind).toBe("postMessage");
    expect(msg.type).toBe("validationError");
  });

  it("estado válido → _generateStructure com o estado parseado e dispose", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit" });
    expect(host.log.map((e) => e[0])).toEqual(["executeCommand", "dispose"]);
    expect(host.log[0]![1]).toBe(`${BRAND.commandPrefix}._generateStructure`);
  });

  it("gerador lançando → generationError com a mensagem, painel aberto", async () => {
    const host = new FakeHost();
    host.commandError = new Error("falha sintética");
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit" });
    expect(host.log.at(-1)).toEqual(["postMessage", { type: "generationError", message: "falha sintética" }]);
    expect(host.log.some((e) => e[0] === "dispose")).toBe(false);
  });
});

describe("WizardSession — onde criar o projeto novo (F4.3)", () => {
  it("REGRESSÃO: sem pasta aberta e sem lugar escolhido, o projeto novo não é criado na pasta pessoal: validationError pede onde criar e nenhum comando roda", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit" });
    expect(host.log).toEqual([["postMessage", { type: "validationError", errors: { targetDirectory: ["Escolha onde criar o projeto."] } }]]);
  });

  it("um lugar só de espaços conta como não escolhido", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "stepUpdate", payload: { ...VALID, targetDirectory: "   " } });
    await session.handle({ type: "submit" });
    expect(host.log.map((e) => e[0])).toEqual(["postMessage"]);
  });

  it("sem pasta aberta, com o lugar escolhido, gera nesse lugar", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host);
    await session.handle({ type: "stepUpdate", payload: { ...VALID, targetDirectory: "/sintetico/escolhida" } });
    await session.handle({ type: "submit" });
    expect(host.log.map((e) => e[0])).toEqual(["executeCommand", "dispose"]);
    expect(host.log[0]![2]).toMatchObject({ targetDirectory: "/sintetico/escolhida" });
  });

  it("com pasta aberta, gera sem lugar escolhido (o gerador põe o projeto dentro da pasta aberta)", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit" });
    expect(host.log.map((e) => e[0])).toEqual(["executeCommand", "dispose"]);
  });
});

describe("WizardSession — instalação concluída com o painel aberto (F4.3, aditiva)", () => {
  it("submit com keepOpen: o painel não fecha e o host diz onde a estrutura ficou; a pasta nova dentro da pasta aberta não é a pasta aberta", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit", keepOpen: true });
    expect(host.log.map((e) => e[0])).toEqual(["executeCommand", "postMessage"]);
    expect(host.log[1]).toEqual(["postMessage", { type: "installed", mode: "greenfield", folder: "/sintetico/aberta/loja-demo", hostAdapter: "claude", folderIsOpen: false }]);
  });

  it("o lugar escolhido ser a própria pasta aberta conta como pasta aberta (então o Cockpit abre ali)", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID, targetDirectory: "/sintetico/aberta" } });
    await session.handle({ type: "submit", keepOpen: true });
    expect(host.log.at(-1)).toEqual(["postMessage", { type: "installed", mode: "greenfield", folder: "/sintetico/aberta", hostAdapter: "claude", folderIsOpen: true }]);
  });

  it("projeto existente: devolve a pasta instalada e o host da instalação", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, validation({ valid: true }), new FixedWorkspaceRoot("/sintetico/ws"));
    await session.handle({ type: "switchToBrownfield" });
    await session.handle({ type: "stepUpdate", payload: { targetDirectory: "/sintetico/ws", hostAdapter: "claude" } });
    host.log = [];
    await session.handle({ type: "submit", keepOpen: true });
    expect(host.log.map((e) => e[0])).toEqual(["executeCommand", "postMessage"]);
    expect(host.log[1]).toEqual(["postMessage", { type: "installed", mode: "brownfield", folder: "/sintetico/ws", hostAdapter: "claude", folderIsOpen: true }]);
  });

  it("erro do gerador com keepOpen: generationError, e nenhum 'installed'", async () => {
    const host = new FakeHost();
    host.commandError = new Error("disco cheio");
    const session = new WizardSession(host, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit", keepOpen: true });
    expect(host.log.at(-1)).toEqual(["postMessage", { type: "generationError", message: "disco cheio" }]);
    expect(host.log.some((e) => (e[1] as { type?: string })?.type === "installed")).toBe(false);
  });

  it("avisa o host quando a instalação termina com sucesso (com e sem keepOpen), e não quando falha: é o que refaz o convite da barra lateral", async () => {
    const ok = new FakeHost();
    const session = new WizardSession(ok, undefined, undefined, OPEN_FOLDER);
    await session.handle({ type: "stepUpdate", payload: { ...VALID } });
    await session.handle({ type: "submit" });
    await session.handle({ type: "submit", keepOpen: true });
    expect(ok.installedCalls).toBe(2);
    const failing = new FakeHost();
    failing.commandError = new Error("disco cheio");
    const other = new WizardSession(failing, undefined, undefined, OPEN_FOLDER);
    await other.handle({ type: "stepUpdate", payload: { ...VALID } });
    await other.handle({ type: "submit", keepOpen: true });
    expect(failing.installedCalls).toBe(0);
  });

  it("openCockpit executa o comando de abrir o Cockpit", async () => {
    const host = new FakeHost();
    await new WizardSession(host).handle({ type: "openCockpit" });
    expect(host.log).toEqual([["executeCommand", `${BRAND.commandPrefix}.openCockpitNext`]]);
  });
});

describe("WizardSession — submit brownfield", () => {
  async function brownfield(host: FakeHost, check: WorkspaceValidation, dir = "/sintetico/ws"): Promise<WizardSession> {
    const session = new WizardSession(host, undefined, validation(check));
    await session.handle({ type: "switchToBrownfield" });
    await session.handle({ type: "stepUpdate", payload: { targetDirectory: `  ${dir}  ` } });
    host.log = [];
    return session;
  }

  it("sem pasta → validationError pedindo a pasta vazia", async () => {
    const host = new FakeHost();
    const session = new WizardSession(host, undefined, validation({ valid: true }));
    await session.handle({ type: "switchToBrownfield" });
    host.log = [];
    await session.handle({ type: "submit" });
    expect(host.log).toEqual([["postMessage", { type: "validationError", errors: { targetDirectory: ["Selecione a pasta vazia do workspace"] } }]]);
  });

  it("pasta inválida → validationError com o motivo da validação", async () => {
    const host = new FakeHost();
    const session = await brownfield(host, { valid: false, reason: "é um repositório" });
    await session.handle({ type: "submit" });
    expect(host.log).toEqual([["postMessage", { type: "validationError", errors: { targetDirectory: ["é um repositório"] } }]]);
  });

  it("pasta que pede confirmação: recusar não instala e devolve generationError", async () => {
    const host = new FakeHost();
    const session = await brownfield(host, { valid: true, requiresConfirmation: true, reason: "pasta com .claude/" });
    await session.handle({ type: "submit" });
    expect(host.log.map((e) => e[0])).toEqual(["confirm", "postMessage"]);
    expect(host.log[0]).toEqual(["confirm", `${BRAND.displayName}: pasta com .claude/`, "Instalar mesmo assim"]);
  });

  it("pasta vazia → _installAgentStructure(basename, pasta sem espaços, host da tela, frameworks default) e dispose", async () => {
    const host = new FakeHost();
    const session = await brownfield(host, { valid: true });
    await session.handle({ type: "submit" });
    expect(host.log).toEqual([
      ["executeCommand", `${BRAND.commandPrefix}._installAgentStructure`, "ws", "/sintetico/ws", "copilot", ["dora-4keys"]],
      ["dispose"],
    ]);
  });

  it("retomada → o host vem do workspace, não da tela", async () => {
    const host = new FakeHost();
    host.workspaceHost = "claude";
    const session = await brownfield(host, { valid: true, resume: true });
    await session.handle({ type: "stepUpdate", payload: { hostAdapter: "copilot" } });
    await session.handle({ type: "submit" });
    expect(host.log[0]).toEqual(["workspaceHostAdapter", "/sintetico/ws"]);
    expect(host.log[1]).toEqual(["executeCommand", `${BRAND.commandPrefix}._installAgentStructure`, "ws", "/sintetico/ws", "claude", ["dora-4keys"]]);
  });
});
