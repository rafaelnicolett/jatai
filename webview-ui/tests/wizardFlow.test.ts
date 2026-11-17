import { describe, it, expect, beforeAll } from "vitest";
import type { TemplateManifest, WizardBoot, WizardMessage, WizardStep } from "@shared/wizard-protocol";
import { BRAND } from "@data";
import { getBrownfieldSchema, getWizardSchema } from "../../src/wizard/wizard-schema";
import { WizardFlow, type WizardBridge } from "../src/apps/wizard/WizardFlow";
import type { Workspace } from "../src/apps/wizard/journey";

/**
 * `WizardFlow` — a jornada do Wizard sem DOM (F4.3). A sequência de mensagens
 * ao host, roteiro a roteiro, está em `wizard-parity.test.tsx`, e o DOM em
 * `WizardApp.test.tsx`. Aqui ficam as regras: o que impede de avançar, a troca
 * de modo, a restauração ao recarregar e as correções dos bugs que o Wizard
 * legado deixou pinados (os testes `REGRESSÃO:`).
 */

class RecordingBridge implements WizardBridge {
  posted: WizardMessage[] = [];
  screens: string[] = [];
  log: string[] = [];
  constructor(private readonly _saved?: { screen: string }) {}
  postMessage(msg: WizardMessage): void {
    this.posted.push(msg);
    this.log.push(`post:${msg.type}`);
  }
  setState(state: { screen: string }): void {
    this.screens.push(state.screen);
    this.log.push(`setState:${state.screen}`);
  }
  getState(): { screen: string } | undefined {
    return this._saved;
  }
}

let greenfield: readonly WizardStep[];
let brownfield: readonly WizardStep[];

beforeAll(async () => {
  greenfield = await getWizardSchema();
  brownfield = await getBrownfieldSchema();
});

const OPEN: Workspace = { folder: "/sintetico/aberta", folderCount: 1 };
const NONE: Workspace = { folder: null, folderCount: 0 };

interface OpenOptions {
  state?: WizardBoot["state"];
  saved?: { screen: string };
  workspace?: Workspace;
  modeChosen?: boolean;
}

function open(mode: "greenfield" | "brownfield", options: OpenOptions = {}): { flow: WizardFlow; bridge: RecordingBridge } {
  const bridge = new RecordingBridge(options.saved);
  const boot: WizardBoot = {
    schema: mode === "brownfield" ? brownfield : greenfield,
    state: options.state ?? {},
    brownfield: mode === "brownfield",
    brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
    workspace: options.workspace ?? OPEN,
    ...(options.modeChosen ? { modeChosen: true } : {}),
  };
  const flow = new WizardFlow(boot, bridge);
  flow.start();
  return { flow, bridge };
}

const manifestFor = (stack: string): TemplateManifest => ({ id: `t-${stack}`, name: `t-${stack}`, stack, version: "local", description: `prévia de ${stack}`, tags: [], rubricsAvailable: true, generatedTree: ["a/"] });

/** Projeto novo até a revisão, com a prévia do backend escolhido já chegada. */
function greenfieldAtReview(backend = "python-api", options: OpenOptions = {}): { flow: WizardFlow; bridge: RecordingBridge } {
  const opened = open("greenfield", options);
  const { flow } = opened;
  flow.next();
  flow.chooseMode("greenfield");
  flow.next();
  flow.choose("hostAdapter", "claude");
  flow.next();
  flow.input("projectName", "loja");
  flow.input("startupIdea", "uma vitrine");
  flow.next();
  flow.choose("domain", "ecommerce");
  flow.next();
  flow.choose("backendStack", backend);
  flow.choose("backendArchitecture", "hexagonal");
  flow.next();
  flow.choose("frontendStack", "none");
  flow.next();
  flow.choose("database", "none");
  flow.choose("cloud", "none");
  flow.choose("cicd", "none");
  flow.next();
  flow.next();
  expect(flow.view.screen).toBe("revisao");
  flow.receive({ type: "templateManifest", manifest: manifestFor(backend), source: "local" });
  return opened;
}

/** Projeto existente até a revisão (a pasta escolhida pelo seletor). */
function brownfieldAtReview(): { flow: WizardFlow; bridge: RecordingBridge } {
  const opened = open("brownfield");
  const { flow } = opened;
  flow.next();
  flow.next();
  flow.choose("hostAdapter", "claude");
  flow.next();
  flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
  flow.next();
  flow.next();
  flow.next();
  expect(flow.view.screen).toBe("revisao");
  return opened;
}

describe("WizardFlow — abertura e escolha do modo", () => {
  it("abre na abertura, sem 'Voltar', e avança para a escolha do modo", () => {
    const { flow } = open("greenfield");
    expect(flow.view.screen).toBe("abertura");
    expect(flow.view.backDisabled).toBe(true);
    expect(flow.view.nextLabel).toBe("Começar");
    expect(flow.view.nextDisabled).toBe(false);
    flow.next();
    expect(flow.view.screen).toBe("modo");
  });

  it("a escolha do modo não deixa avançar antes de escolher, e diz por quê", () => {
    const { flow } = open("greenfield");
    flow.next();
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.issue).toBe("Escolha como você quer começar.");
    flow.chooseMode("greenfield");
    expect(flow.view.nextDisabled).toBe(false);
  });

  it("escolher o mesmo modo do painel avança sem mensagem nenhuma", () => {
    const { flow, bridge } = open("greenfield");
    flow.next();
    flow.chooseMode("greenfield");
    flow.next();
    expect(flow.view.screen).toBe("harness");
    expect(bridge.log).toEqual(["setState:modo", "setState:harness"]);
  });

  it("REGRESSÃO (L6): 'Projeto existente' + Continuar pede switchToBrownfield de uma vez, sem mostrar nenhum passo do projeto novo", () => {
    const { flow, bridge } = open("greenfield");
    flow.next();
    flow.chooseMode("brownfield");
    bridge.log.length = 0;
    flow.next();
    expect(bridge.log).toEqual(["post:switchToBrownfield"]);
    expect(flow.view.screen).toBe("modo");
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.backDisabled).toBe(true);
  });

  it("enquanto o painel troca de modo, um segundo 'Continuar' não manda a troca de novo", () => {
    const { flow, bridge } = open("greenfield");
    flow.next();
    flow.chooseMode("brownfield");
    flow.next();
    flow.next();
    expect(bridge.log.filter((entry) => entry === "post:switchToBrownfield")).toHaveLength(1);
  });

  it("depois da troca de modo o painel reabre no harness, com o modo já marcado", () => {
    const brown = open("brownfield");
    expect(brown.flow.view.screen).toBe("harness");
    expect(brown.flow.view.choice).toBe("brownfield");
    const green = open("greenfield", { modeChosen: true });
    expect(green.flow.view.screen).toBe("harness");
    expect(green.flow.view.choice).toBe("greenfield");
  });

  it("REGRESSÃO (GAP-20): no projeto existente dá para voltar à escolha do modo e trocar de ideia (switchToGreenfield)", () => {
    const { flow, bridge } = open("brownfield");
    flow.back();
    expect(flow.view.screen).toBe("modo");
    expect(flow.view.choice).toBe("brownfield");
    flow.chooseMode("greenfield");
    bridge.log.length = 0;
    flow.next();
    expect(bridge.log).toEqual(["post:switchToGreenfield"]);
    expect(flow.view.backDisabled).toBe(true);
  });
});

describe("WizardFlow — recarregar (GAP-20)", () => {
  it("REGRESSÃO (GAP-20): recarregar o webview restaura a tela e o que foi preenchido", () => {
    const first = open("greenfield");
    first.flow.next();
    first.flow.chooseMode("greenfield");
    first.flow.next();
    first.flow.choose("hostAdapter", "claude");
    first.flow.next();
    first.flow.input("projectName", "loja-demo");
    first.flow.input("startupIdea", "uma vitrine");
    first.flow.next();
    const saved = { screen: first.bridge.screens.at(-1)! };
    expect(saved).toEqual({ screen: "dominio" });
    // o host guarda o estado da sessão e o devolve no bootstrap do painel recarregado
    const state = Object.assign({}, ...first.bridge.posted.filter((m) => m.type === "stepUpdate").map((m) => (m as Extract<WizardMessage, { type: "stepUpdate" }>).payload));
    const reloaded = open("greenfield", { state, saved });
    expect(reloaded.flow.view.screen).toBe("dominio");
    expect(reloaded.flow.view.values).toMatchObject({ projectName: "loja-demo", startupIdea: "uma vitrine", hostAdapter: "claude" });
    expect(reloaded.flow.view.stepLabel).toBe(`Passo 5 de ${reloaded.flow.view.total}`);
  });

  it("a tela salva nunca pula uma tela com pendência", () => {
    const { flow } = open("greenfield", { state: { hostAdapter: "claude" }, saved: { screen: "infra" } });
    expect(flow.view.screen).toBe("projeto");
  });

  it("tela salva que não existe nesta jornada, ou nenhuma tela salva, abre na abertura", () => {
    expect(open("greenfield", { saved: { screen: "pasta" } }).flow.view.screen).toBe("abertura");
    expect(open("greenfield").flow.view.screen).toBe("abertura");
  });
});

describe("WizardFlow — nome do projeto (H-BUG-20)", () => {
  function atProject(): { flow: WizardFlow; bridge: RecordingBridge } {
    const opened = open("greenfield", { modeChosen: true });
    opened.flow.choose("hostAdapter", "claude");
    opened.flow.next();
    expect(opened.flow.view.screen).toBe("projeto");
    return opened;
  }

  it("REGRESSÃO (H-BUG-20): nome inválido é recusado na hora, com o motivo e um nome sugerido, e não deixa avançar", () => {
    const { flow } = atProject();
    flow.input("projectName", "Loja Demo");
    flow.input("startupIdea", "x");
    expect(flow.view.fieldError).toEqual({ reason: "O nome só aceita letras minúsculas, números e hífen.", suggestion: "loja-demo" });
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.issue).toBe("O nome só aceita letras minúsculas, números e hífen.");
    flow.next();
    expect(flow.view.screen).toBe("projeto");
  });

  it("aceitar a sugestão grava o nome sugerido, manda ao host e libera o avanço", () => {
    const { flow, bridge } = atProject();
    flow.input("projectName", "Meu App!");
    flow.input("startupIdea", "x");
    const epoch = flow.view.inputEpoch;
    flow.applySuggestion();
    expect(flow.view.values.projectName).toBe("meu-app");
    expect(bridge.posted.at(-1)).toEqual({ type: "stepUpdate", payload: { projectName: "meu-app" } });
    expect(flow.view.fieldError).toBeNull();
    expect(flow.view.nextDisabled).toBe(false);
    expect(flow.view.inputEpoch).toBe(epoch + 1);
  });

  it("campo vazio não mostra erro, mas não deixa avançar; nome válido sem a ideia pede a ideia; com os dois libera", () => {
    const { flow } = atProject();
    expect(flow.view.fieldError).toBeNull();
    expect(flow.view.issue).toBe("Informe o nome do projeto.");
    flow.input("projectName", "loja-demo");
    expect(flow.view.issue).toBe("Descreva o produto em uma ou duas frases.");
    flow.input("startupIdea", "uma vitrine");
    expect(flow.view.nextDisabled).toBe(false);
  });

  it("nome com mais de 63 caracteres é recusado com o limite no motivo", () => {
    const { flow } = atProject();
    flow.input("projectName", "a".repeat(64));
    expect(flow.view.fieldError?.reason).toBe("O nome tem no máximo 63 caracteres.");
  });
});

describe("WizardFlow — pasta (H-BUG-52) e onde criar o projeto", () => {
  it("REGRESSÃO (H-BUG-52): a pasta do workspace é obrigatória: sem ela 'Continuar' fica desabilitado, com o motivo; escolhida, habilita", () => {
    const { flow, bridge } = open("brownfield");
    flow.choose("hostAdapter", "claude");
    flow.next();
    expect(flow.view.screen).toBe("pasta");
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.issue).toBe("Escolha a pasta do workspace para continuar.");
    bridge.log.length = 0;
    flow.next();
    expect(bridge.log).toEqual([]);
    flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
    expect(flow.view.nextDisabled).toBe(false);
  });

  it("'Usar a pasta aberta' grava a pasta aberta como o workspace", () => {
    const { flow, bridge } = open("brownfield");
    flow.choose("hostAdapter", "claude");
    flow.next();
    flow.useOpenFolder();
    expect(bridge.posted.at(-1)).toEqual({ type: "stepUpdate", payload: { targetDirectory: "/sintetico/aberta" } });
    expect(flow.view.nextDisabled).toBe(false);
  });

  function atLocal(workspace: Workspace): { flow: WizardFlow; bridge: RecordingBridge } {
    const opened = open("greenfield", { modeChosen: true, workspace, state: { hostAdapter: "claude", projectName: "loja", startupIdea: "x", domain: "ecommerce", backendStack: "python-api", backendArchitecture: "hexagonal", frontendStack: "none", database: "none", cloud: "none", cicd: "none" }, saved: { screen: "local" } });
    expect(opened.flow.view.screen).toBe("local");
    return opened;
  }

  it("sem pasta aberta, a Jataí pede onde criar: não propõe a pasta pessoal e não deixa avançar antes de escolher", () => {
    const { flow } = atLocal(NONE);
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.issue).toBe("Escolha onde criar o projeto para continuar.");
    flow.receive({ type: "folderPicked", folder: "/sintetico/escolhida" });
    expect(flow.view.nextDisabled).toBe(false);
  });

  it("com uma pasta aberta, o projeto nasce dentro dela e o avanço está livre; escolher outro lugar troca o destino", () => {
    const { flow } = atLocal(OPEN);
    expect(flow.view.nextDisabled).toBe(false);
    flow.next();
    expect(flow.view.review?.destination).toEqual({ path: "/sintetico/aberta/loja", note: "Uma pasta nova dentro da pasta aberta." });
    flow.back();
    flow.receive({ type: "folderPicked", folder: "/sintetico/outra" });
    flow.next();
    expect(flow.view.review?.destination.path).toBe("/sintetico/outra");
  });

  it("'Criar dentro da pasta aberta' volta ao destino padrão, mandando o lugar vazio ao host", () => {
    const { flow, bridge } = atLocal(OPEN);
    flow.receive({ type: "folderPicked", folder: "/sintetico/outra" });
    flow.useDefaultFolder();
    expect(bridge.posted.at(-1)).toEqual({ type: "stepUpdate", payload: { targetDirectory: "" } });
    expect(flow.view.values.targetDirectory).toBe("");
  });
});

describe("WizardFlow — frameworks de maturidade", () => {
  it("ao entrar sem nada marcado, marca o primeiro (DORA 4 Keys) e manda ao host; somar um framework o mantém", () => {
    const { flow, bridge } = open("brownfield");
    flow.next();
    flow.next();
    flow.choose("hostAdapter", "claude");
    flow.next();
    flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
    flow.next();
    flow.next();
    expect(flow.view.screen).toBe("maturidade");
    expect(bridge.posted.at(-1)).toEqual({ type: "stepUpdate", payload: { maturityFrameworks: ["dora-4keys"] } });
    flow.toggle("maturityFrameworks", "tech-radar");
    expect(flow.view.values.maturityFrameworks).toEqual(["dora-4keys", "tech-radar"]);
  });
});

describe("WizardFlow — prévia do template (H-BUG-25)", () => {
  const fetches = (bridge: RecordingBridge): string[] => bridge.posted.filter((m): m is Extract<WizardMessage, { type: "fetchTemplate" }> => m.type === "fetchTemplate").map((m) => m.templateId);

  it("entrar na revisão sem manifest pede o do backend escolhido; o que chega vira stepUpdate e prévia", () => {
    const { flow, bridge } = greenfieldAtReview("java-spring");
    expect(fetches(bridge)).toEqual([`${BRAND.templatePrefix}java-spring`]);
    expect(bridge.posted.at(-1)).toEqual({ type: "stepUpdate", payload: { resolvedTemplate: manifestFor("java-spring") } });
    expect(flow.view.manifest?.manifest.stack).toBe("java-spring");
  });

  it("REGRESSÃO (H-BUG-25): trocar o backend e voltar à revisão pede o manifest de novo, descarta o antigo e só deixa instalar com o novo", () => {
    const { flow, bridge } = greenfieldAtReview("python-api");
    while (flow.view.screen !== "backend") flow.back();
    flow.choose("backendStack", "java-spring");
    while (flow.view.screen !== "revisao") flow.next();
    expect(fetches(bridge)).toEqual([`${BRAND.templatePrefix}python-api`, `${BRAND.templatePrefix}java-spring`]);
    expect(flow.view.manifest).toBeNull();
    expect(flow.view.loadingTemplate).toBe(true);
    expect(flow.view.nextDisabled).toBe(true);
    flow.receive({ type: "templateManifest", manifest: manifestFor("java-spring"), source: "local" });
    expect(flow.view.manifest?.manifest.stack).toBe("java-spring");
    expect(flow.view.nextDisabled).toBe(false);
  });

  it.each([["frontendStack", "flutter", "frontend"], ["hostAdapter", "copilot", "harness"], ["cloud", "aws", "infra"]] as const)("REGRESSÃO (H-BUG-25): trocar %s também refaz a prévia, porque o manifest local sai dessas escolhas", (key, value, screen) => {
    const { flow, bridge } = greenfieldAtReview("python-api");
    while (flow.view.screen !== screen) flow.back();
    flow.choose(key, value);
    if (key === "frontendStack") flow.choose("frontendArchitecture", "mvc");
    while (flow.view.screen !== "revisao") flow.next();
    expect(fetches(bridge)).toHaveLength(2);
    expect(flow.view.manifest).toBeNull();
  });

  it("sem mudar nenhuma escolha, voltar e avançar reaproveita a prévia (nenhum pedido novo)", () => {
    const { flow, bridge } = greenfieldAtReview("python-api");
    flow.back();
    flow.back();
    flow.next();
    flow.next();
    expect(flow.view.screen).toBe("revisao");
    expect(fetches(bridge)).toHaveLength(1);
    expect(flow.view.manifest?.manifest.stack).toBe("python-api");
  });
});

describe("WizardFlow — instalação e erros", () => {
  it("'Instalar' envia submit, mostra que a Jataí está trabalhando e trava o avanço e o retorno", () => {
    const { flow, bridge } = brownfieldAtReview();
    expect(flow.view.nextLabel).toBe("Instalar na pasta");
    flow.next();
    expect(bridge.posted.at(-1)).toEqual({ type: "submit", keepOpen: true });
    expect(flow.view.phase).toBe("installing");
    expect(flow.view.live).toBe("Instalando…");
    expect(flow.view.nextDisabled).toBe(true);
    expect(flow.view.backDisabled).toBe(true);
    flow.next();
    expect(bridge.posted.filter((m) => m.type === "submit")).toHaveLength(1);
  });

  it("a revisão do projeto novo se chama 'Criar o projeto'", () => {
    expect(greenfieldAtReview().flow.view.nextLabel).toBe("Criar o projeto");
  });

  it("REGRESSÃO (H-BUG-20): validationError reabilita o botão e leva a pessoa à tela do campo, com o motivo", () => {
    const { flow } = brownfieldAtReview();
    flow.next();
    expect(flow.view.nextDisabled).toBe(true);
    flow.receive({ type: "validationError", errors: { targetDirectory: ["Pasta não está vazia"] } });
    expect(flow.view.screen).toBe("pasta");
    expect(flow.view.errors).toEqual(["Pasta não está vazia"]);
    expect(flow.view.phase).toBe("editing");
    expect(flow.view.nextDisabled).toBe(false);
  });

  it("REGRESSÃO (H-BUG-20): erro genérico do zod ('Invalid') vira texto em português, sem o nome interno do campo", () => {
    const { flow } = brownfieldAtReview();
    flow.next();
    flow.receive({ type: "validationError", errors: { hostAdapter: ["Invalid"] } });
    expect(flow.view.screen).toBe("harness");
    expect(flow.view.errors).toEqual(["Valor inválido."]);
  });

  it("generationError devolve a pessoa à revisão, com o motivo e a opção de tentar de novo", () => {
    const { flow } = brownfieldAtReview();
    flow.next();
    flow.receive({ type: "generationError", message: "disco cheio" });
    expect(flow.view.screen).toBe("revisao");
    expect(flow.view.phase).toBe("editing");
    expect(flow.view.errors).toEqual(["A instalação não terminou. disco cheio"]);
    expect(flow.view.nextLabel).toBe("Tentar de novo");
    expect(flow.view.nextDisabled).toBe(false);
  });

  const INSTALLED = { type: "installed", mode: "brownfield", folder: "/sintetico/ws", hostAdapter: "claude", folderIsOpen: true } as const;

  it("a instalação que termina mostra o passo 'Pronto': onde ficou, o anúncio e o botão de abrir o Cockpit", () => {
    const { flow } = brownfieldAtReview();
    flow.next();
    flow.receive(INSTALLED);
    expect(flow.view.phase).toBe("installed");
    expect(flow.view.title).toBe("Pronto");
    expect(flow.view.stepLabel).toBe("Concluído");
    expect(flow.view.live).toBe("Instalação concluída.");
    expect(flow.view.installed).toEqual({ mode: "brownfield", folder: "/sintetico/ws", hostAdapter: "claude", folderIsOpen: true });
    expect(flow.view.nextLabel).toBe("Abrir o Cockpit");
    expect(flow.view.nextDisabled).toBe(false);
    expect(flow.view.backDisabled).toBe(true);
  });

  it("no 'Pronto', o botão principal abre o Cockpit quando a pasta é a aberta (openCockpit) e só fecha quando não é (cancel)", () => {
    const open = brownfieldAtReview();
    open.flow.next();
    open.flow.receive(INSTALLED);
    open.flow.next();
    expect(open.bridge.posted.at(-1)).toEqual({ type: "openCockpit" });
    const other = brownfieldAtReview();
    other.flow.next();
    other.flow.receive({ ...INSTALLED, folderIsOpen: false });
    expect(other.flow.view.nextLabel).toBe("Fechar");
    other.flow.next();
    expect(other.bridge.posted.at(-1)).toEqual({ type: "cancel" });
  });

  it("no 'Pronto' não se volta nem se instala de novo", () => {
    const { flow, bridge } = brownfieldAtReview();
    flow.next();
    flow.receive(INSTALLED);
    flow.back();
    expect(flow.view.phase).toBe("installed");
    expect(bridge.posted.filter((m) => m.type === "submit")).toHaveLength(1);
  });

  it("cancelar manda cancel ao host", () => {
    const { flow, bridge } = open("greenfield");
    flow.cancel();
    expect(bridge.log).toEqual(["post:cancel"]);
  });
});
