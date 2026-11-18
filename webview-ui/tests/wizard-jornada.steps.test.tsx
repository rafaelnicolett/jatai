import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { act } from "react";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { HostToWizardMessage, WizardBoot, WizardMessage, WizardStep } from "@shared/wizard-protocol";
import { BRAND } from "@data";
import { scenarioTitles } from "../../tests/features/gherkin";
import { WizardSession, type WizardHostPort } from "../../src/wizard/WizardSession";
import { getBrownfieldSchema, getWizardSchema } from "../../src/wizard/wizard-schema";
import { FixedWorkspaceRoot } from "../../src/adapters/workspace/WorkspaceRoot";
import { RecordingContextKeys } from "../../src/adapters/context/ContextKeys";
import { IS_WORKSPACE_KEY, bindWorkspaceContext } from "../../src/extension/startup/workspaceContext";
import { WizardLauncher, type WizardHandle } from "../../src/wizard/WizardLauncher";
import type { WorkspaceActivationFacts } from "../../src/data/workspace-activation";
import type { HostAdapter } from "../../src/types";
import type { WorkspaceValidation } from "../../src/wizard/workspace-validation";
import { WizardApp } from "../src/apps/wizard/WizardApp";
import { WizardFlow } from "../src/apps/wizard/WizardFlow";
import type { Workspace } from "../src/apps/wizard/journey";
import { cleanup, key, mount, rulesMatching, source } from "./support/component";

/**
 * Step definitions de `tests/features/wizard-jornada.feature` (F4.3 e G9).
 *
 * O `.feature` vem primeiro (BDD): cada commit que entrega um pedaço da
 * jornada tira da lista de pendentes os cenários que ele cobre e põe o seu
 * step definition em `SCENARIOS`. Cenário que não está em nenhuma das duas
 * listas reprova, e a frente só fecha com `PENDENTES` vazia.
 *
 * Os steps ligam o fluxo do Wizard (webview) à sessão do host, sem o VS Code
 * e sem `vi.mock`: dublês escritos à mão para as portas. Os cenários de tela,
 * de teclado e de leitor de tela montam o app no jsdom.
 */
const FEATURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../tests/features/wizard-jornada.feature");
const TITLES = scenarioTitles(FEATURE);

let greenfield: readonly WizardStep[];
let brownfield: readonly WizardStep[];
beforeAll(async () => {
  greenfield = await getWizardSchema();
  brownfield = await getBrownfieldSchema();
});
afterEach(cleanup);

// ── Harness: o fluxo do webview ligado à sessão do host ─────────────────────

const OPEN: Workspace = { folder: "/sintetico/aberta", folderCount: 1 };
const NONE: Workspace = { folder: null, folderCount: 0 };

class FakeHost implements WizardHostPort {
  commands: unknown[][] = [];
  commandError: Error | null = null;
  constructor(private readonly _journey: Journey) {}
  postMessage(msg: HostToWizardMessage): void {
    act(() => this._journey.flow.receive(msg));
  }
  render(schema: readonly WizardStep[]): void {
    this._journey.rerender(schema);
  }
  dispose(): void {}
  async pickFolder(): Promise<string | undefined> {
    return undefined;
  }
  async confirm(): Promise<boolean> {
    return false;
  }
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    this.commands.push([command, ...args]);
    if (this.commandError) throw this.commandError;
    return undefined;
  }
  async workspaceHostAdapter(): Promise<HostAdapter> {
    return "claude";
  }
}

class Journey {
  flow!: WizardFlow;
  readonly host = new FakeHost(this);
  readonly session: WizardSession;
  /** O que o webview mandou ao host, de todos os painéis (cada troca de modo cria um). */
  readonly sent: WizardMessage[] = [];
  /** As telas que a pessoa viu, na ordem. */
  readonly shown: string[] = [];
  private readonly _pending: Array<Promise<void>> = [];

  constructor(
    private readonly _workspace: Workspace,
    check: (dir: string) => Promise<WorkspaceValidation> = () => Promise.resolve({ valid: true })
  ) {
    this.session = new WizardSession(this.host, undefined, check, new FixedWorkspaceRoot(_workspace.folder ?? undefined, Array.from({ length: Math.max(0, _workspace.folderCount - 1) }, (_, i) => `/sintetico/outra-${i}`)));
    this.rerender(greenfield);
  }

  /** O host re-renderiza o painel: um webview novo, com o estado e o modo da sessão e sem a tela salva. */
  rerender(schema: readonly WizardStep[]): void {
    const boot: WizardBoot = {
      schema,
      state: this.session.state,
      brownfield: this.session.isBrownfield,
      brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
      workspace: this._workspace,
      modeChosen: this.session.modeChosen,
    };
    this.flow = new WizardFlow(boot, {
      postMessage: (msg) => {
        this.sent.push(msg);
        this._pending.push(this.session.handle(msg));
      },
      setState: (state) => void this.shown.push(state.screen),
      getState: () => undefined,
    });
    this.flow.start();
  }

  /** Espera o host terminar de tratar o que o webview mandou. */
  async settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.all(this._pending.splice(0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/** Abre a jornada como o host a abre; o projeto existente chega pela troca de modo, que o host trata como no uso real. */
async function journey(mode: "greenfield" | "brownfield" = "greenfield", workspace: Workspace = OPEN, check?: (dir: string) => Promise<WorkspaceValidation>): Promise<Journey> {
  const opened = new Journey(workspace, check);
  if (mode === "brownfield") await opened.session.handle({ type: "switchToBrownfield" });
  return opened;
}

const FULL_GREENFIELD: Record<string, unknown> = {
  hostAdapter: "claude", projectName: "loja-demo", startupIdea: "uma vitrine", domain: "ecommerce", backendStack: "python-api", backendArchitecture: "hexagonal",
  frontendStack: "none", database: "none", cloud: "none", cicd: "none",
};

/** Um webview aberto numa tela e com valores, para os cenários que só olham uma tela (monta o app no jsdom). */
function openAt(mode: "greenfield" | "brownfield", screen: string, state: Record<string, unknown> = {}, workspace: Workspace = OPEN): { container: HTMLElement; flow: WizardFlow } {
  const flow = new WizardFlow(
    {
      schema: mode === "brownfield" ? brownfield : greenfield,
      state,
      brownfield: mode === "brownfield",
      brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
      workspace,
      modeChosen: true,
    },
    { postMessage: () => {}, setState: () => {}, getState: () => ({ screen }) }
  );
  flow.start();
  return { container: mount(<WizardApp flow={flow} />), flow };
}

const q = (container: HTMLElement, selector: string): HTMLElement => container.querySelector<HTMLElement>(selector)!;
const radios = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
const textOf = (container: HTMLElement): string => (container.textContent ?? "").replace(/\s+/g, " ");

// ── Primeiro uso na barra lateral (G9): o manifesto e a context key, avaliados como o VS Code os avalia ──

interface ManifestView {
  id: string;
  type?: string;
  when?: string;
}
interface ManifestWelcome {
  view: string;
  contents: string;
  when?: string;
}
const MANIFEST = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8")) as {
  contributes: { views: Record<string, ManifestView[]>; viewsWelcome: ManifestWelcome[] };
};

/** As cláusulas `when` do manifesto: `==`, `>`, `!` e `&&`. */
function holds(when: string | undefined, context: Record<string, boolean | number>): boolean {
  if (when === undefined) return true;
  return when.split("&&").every((raw) => {
    const term = raw.trim();
    const compare = term.match(/^([\w.]+)\s*(==|>)\s*(\d+)$/);
    if (compare) return compare[2] === "==" ? Number(context[compare[1]!] ?? 0) === Number(compare[3]) : Number(context[compare[1]!] ?? 0) > Number(compare[3]);
    return term.startsWith("!") ? !context[term.slice(1)] : Boolean(context[term]);
  });
}

/** O que a barra lateral mostra: os conteúdos do convite e as views visíveis, dado o estado da janela. */
function sidebar(folders: number, isWorkspace: boolean): { actions: string[]; views: string[] } {
  const context = { workspaceFolderCount: folders, [IS_WORKSPACE_KEY]: isWorkspace };
  const contents = MANIFEST.contributes.viewsWelcome.filter((w) => holds(w.when, context)).map((w) => w.contents).join("\n");
  return {
    actions: [...contents.matchAll(/\[([^\]]+)\]\(command:[^)]+\)/g)].map((m) => m[1]!),
    views: Object.values(MANIFEST.contributes.views).flat().filter((v) => holds(v.when, context)).map((v) => v.id),
  };
}

/** Uma pasta de verdade no disco, com ou sem o config da marca, lida como a casca a lê. */
function folderOnDisk(withConfig: boolean): { root: string; readFacts(root: string | undefined): WorkspaceActivationFacts } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-bdd-g9-"));
  if (withConfig) fs.writeFileSync(path.join(root, BRAND.files.config), "kit_version: 1\n");
  return {
    root,
    readFacts: (dir) => ({ hasFolder: dir !== undefined, trusted: true, rootEntries: dir === undefined ? [] : fs.readdirSync(dir) }),
  };
}

/** O passo "Pronto" montado no jsdom, para os cenários que olham o texto dele. */
function openInstalled(done: { mode: "greenfield" | "brownfield"; folder: string; hostAdapter: HostAdapter; folderIsOpen: boolean }): { container: HTMLElement; flow: WizardFlow } {
  const opened = openAt("brownfield", "revisao", { hostAdapter: done.hostAdapter, targetDirectory: done.folder, maturityFrameworks: ["dora-4keys"] });
  act(() => opened.flow.next());
  act(() => opened.flow.receive({ type: "installed", ...done }));
  return opened;
}

/** A linha de um Esquema do Cenário: os valores do `[a · b · c]` do título. */
function rowOf(title: string): string[] {
  return title.slice(title.lastIndexOf("[") + 1, -1).split(" · ");
}
const titlesStartingWith = (prefix: string): string[] => TITLES.filter((t) => t.startsWith(prefix));

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "A abertura diz o que a Jataí vai fazer e o que não vai fazer": () => {
    // Quando a pessoa abre a jornada
    const { container } = openAt("greenfield", "abertura");
    const text = textOf(container);
    // Então a Jataí diz que vai instalar agentes, skills e instruções na pasta escolhida
    expect(text).toContain("Instalar agentes, skills e instruções na pasta que você escolher.");
    // E diz que nada sai do computador
    expect(text).toContain("Enviar dados para fora do seu computador: tudo roda local.");
    // E diz que os repositórios existentes não são alterados
    expect(text).toContain("Alterar os repositórios que você já tem.");
    // E diz que nada é escrito antes da revisão
    expect(text).toContain("Escrever qualquer arquivo antes de você confirmar a revisão.");
  },

  "Escolher projeto existente leva direto aos passos do projeto existente": async () => {
    // Dado que a pessoa chegou à escolha do modo
    const j = await journey();
    j.flow.next();
    expect(j.flow.view.screen).toBe("modo");
    // Quando ela escolhe "Projeto existente" e avança
    j.flow.chooseMode("brownfield");
    j.flow.next();
    await j.settle();
    // Então a Jataí troca a jornada para o projeto existente de uma só vez
    expect(j.sent.filter((m) => m.type === "switchToBrownfield")).toHaveLength(1);
    expect(j.flow.view.mode).toBe("brownfield");
    // E nenhum passo do projeto novo aparece antes do passo do harness
    expect(j.shown).toEqual(["modo"]);
    expect(j.flow.view.screen).toBe("harness");
  },

  "É possível voltar à escolha do modo e trocar de ideia": async () => {
    // Dado que a pessoa escolheu "Projeto existente" e está no passo do harness
    const j = await journey();
    j.flow.next();
    j.flow.chooseMode("brownfield");
    j.flow.next();
    await j.settle();
    expect(j.flow.view.screen).toBe("harness");
    // Quando ela volta à escolha do modo e escolhe "Projeto novo"
    j.flow.back();
    expect(j.flow.view.screen).toBe("modo");
    j.flow.chooseMode("greenfield");
    j.flow.next();
    await j.settle();
    // Então a Jataí troca a jornada para o projeto novo
    expect(j.sent.filter((m) => m.type === "switchToGreenfield")).toHaveLength(1);
    expect(j.flow.view.mode).toBe("greenfield");
    // E a pessoa segue pelos passos do projeto novo
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    expect(j.flow.view.screen).toBe("projeto");
  },

  "Recarregar a janela do Wizard devolve a pessoa ao passo em que estava": async () => {
    // Dado que a pessoa informou o nome "loja-demo" e escolheu o harness "Claude Code"
    const j = await journey();
    j.flow.next();
    j.flow.chooseMode("greenfield");
    j.flow.next();
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.input("projectName", "loja-demo");
    await j.settle();
    const saved = { screen: j.shown.at(-1)! };
    // Quando a janela do Wizard é recarregada
    const reloaded = new WizardFlow(
      { schema: greenfield, state: j.session.state, brownfield: false, brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix }, workspace: OPEN },
      { postMessage: () => {}, setState: () => {}, getState: () => saved }
    );
    // Então a pessoa volta ao mesmo passo
    expect(reloaded.view.screen).toBe("projeto");
    // E o nome "loja-demo" e o harness "Claude Code" continuam preenchidos
    expect(reloaded.view.values).toMatchObject({ projectName: "loja-demo", hostAdapter: "claude" });
  },

  "Claude e OpenCode instalam atividade (hooks/plugin), e o chat da extensão é o guia": () => {
    // Dado que a pessoa chegou ao passo do harness
    const { container } = openAt("greenfield", "harness");
    const [copilot, claude, opencode] = radios(container).map((c) => textOf(c)) as [string, string, string];
    // Quando ela compara as opções "Claude Code", "GitHub Copilot" e "OpenCode"
    // Então só Claude e OpenCode listam atividade
    expect(claude).toContain("Atividade");
    expect(claude).toContain(".claude/settings.json");
    expect(copilot).not.toContain("Atividade");
    expect(opencode).toContain("Atividade");
    expect(opencode).toContain(".opencode/plugins/jatai-activity.ts");
    // E a Jataí diz que o chat da extensão, o guia, leva ao agente jatai
    expect(textOf(q(container, '[data-wizard="harness-note"]'))).toContain(`@${BRAND.guide.name}, mostra onde você está e leva ao agente ${BRAND.participant.name}`);
    // E nenhum texto cita o chat antigo da extensão
    expect(textOf(container)).not.toMatch(/concierge|maestro/i);
  },

  "Nome de projeto válido deixa seguir": async () => {
    // Dado que a pessoa está no passo do projeto novo
    const j = await journey("greenfield");
    j.flow.next();
    j.flow.chooseMode("greenfield");
    j.flow.next();
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    expect(j.flow.view.screen).toBe("projeto");
    // Quando ela informa o nome "loja-demo" e a ideia do produto
    j.flow.input("projectName", "loja-demo");
    j.flow.input("startupIdea", "uma vitrine");
    // Então a pessoa consegue avançar
    expect(j.flow.view.nextDisabled).toBe(false);
  },

  "Trocar a stack do backend refaz a prévia da estrutura": async () => {
    // Dado que a pessoa chegou à revisão com o backend "FastAPI"
    const j = await journey("greenfield");
    j.flow.next();
    j.flow.chooseMode("greenfield");
    j.flow.next();
    for (const [k, v] of Object.entries(FULL_GREENFIELD)) j.flow.input(k, String(v));
    for (const [k, v] of Object.entries(FULL_GREENFIELD)) if (k !== "projectName" && k !== "startupIdea") j.flow.choose(k, String(v));
    while (j.flow.view.screen !== "revisao") j.flow.next();
    await j.settle();
    expect(j.flow.view.manifest?.manifest.stack).toBe("python-api");
    // Quando ela volta, escolhe o backend "Spring Boot" e chega de novo à revisão
    while (j.flow.view.screen !== "backend") j.flow.back();
    j.flow.choose("backendStack", "java-spring");
    while (j.flow.view.screen !== "revisao") j.flow.next();
    // Então a Jataí pede uma prévia nova para o backend "Spring Boot"
    expect(j.sent.filter((m) => m.type === "fetchTemplate").map((m) => (m as Extract<WizardMessage, { type: "fetchTemplate" }>).templateId)).toEqual([`${BRAND.templatePrefix}python-api`, `${BRAND.templatePrefix}java-spring`]);
    // E a pessoa só consegue instalar depois que a prévia nova chega
    expect(j.flow.view.nextDisabled).toBe(true);
    await j.settle();
    expect(j.flow.view.manifest?.manifest.stack).toBe("java-spring");
    expect(j.flow.view.nextDisabled).toBe(false);
  },

  "Sem a pasta do workspace não dá para seguir, e a Jataí diz por quê": () => {
    // Dado que a pessoa escolheu "Projeto existente" e chegou ao passo da pasta
    const { flow } = openAt("brownfield", "pasta", { hostAdapter: "claude" });
    // Quando ela ainda não escolheu nenhuma pasta
    // Então a pessoa não consegue avançar
    expect(flow.view.nextDisabled).toBe(true);
    // E a Jataí diz que falta escolher a pasta do workspace
    expect(flow.view.issue).toBe("Escolha a pasta do workspace para continuar.");
  },

  "A Jataí explica que os repositórios entram depois, pelo agente jatai": () => {
    // Dado que a pessoa escolheu "Projeto existente" e escolheu a pasta
    // Quando ela chega ao passo dos repositórios
    const { container } = openAt("brownfield", "repositorios", { hostAdapter: "claude", targetDirectory: "/sintetico/ws" });
    const text = textOf(container);
    // Então a Jataí diz que o agente jatai pergunta quais repositórios entram
    expect(text).toContain(`O agente ${BRAND.participant.name} pergunta quais repositórios entram`);
    // E diz que os repositórios ficam em "repos/" e não são alterados
    expect(text).toContain("repos/");
    expect(text).toContain(`A ${BRAND.displayName} não altera nenhum.`);
  },

  "Os frameworks de maturidade partem do DORA 4 Keys": () => {
    // Dado que a pessoa chegou ao passo dos frameworks de maturidade
    const { flow } = openAt("brownfield", "maturidade", { hostAdapter: "claude", targetDirectory: "/sintetico/ws" });
    // Quando ela soma o framework "Tech Radar"
    flow.toggle("maturityFrameworks", "tech-radar");
    // Então os frameworks escolhidos são "DORA 4 Keys" e "Tech Radar"
    expect(flow.view.values.maturityFrameworks).toEqual(["dora-4keys", "tech-radar"]);
  },

  "Sem pasta aberta, a Jataí pergunta onde criar o projeto": () => {
    // Dado que nenhuma pasta está aberta no editor
    // Quando a pessoa chega ao passo do local do projeto novo
    const { container, flow } = openAt("greenfield", "local", FULL_GREENFIELD, NONE);
    // Então a Jataí pede que ela escolha onde criar
    expect(textOf(container)).toContain("Nenhuma pasta está aberta. Escolha onde criar o projeto.");
    // E a pessoa não consegue avançar antes de escolher
    expect(flow.view.nextDisabled).toBe(true);
    // E a Jataí não propõe a pasta pessoal como lugar do projeto
    expect(textOf(container)).not.toMatch(/~|pasta pessoal|home/i);
    expect(flow.view.review).toBeNull();
  },

  "Sem pasta aberta e sem lugar escolhido, a Jataí não cria o projeto na pasta pessoal": async () => {
    // Dado que nenhuma pasta está aberta no editor
    // E que o estado do projeto novo está completo, sem lugar escolhido
    const j = await journey("greenfield", NONE);
    for (const [k, v] of Object.entries(FULL_GREENFIELD)) await j.session.handle({ type: "stepUpdate", payload: { [k]: v } });
    const received: HostToWizardMessage[] = [];
    const original = j.host.postMessage.bind(j.host);
    j.host.postMessage = (msg) => {
      received.push(msg);
      original(msg);
    };
    // Quando o Wizard pede para criar o projeto
    await j.session.handle({ type: "submit" });
    // Então a Jataí recusa e pede que a pessoa escolha onde criar
    expect(received).toEqual([{ type: "validationError", errors: { targetDirectory: ["Escolha onde criar o projeto."] } }]);
    // E nenhuma geração é iniciada
    expect(j.host.commands).toEqual([]);
  },

  "Com uma pasta aberta, o projeto nasce dentro dela e a pessoa pode escolher outro lugar": () => {
    // Dado que a pasta "/trabalho/oficina" está aberta no editor
    // Quando a pessoa chega ao passo do local do projeto novo com o nome "loja-demo"
    const { container, flow } = openAt("greenfield", "local", FULL_GREENFIELD, { folder: "/trabalho/oficina", folderCount: 1 });
    // Então a Jataí mostra que o projeto nasce em "/trabalho/oficina/loja-demo"
    expect(textOf(q(container, '[data-wizard="folder-path"]'))).toContain("/trabalho/oficina/loja-demo");
    // E a pessoa pode escolher outro lugar
    expect(q(container, '[data-wizard="pick-folder"]').textContent).toBe("Escolher outra pasta…");
    expect(flow.view.nextDisabled).toBe(false);
  },

  "Com mais de uma pasta aberta, a Jataí avisa que a v1 usa uma pasta por janela": () => {
    // Dado que duas pastas estão abertas no editor
    // Quando a pessoa chega ao passo do local do projeto novo
    const { container } = openAt("greenfield", "local", FULL_GREENFIELD, { folder: "/trabalho/a", folderCount: 2 });
    const notice = textOf(q(container, '[data-wizard="multi-root"]'));
    // Então a Jataí avisa que a v1 trabalha com uma pasta por janela
    expect(notice).toContain(`A v1 da ${BRAND.displayName} trabalha com uma pasta por janela`);
    // E diz que usa a primeira pasta aberta
    expect(notice).toContain("usa a primeira");
  },

  "A revisão lista o que será escrito e onde, e nada é escrito enquanto a pessoa revisa": async () => {
    // Dado que a pessoa preencheu todos os passos do projeto existente com o harness "Claude Code"
    const j = await journey("brownfield");
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
    j.flow.next();
    j.flow.next();
    // Quando ela chega à revisão
    j.flow.next();
    await j.settle();
    expect(j.flow.view.screen).toBe("revisao");
    // Então a Jataí lista o que será escrito, com a pasta de destino
    expect(j.flow.view.review?.destination.path).toBe("/sintetico/ws");
    expect(j.flow.view.review?.writes.map((w) => w.where).join(" ")).toContain(`.claude/agents/${BRAND.files.orchestratorAgent}`);
    // E nenhum arquivo do workspace muda até ela confirmar
    expect(j.sent.some((m) => m.type === "submit")).toBe(false);
    expect(j.host.commands).toEqual([]);
  },

  "Durante a instalação a Jataí mostra que está trabalhando e anuncia o resultado": async () => {
    // Dado que a pessoa confirmou a revisão do projeto existente
    const j = await journey("brownfield");
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
    j.flow.next();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    // A Jataí mostra que está trabalhando
    expect(j.flow.view.phase).toBe("installing");
    expect(j.flow.view.live).toBe("Instalando…");
    // Quando a instalação termina com sucesso
    await j.settle();
    // Então a Jataí anuncia que a instalação terminou
    expect(j.flow.view.live).toBe("Instalação concluída.");
    // E o Wizard mostra o passo "Pronto"
    expect(j.flow.view.phase).toBe("installed");
    expect(j.flow.view.title).toBe("Pronto");
    expect(j.host.commands.map((c) => c[0])).toEqual([`${BRAND.commandPrefix}._installAgentStructure`]);
  },

  "O Pronto oferece abrir o Cockpit quando a pasta instalada é a pasta aberta": async () => {
    // Dado que a instalação terminou na pasta que está aberta no editor
    const j = await journey("brownfield", { folder: "/sintetico/ws", folderCount: 1 });
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.useOpenFolder();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    await j.settle();
    expect(j.flow.view.installed?.folderIsOpen).toBe(true);
    // Quando a pessoa pede para abrir o Cockpit
    j.flow.next();
    await j.settle();
    // Então o Wizard pede ao editor que abra o Cockpit
    expect(j.host.commands.at(-1)).toEqual([`${BRAND.commandPrefix}.openCockpitNext`]);
  },

  "O Pronto pede para abrir a pasta quando ela não é a pasta aberta": async () => {
    // Dado que a instalação terminou numa pasta diferente da que está aberta no editor
    const j = await journey("brownfield", OPEN);
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.receive({ type: "folderPicked", folder: "/sintetico/outra" });
    j.flow.next();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    await j.settle();
    // Quando a pessoa lê o passo "Pronto"
    expect(j.flow.view.phase).toBe("installed");
    expect(j.flow.view.installed).toEqual({ mode: "brownfield", folder: "/sintetico/outra", hostAdapter: "claude", folderIsOpen: false });
    // Então a Jataí pede que ela abra a pasta instalada antes de seguir
    const { container } = openInstalled(j.flow.view.installed!);
    expect(q(container, '[data-wizard="open-folder-first"]').textContent).toContain("Abra-a no VS Code antes de seguir");
    // E não oferece abrir o Cockpit
    expect(container.querySelector('[data-wizard="open-cockpit"]')).toBeNull();
    expect(j.flow.view.nextLabel).toBe("Fechar");
  },

  "Falha da instalação devolve a pessoa à revisão, com o motivo e a opção de tentar de novo": async () => {
    // Dado que a pessoa confirmou a revisão do projeto existente
    const j = await journey("brownfield");
    j.host.commandError = new Error("disco cheio");
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.receive({ type: "folderPicked", folder: "/sintetico/ws" });
    j.flow.next();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    expect(j.flow.view.phase).toBe("installing");
    // Quando a instalação falha com o motivo "disco cheio"
    await j.settle();
    // Então a Jataí anuncia a falha com o motivo "disco cheio"
    expect(j.flow.view.errors.join(" ")).toContain("disco cheio");
    // E a pessoa pode tentar de novo ou voltar à revisão
    expect(j.flow.view.screen).toBe("revisao");
    expect(j.flow.view.nextLabel).toBe("Tentar de novo");
    expect(j.flow.view.backDisabled).toBe(false);
  },

  "Pasta recusada pela Jataí leva a pessoa de volta ao passo da pasta, com o motivo": async () => {
    // Dado que a pessoa confirmou a revisão do projeto existente numa pasta que já tem conteúdo
    const j = await journey("brownfield", OPEN, () => Promise.resolve({ valid: false, reason: "Pasta não está vazia" }));
    j.flow.choose("hostAdapter", "claude");
    j.flow.next();
    j.flow.receive({ type: "folderPicked", folder: "/sintetico/cheia" });
    j.flow.next();
    j.flow.next();
    j.flow.next();
    j.flow.next();
    // Quando a Jataí recusa a pasta com o motivo "Pasta não está vazia"
    await j.settle();
    // Então a pessoa volta ao passo da pasta
    expect(j.flow.view.screen).toBe("pasta");
    // E vê o motivo "Pasta não está vazia" junto da pasta
    expect(j.flow.view.errors).toEqual(["Pasta não está vazia"]);
    // E o avanço volta a ficar disponível, sem ficar preso em "Instalando…"
    expect(j.flow.view.phase).toBe("editing");
    expect(j.flow.view.nextDisabled).toBe(false);
  },

  "A jornada inteira se conclui só pelo teclado": () => {
    // Dado que a pessoa usa só o teclado
    const { container, flow } = openAt("greenfield", "abertura");
    expect(document.activeElement?.id).toBe("wizard-title");
    // Quando ela escolhe o modo com as setas, avança com Enter e volta com Esc
    key(document.activeElement, "Enter");
    expect(flow.view.screen).toBe("modo");
    const [first, second] = radios(container) as [HTMLElement, HTMLElement];
    act(() => first.focus());
    key(first, "ArrowDown");
    key(second, "ArrowUp");
    expect(flow.view.choice).toBe("greenfield");
    key(document.activeElement, "Enter");
    expect(flow.view.screen).toBe("harness");
    key(document.activeElement, "Escape");
    // Então cada escolha é feita por um grupo de opções que se percorre com as setas
    expect(flow.view.screen).toBe("modo");
    for (const screen of ["harness", "dominio", "backend", "frontend", "infra"]) {
      const opened = openAt("greenfield", screen, FULL_GREENFIELD);
      const groups = [...opened.container.querySelectorAll('[data-wizard-group]')];
      expect(groups.length, screen).toBeGreaterThan(0);
      for (const group of groups) expect(group.getAttribute("role"), `${screen}/${group.getAttribute("data-wizard-group")}`).toBe("radiogroup");
    }
    // E Enter avança quando o passo permite
    // E Esc volta ao passo anterior
  },

  "Ao trocar de passo, o foco vai para o título do passo": () => {
    // Dado que a pessoa está num passo da jornada
    const { container, flow } = openAt("greenfield", "modo");
    // Quando ela avança para o passo seguinte
    act(() => flow.chooseMode("greenfield"));
    act(() => flow.next());
    // Então o foco do teclado fica no título do novo passo
    expect(document.activeElement).toBe(q(container, "#wizard-title"));
    expect(document.activeElement?.textContent).toBe("Qual harness você vai usar?");
  },

  "O progresso e os erros são anunciados a quem usa leitor de tela": () => {
    // Dado que a pessoa usa um leitor de tela
    const { container, flow } = openAt("brownfield", "revisao", { hostAdapter: "claude", targetDirectory: "/sintetico/ws", maturityFrameworks: ["dora-4keys"] });
    // Quando a instalação começa e depois falha
    act(() => flow.next());
    // Então o progresso é anunciado numa região de avisos educados
    const live = q(container, '[data-wizard="live"]');
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Instalando…");
    act(() => flow.receive({ type: "generationError", message: "disco cheio" }));
    // E o erro é anunciado como alerta
    expect(q(container, '[role="alert"]').textContent).toContain("disco cheio");
  },

  "O foco visível, o alto contraste e o movimento reduzido são respeitados": () => {
    // Dado que a jornada é desenhada com o design system da Jataí
    const css = source("apps/wizard/Wizard.module.css");
    const ds = ["primitives/Button/Button.module.css", "primitives/ChoiceCard/ChoiceCard.module.css"].map((file) => source(`design-system/${file}`));
    // Quando a pessoa usa alto contraste ou pede menos movimento
    // Então todo controle tem foco visível
    expect(rulesMatching(css, ":focus-visible")).toContain("var(--jt-focus)");
    for (const file of ds) expect(rulesMatching(file, ":focus-visible")).toContain("var(--jt-focus)");
    expect(css).not.toMatch(/outline:\s*none/);
    // E as cores do sistema valem no alto contraste
    expect(css).toContain("@media (forced-colors: active)");
    for (const file of ds) expect(file).toContain("@media (forced-colors: active)");
    // E nada se move quando o movimento reduzido está ligado
    expect(css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))).toMatch(/animation:\s*none/);
  },
};

/** Esquemas do cenário: um step definition por linha de Exemplos. */
for (const title of titlesStartingWith("Cada harness mostra o que instala e onde")) {
  SCENARIOS[title] = () => {
    const [harness, entrada, skills, instrucoes, mcp] = rowOf(title) as [string, string, string, string, string];
    // Dado que a pessoa chegou ao passo do harness
    const { container } = openAt("greenfield", "harness");
    // Quando ela olha a opção "<harness>"
    const card = radios(container).find((c) => textOf(c).includes(harness))!;
    const text = textOf(card);
    // Então a Jataí lista que o agente jatai, a entrada da metodologia, fica em "<entrada>"
    expect(text).toContain(entrada.replace("jatai.agent.md", BRAND.files.orchestratorAgent));
    // E que as skills ficam em "<skills>"
    expect(text).toContain(skills);
    // E que as instruções ficam em "<instrucoes>"
    expect(text).toContain(instrucoes);
    // E que o servidor MCP fica em "<mcp>"
    expect(text).toContain(mcp);
  };
}

for (const title of titlesStartingWith("Nome de projeto inválido é recusado na hora, com um nome sugerido")) {
  SCENARIOS[title] = () => {
    const [nome, sugestao] = rowOf(title) as [string, string];
    // Dado que a pessoa está no passo do projeto novo
    const { container, flow } = openAt("greenfield", "projeto", { hostAdapter: "claude" });
    // Quando ela informa o nome "<nome>"
    const field = q(container, '[data-wizard-input="text"]') as HTMLInputElement;
    act(() => {
      field.value = nome;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Então a Jataí diz que o nome só aceita letras minúsculas, números e hífen
    expect(textOf(q(container, '[data-wizard="field-error"]'))).toContain("O nome só aceita letras minúsculas, números e hífen.");
    // E sugere o nome "<sugestao>"
    expect(q(container, '[data-wizard="use-suggestion"]').textContent).toBe(`Usar ${sugestao}`);
    // E a pessoa não consegue avançar até corrigir
    expect(flow.view.nextDisabled).toBe(true);
  };
}

for (const title of titlesStartingWith("O Pronto aponta o próximo passo no harness escolhido")) {
  SCENARIOS[title] = () => {
    const [harness] = rowOf(title) as [string];
    const host = harness === "Claude Code" ? "claude" : harness === "OpenCode" ? "opencode" : "copilot";
    // Dado que a instalação terminou com o harness "<harness>"
    const { container } = openInstalled({ mode: "brownfield", folder: "/sintetico/ws", hostAdapter: host, folderIsOpen: true });
    // Quando a pessoa lê o passo "Pronto"
    const next = textOf(q(container, '[data-wizard="next-step"]'));
    // Então a Jataí manda entrar pelo agente jatai no harness escolhido
    const expected = host === "claude"
      ? `chame o agente @${BRAND.participant.name}`
      : host === "opencode"
        ? `selecione o agente ${BRAND.participant.name} ou rode /${BRAND.participant.name}`
        : `escolha o agente ${BRAND.participant.name} no seletor de agentes`;
    expect(next).toContain(expected);
    expect(textOf(container)).toContain(harness);
  };
}

Object.assign(SCENARIOS, {
  "Numa pasta que não é da Jataí, a barra lateral convida a começar": () => {
    // Dado que a pasta aberta não é um workspace da Jataí
    const { root, readFacts } = folderOnDisk(false);
    const keys = new RecordingContextKeys();
    bindWorkspaceContext({ contextKeys: keys, workspaceRoot: new FixedWorkspaceRoot(root), readFacts });
    // Quando a pessoa abre a barra lateral da Jataí
    const shown = sidebar(1, keys.values.get(IS_WORKSPACE_KEY)!);
    // Então a barra lateral oferece "Começar com a Jataí"
    expect(shown.actions).toEqual([`Começar com a ${BRAND.displayName}`]);
    expect(shown.views).toEqual([`${BRAND.name}.welcome`]);
  },

  "Sem pasta aberta, a barra lateral oferece abrir uma pasta ou criar um projeto novo": () => {
    // Dado que nenhuma pasta está aberta no editor
    const keys = new RecordingContextKeys();
    bindWorkspaceContext({ contextKeys: keys, workspaceRoot: new FixedWorkspaceRoot(undefined), readFacts: folderOnDisk(false).readFacts });
    // Quando a pessoa abre a barra lateral da Jataí
    const shown = sidebar(0, keys.values.get(IS_WORKSPACE_KEY)!);
    // Então a barra lateral oferece "Abrir uma pasta" e "Criar um projeto novo"
    expect(shown.actions).toEqual(["Abrir uma pasta", "Criar um projeto novo"]);
  },

  "Num workspace da Jataí, o convite não aparece": () => {
    // Dado que a pasta aberta é um workspace da Jataí
    const { root, readFacts } = folderOnDisk(true);
    const keys = new RecordingContextKeys();
    // Quando a extensão termina de iniciar
    bindWorkspaceContext({ contextKeys: keys, workspaceRoot: new FixedWorkspaceRoot(root), readFacts });
    // Então o convite para começar fica escondido
    const shown = sidebar(1, keys.values.get(IS_WORKSPACE_KEY)!);
    expect(shown.actions).toEqual([]);
    expect(shown.views).toEqual([`${BRAND.name}.mainPanel`]);
  },

  "Quando a pasta vira workspace da Jataí, o convite some sem recarregar a janela": async () => {
    // Dado que a pasta aberta não é um workspace da Jataí
    const { root, readFacts } = folderOnDisk(false);
    const keys = new RecordingContextKeys();
    const context = bindWorkspaceContext({ contextKeys: keys, workspaceRoot: new FixedWorkspaceRoot(root), readFacts });
    expect(sidebar(1, keys.values.get(IS_WORKSPACE_KEY)!).actions).toEqual([`Começar com a ${BRAND.displayName}`]);
    // Quando a instalação cria o arquivo de configuração na pasta aberta
    fs.writeFileSync(path.join(root, BRAND.files.config), "kit_version: 1\n");
    await context.refresh();
    // Então o convite para começar some
    expect(sidebar(1, keys.values.get(IS_WORKSPACE_KEY)!).actions).toEqual([]);
  },

  "Pedir para começar duas vezes seguidas abre um só Wizard": async () => {
    // Dado que a pasta aberta não é um workspace da Jataí
    const created: Array<WizardHandle & { starts: number }> = [];
    const launcher = new WizardLauncher(() => {
      const wizard = {
        isOpen: false,
        starts: 0,
        async start(): Promise<void> {
          wizard.starts++;
          wizard.isOpen = true;
        },
      };
      created.push(wizard);
      return wizard;
    });
    // Quando a pessoa pede para começar com a Jataí duas vezes seguidas
    await launcher.open();
    await launcher.open();
    // Então existe um só painel do Wizard
    expect(created).toHaveLength(1);
  },
});

/** Cenários que ainda não têm step definition: a frente fecha com esta lista vazia. */
const PENDENTES: string[] = TITLES.filter((t) => !(t in SCENARIOS));

describe("Funcionalidade: Jornada guiada de preparação da Jataí", () => {
  it("todo cenário do .feature tem step definition ou está listado como pendente, e nenhum step sobra", () => {
    expect([...Object.keys(SCENARIOS), ...PENDENTES].sort()).toEqual([...TITLES].sort());
    expect(Object.keys(SCENARIOS).filter((t) => !TITLES.includes(t))).toEqual([]);
  });

  it("nenhum cenário fica pendente: todo o .feature tem step definition", () => {
    expect(PENDENTES).toEqual([]);
  });

  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
  for (const title of PENDENTES) it.todo(`Cenário: ${title}`);
});
