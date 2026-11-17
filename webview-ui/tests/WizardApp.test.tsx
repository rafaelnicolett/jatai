import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { act } from "react";
import type { WizardBoot, WizardMessage, WizardStep } from "@shared/wizard-protocol";
import { BRAND } from "@data";
import { getBrownfieldSchema, getWizardSchema } from "../../src/wizard/wizard-schema";
import { WizardApp } from "../src/apps/wizard/WizardApp";
import { WizardFlow, type WizardBridge } from "../src/apps/wizard/WizardFlow";
import type { Workspace } from "../src/apps/wizard/journey";
import { accessibleName, cleanup, key, mount, rulesMatching, source } from "./support/component";

/**
 * O app do Wizard montado no jsdom (F4.3): o que a pessoa percorre só com o
 * teclado e o que o leitor de tela anuncia. A lógica do fluxo está em
 * `wizardFlow.test.ts`, e a sequência de mensagens, em `wizard-parity.test.tsx`.
 * O jsdom não aplica CSS: foco visível, alto contraste e movimento reduzido
 * são conferidos na fonte do CSS Module, como nos testes do design system.
 */

class RecordingBridge implements WizardBridge {
  posted: WizardMessage[] = [];
  postMessage(msg: WizardMessage): void {
    this.posted.push(msg);
  }
  setState(): void {}
  getState(): { screen: string } | undefined {
    return this._saved;
  }
  constructor(private readonly _saved?: { screen: string }) {}
}

let greenfield: readonly WizardStep[];
let brownfield: readonly WizardStep[];

beforeAll(async () => {
  greenfield = await getWizardSchema();
  brownfield = await getBrownfieldSchema();
});

afterEach(cleanup);

interface OpenOptions {
  state?: WizardBoot["state"];
  screen?: string;
  workspace?: Workspace;
  modeChosen?: boolean;
}

function open(mode: "greenfield" | "brownfield", options: OpenOptions = {}): { container: HTMLElement; flow: WizardFlow; bridge: RecordingBridge } {
  const bridge = new RecordingBridge(options.screen ? { screen: options.screen } : undefined);
  const flow = new WizardFlow(
    {
      schema: mode === "brownfield" ? brownfield : greenfield,
      state: options.state ?? {},
      brownfield: mode === "brownfield",
      brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
      workspace: options.workspace ?? { folder: "/sintetico/aberta", folderCount: 1 },
      ...(options.modeChosen ? { modeChosen: true } : {}),
    },
    bridge
  );
  flow.start();
  return { container: mount(<WizardApp flow={flow} />), flow, bridge };
}

/** Ações do fluxo que mudam a tela precisam do `act`, como um evento da pessoa. */
function run(fn: () => void): void {
  act(fn);
}

const q = <T extends HTMLElement = HTMLElement>(container: HTMLElement, selector: string): T => container.querySelector<T>(selector)!;
const radios = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
const title = (container: HTMLElement): HTMLElement => q(container, "#wizard-title");

/** Tudo o que a pessoa alcança com Tab, na ordem do DOM (sem o que tem tabindex -1 nem o que está desabilitado). */
function tabStops(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('button, input, textarea, select, summary, a[href], [tabindex]')].filter(
    (el) => el.getAttribute("tabindex") !== "-1" && !(el as HTMLButtonElement).disabled
  );
}

const FULL_GREENFIELD = { hostAdapter: "claude", projectName: "loja-demo", startupIdea: "uma vitrine", domain: "ecommerce", backendStack: "python-api", backendArchitecture: "hexagonal", frontendStack: "none", database: "none", cloud: "none", cicd: "none" } as const;

describe("Wizard — grupos de opções são radiogroups (teclado)", () => {
  function atMode(): ReturnType<typeof open> {
    const opened = open("greenfield");
    run(() => opened.flow.next());
    return opened;
  }

  it("a escolha do modo é um radiogroup nomeado pelo título, com um só cartão na ordem de Tab", () => {
    const { container } = atMode();
    const group = q(container, '[role="radiogroup"]');
    expect(group.getAttribute("aria-labelledby")).toBe("wizard-title");
    expect(accessibleName(group)).toBe("Como você quer começar?");
    const cards = radios(container);
    expect(cards.map((c) => accessibleName(c))).toEqual(["Projeto novo", "Projeto existente"]);
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(cards.map((c) => c.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });

  it("as setas movem o foco e marcam a opção, dão a volta e Home e End vão às pontas", () => {
    const { container } = atMode();
    const [first, second] = radios(container) as [HTMLElement, HTMLElement];
    act(() => first.focus());
    key(first, "ArrowDown");
    expect(document.activeElement).toBe(second);
    expect(radios(container).map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(radios(container).map((c) => c.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    key(second, "ArrowRight");
    expect(document.activeElement).toBe(radios(container)[0]);
    key(radios(container)[0]!, "ArrowUp");
    expect(document.activeElement).toBe(radios(container)[1]);
    key(radios(container)[1]!, "Home");
    expect(document.activeElement).toBe(radios(container)[0]);
    key(radios(container)[0]!, "End");
    expect(document.activeElement).toBe(radios(container)[1]);
    expect(radios(container)[1]!.getAttribute("aria-checked")).toBe("true");
  });

  it("o harness lista o que cada um instala e onde, com o agente de entrada, o MCP e a atividade, sem o chat antigo", () => {
    const { container } = open("brownfield");
    const [copilot, claude, opencode] = radios(container).map((c) => c.textContent ?? "") as [string, string, string];
    // a ordem das opções é a do schema: Copilot, Claude, OpenCode
    expect(copilot).toContain(".github/agents/");
    expect(copilot).toContain(`.github/agents/${BRAND.files.orchestratorAgent}`);
    expect(copilot).toContain(".vscode/mcp.json");
    expect(copilot).not.toContain("Atividade");
    expect(claude).toContain(`.claude/agents/${BRAND.files.orchestratorAgent}`);
    expect(claude).toContain(".mcp.json");
    expect(claude).toContain(".claude/settings.json");
    expect(opencode).toContain(".opencode/agents/");
    expect(opencode).toContain(".opencode/plugins/jatai-activity.ts");
    expect(`${copilot}${claude}${opencode}`).not.toMatch(/concierge|maestro/i);
    expect(q(container, '[data-wizard="harness-note"]').textContent).toContain(`@${BRAND.guide.name}`);
    expect(q(container, '[data-wizard="harness-note"]').textContent).toContain(`agente ${BRAND.participant.name}`);
  });
});

describe("Wizard — Enter avança, Esc volta, e a ordem de Tab é previsível", () => {
  it("Enter avança quando o passo permite, e Esc volta ao passo anterior", () => {
    const { container, flow } = open("greenfield");
    expect(flow.view.screen).toBe("abertura");
    key(title(container), "Enter");
    expect(flow.view.screen).toBe("modo");
    key(title(container), "Escape");
    expect(flow.view.screen).toBe("abertura");
    key(title(container), "Escape");
    expect(flow.view.screen).toBe("abertura");
  });

  it("Enter num cartão de opção marca o cartão e avança, como Enter num formulário", () => {
    const { container, flow } = open("greenfield");
    run(() => flow.next());
    key(radios(container)[0]!, "Enter");
    expect(flow.view.choice).toBe("greenfield");
    expect(flow.view.screen).toBe("harness");
  });

  it("Enter num botão fica com o botão: o Wizard não o toma", () => {
    const { container, flow } = open("greenfield");
    run(() => flow.next());
    const back = q(container, '[data-wizard="back"]');
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      back.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(flow.view.screen).toBe("modo");
  });

  it("Enter com o passo bloqueado não avança, e a área de texto só avança com Ctrl ou Cmd", () => {
    const { container, flow } = open("greenfield", { modeChosen: true, state: { hostAdapter: "claude" }, screen: "projeto" });
    expect(flow.view.screen).toBe("projeto");
    key(q(container, '[data-wizard-input="text"]'), "Enter");
    expect(flow.view.screen).toBe("projeto");
    run(() => {
      flow.input("projectName", "loja-demo");
      flow.input("startupIdea", "uma vitrine");
    });
    key(q(container, '[data-wizard-input="textarea"]'), "Enter");
    expect(flow.view.screen).toBe("projeto");
    act(() => {
      q(container, '[data-wizard-input="textarea"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(flow.view.screen).toBe("dominio");
  });

  it("a ordem de Tab é a do DOM: campos, depois Cancelar, Voltar e Continuar; o título só recebe foco por código", () => {
    const { container } = open("greenfield", { modeChosen: true, state: { hostAdapter: "claude" }, screen: "projeto" });
    expect(title(container).getAttribute("tabindex")).toBe("-1");
    const names = tabStops(container).map((el) => el.getAttribute("data-wizard") ?? el.getAttribute("data-wizard-input"));
    expect(names).toEqual(["text", "textarea", "cancel", "back", "next"]);
  });
});

describe("Wizard — o foco vai para o título ao trocar de passo", () => {
  it("o título tem o foco ao abrir e a cada passo novo", () => {
    const { container, flow } = open("greenfield");
    expect(document.activeElement).toBe(title(container));
    run(() => flow.next());
    expect(document.activeElement).toBe(title(container));
    expect(title(container).textContent).toBe("Como você quer começar?");
    run(() => flow.chooseMode("greenfield"));
    run(() => flow.next());
    expect(title(container).textContent).toBe("Qual harness você vai usar?");
    expect(document.activeElement).toBe(title(container));
    run(() => flow.back());
    expect(document.activeElement).toBe(title(container));
  });

  it("o foco volta ao título quando a instalação começa e quando ela falha", () => {
    const { container, flow } = open("brownfield", { state: { hostAdapter: "claude", targetDirectory: "/sintetico/ws", maturityFrameworks: ["dora-4keys"] }, screen: "revisao" });
    q(container, '[data-wizard="next"]').focus();
    run(() => flow.next());
    expect(document.activeElement).toBe(title(container));
    run(() => flow.receive({ type: "generationError", message: "disco cheio" }));
    expect(document.activeElement).toBe(title(container));
  });
});

describe("Wizard — o leitor de tela é avisado do progresso e dos erros", () => {
  const review = { state: { hostAdapter: "claude", targetDirectory: "/sintetico/ws", maturityFrameworks: ["dora-4keys"] }, screen: "revisao" } as const;

  it("o progresso é anunciado numa região de avisos educados, e o botão fica ocupado", () => {
    const { container, flow } = open("brownfield", review);
    const live = q(container, '[data-wizard="live"]');
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    run(() => flow.next());
    expect(live.textContent).toBe("Instalando…");
    const next = q(container, '[data-wizard="next"]');
    expect(next.getAttribute("aria-busy")).toBe("true");
    expect(q(container, '[data-wizard="progress"]').textContent).toContain("Instalando…");
  });

  it("o erro que bloqueia o passo é um alerta, com o motivo, e dá para tentar de novo", () => {
    const { container, flow } = open("brownfield", review);
    run(() => flow.next());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    run(() => flow.receive({ type: "generationError", message: "disco cheio" }));
    const alert = q(container, '[role="alert"]');
    expect(alert.textContent).toBe("A instalação não terminou. disco cheio");
    expect(q(container, '[data-wizard="next"]').textContent).toBe("Tentar de novo");
    expect(q(container, '[data-wizard="live"]').textContent).toBe("");
  });

  it("o erro de validação do host leva ao passo da pasta, em alerta, e o botão está livre", () => {
    const { container, flow } = open("brownfield", review);
    run(() => flow.next());
    run(() => flow.receive({ type: "validationError", errors: { targetDirectory: ["Pasta não está vazia (1 item)."] } }));
    expect(title(container).textContent).toBe("Onde fica o workspace?");
    expect(q(container, '[role="alert"]').textContent).toBe("Pasta não está vazia (1 item).");
    expect(q(container, '[data-wizard="next"]').getAttribute("aria-busy")).toBeNull();
  });

  it("'Continuar' bloqueado continua focável (aria-disabled) e diz o motivo na dica e no nome do botão", () => {
    const { container } = open("brownfield", { screen: "pasta", state: { hostAdapter: "claude" } });
    const next = q<HTMLButtonElement>(container, '[data-wizard="next"]');
    expect(next.disabled).toBe(false);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("title")).toBe("Escolha a pasta do workspace para continuar.");
    expect(tabStops(container)).toContain(next);
  });
});

describe("Wizard — telas", () => {
  function type(container: HTMLElement, text: string): void {
    const field = q<HTMLInputElement>(container, '[data-wizard-input="text"]');
    act(() => {
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("REGRESSÃO (H-BUG-20): nome inválido mostra o motivo ao lado do campo, marca o campo como inválido e 'Usar loja-demo' o corrige", () => {
    const { container } = open("greenfield", { modeChosen: true, state: { hostAdapter: "claude" }, screen: "projeto" });
    type(container, "Loja Demo");
    const field = q<HTMLInputElement>(container, '[data-wizard-input="text"]');
    const message = q(container, '[data-wizard="field-error"]');
    expect(message.textContent).toContain("O nome só aceita letras minúsculas, números e hífen.");
    expect(message.getAttribute("role")).toBe("status");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    expect(container.querySelector<HTMLLabelElement>('label[for="wizard-project-name"]')?.textContent).toBe("Nome do projeto");
    const use = q<HTMLButtonElement>(container, '[data-wizard="use-suggestion"]');
    expect(use.textContent).toBe("Usar loja-demo");
    act(() => use.click());
    expect(q<HTMLInputElement>(container, '[data-wizard-input="text"]').value).toBe("loja-demo");
    expect(container.querySelector('[data-wizard="field-error"]')).toBeNull();
  });

  it("sem pasta aberta, o destino do projeto novo não é a pasta pessoal: pede para escolher, e 'Continuar' diz o motivo", () => {
    const { container } = open("greenfield", { modeChosen: true, workspace: { folder: null, folderCount: 0 }, state: FULL_GREENFIELD, screen: "local" });
    expect(container.textContent).toContain("Nenhuma pasta está aberta. Escolha onde criar o projeto.");
    expect(q(container, '[data-wizard="folder-path"]').getAttribute("data-empty")).toBe("true");
    expect(q(container, '[data-wizard="pick-folder"]').textContent).toBe("Escolher pasta…");
    expect(q(container, '[data-wizard="next"]').getAttribute("title")).toBe("Escolha onde criar o projeto para continuar.");
    expect(container.textContent).not.toContain("~");
  });

  it("com pasta aberta, mostra onde o projeto nasce e oferece escolher outro lugar", () => {
    const { container } = open("greenfield", { modeChosen: true, state: FULL_GREENFIELD, screen: "local" });
    expect(q(container, '[data-wizard="folder-path"]').textContent).toContain("/sintetico/aberta/loja-demo");
    expect(q(container, '[data-wizard="pick-folder"]').textContent).toBe("Escolher outra pasta…");
    expect(container.querySelector('[data-wizard="multi-root"]')).toBeNull();
  });

  it("com mais de uma pasta aberta, avisa em texto curto que a v1 usa uma pasta por janela", () => {
    const { container } = open("greenfield", { modeChosen: true, workspace: { folder: "/sintetico/a", folderCount: 2 }, state: FULL_GREENFIELD, screen: "local" });
    expect(q(container, '[data-wizard="multi-root"]').textContent).toBe(`Esta janela tem mais de uma pasta. A v1 da ${BRAND.displayName} trabalha com uma pasta por janela e usa a primeira.`);
  });

  it("a revisão lista o que será escrito, com a pasta de destino, e o que a Jataí não faz", () => {
    const { container } = open("brownfield", { state: { hostAdapter: "claude", targetDirectory: "/sintetico/ws", maturityFrameworks: ["dora-4keys"] }, screen: "revisao" });
    expect(title(container).textContent).toBe("Revise antes de escrever");
    expect(q(container, '[data-wizard="destination"]').textContent).toContain("/sintetico/ws");
    const writes = q(container, '[data-wizard="writes"]').textContent ?? "";
    expect(writes).toContain(`.claude/agents/${BRAND.files.orchestratorAgent}`);
    expect(writes).toContain(".claude/settings.json");
    expect(writes).toContain("repos/");
    expect(q(container, '[data-wizard="next"]').textContent).toBe("Instalar na pasta");
  });

  it("a abertura diz o que a Jataí vai fazer e o que não vai fazer", () => {
    const { container } = open("greenfield");
    const text = container.textContent ?? "";
    expect(text).toContain("Instalar agentes, skills e instruções na pasta que você escolher.");
    expect(text).toContain("Enviar dados para fora do seu computador: tudo roda local.");
    expect(text).toContain("Alterar os repositórios que você já tem.");
    expect(text).toContain("Escrever qualquer arquivo antes de você confirmar a revisão.");
  });
});

describe("Wizard — o passo 'Pronto'", () => {
  const review = { state: { hostAdapter: "claude", targetDirectory: "/sintetico/ws", maturityFrameworks: ["dora-4keys"] }, screen: "revisao" } as const;
  const installed = (hostAdapter: "claude" | "copilot", folderIsOpen: boolean) => ({ type: "installed", mode: "brownfield", folder: "/sintetico/ws", hostAdapter, folderIsOpen }) as const;

  function atDone(hostAdapter: "claude" | "copilot", folderIsOpen: boolean): ReturnType<typeof open> {
    const opened = open("brownfield", { ...review, state: { ...review.state, hostAdapter } });
    run(() => opened.flow.next());
    run(() => opened.flow.receive(installed(hostAdapter, folderIsOpen)));
    return opened;
  }

  it("o foco vai para o título 'Pronto', o leitor ouve que a instalação terminou e a tela diz onde a estrutura ficou", () => {
    const { container } = atDone("claude", true);
    expect(title(container).textContent).toBe("Pronto");
    expect(document.activeElement).toBe(title(container));
    expect(q(container, '[data-wizard="live"]').textContent).toBe("Instalação concluída.");
    expect(q(container, '[data-wizard="done"]').textContent).toContain("/sintetico/ws");
    expect(container.querySelector('[data-wizard="progress"]')).toBeNull();
  });

  it.each([
    ["claude", `No Claude Code, chame o agente @${BRAND.participant.name}.`],
    ["copilot", `escolha o agente ${BRAND.participant.name} no seletor de agentes`],
  ] as const)("o próximo passo é entrar pelo agente da marca no chat do harness escolhido (%s)", (host, expected) => {
    const { container } = atDone(host, true);
    const next = q(container, '[data-wizard="next-step"]').textContent ?? "";
    expect(next).toContain(expected);
    expect(textOfDone(container)).toContain(`@${BRAND.guide.name}`);
    expect(textOfDone(container)).not.toMatch(/concierge|maestro/i);
  });

  it("com a pasta aberta, oferece abrir o Cockpit (o botão manda openCockpit) e fechar", () => {
    const { container, bridge } = atDone("claude", true);
    const cockpit = q<HTMLButtonElement>(container, '[data-wizard="open-cockpit"]');
    expect(cockpit.textContent).toBe("Abrir o Cockpit");
    act(() => cockpit.click());
    expect(bridge.posted.at(-1)).toEqual({ type: "openCockpit" });
    expect(q(container, '[data-wizard="cancel"]').textContent).toBe("Fechar");
    act(() => q(container, '[data-wizard="cancel"]').click());
    expect(bridge.posted.at(-1)).toEqual({ type: "cancel" });
    expect(container.querySelector('[data-wizard="next"]')).toBeNull();
    expect(container.querySelector('[data-wizard="open-folder-first"]')).toBeNull();
  });

  it("com outra pasta, pede para abrir a pasta antes de seguir e não oferece o Cockpit", () => {
    const { container } = atDone("claude", false);
    expect(q(container, '[data-wizard="open-folder-first"]').textContent).toContain("Abra-a no VS Code antes de seguir");
    expect(container.querySelector('[data-wizard="open-cockpit"]')).toBeNull();
    expect(q(container, '[data-wizard="cancel"]').textContent).toBe("Fechar");
  });

  it("Enter no 'Pronto' abre o Cockpit quando a pasta é a aberta", () => {
    const { container, bridge } = atDone("copilot", true);
    key(title(container), "Enter");
    expect(bridge.posted.at(-1)).toEqual({ type: "openCockpit" });
  });

  function textOfDone(container: HTMLElement): string {
    return q(container, '[data-wizard="done"]').textContent ?? "";
  }
});

describe("Wizard — foco visível, alto contraste e movimento reduzido (CSS)", () => {
  const css = source("apps/wizard/Wizard.module.css");

  it("todo controle do Wizard tem foco visível de 3px, afastado 2px, com o token de foco, e nenhum 'outline: none'", () => {
    const focus = rulesMatching(css, ":focus-visible");
    expect(focus).toContain("outline: var(--jt-size-focus-width) solid var(--jt-focus)");
    expect(focus).toContain("outline-offset: var(--jt-size-focus-offset)");
    expect(css).not.toMatch(/outline:\s*none/);
    for (const selector of [".input:focus-visible", ".textarea:focus-visible", ".stepTitle:focus-visible", ".tree summary:focus-visible"]) {
      expect(css, selector).toContain(selector);
    }
  });

  it("no alto contraste do Windows (forced-colors), as bordas e o foco usam as cores do sistema", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain("ButtonText");
    expect(forced).toContain("Highlight");
  });

  it("com movimento reduzido, a tela entra sem se mover", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/animation:\s*none/);
    expect(css).toMatch(/\.content\s*\{[^}]*animation:/);
  });
});
