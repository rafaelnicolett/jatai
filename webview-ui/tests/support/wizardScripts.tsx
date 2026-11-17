import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HostToWizardMessage, TemplateManifest, WizardBoot, WizardStep } from "@shared/wizard-protocol";
import { BRAND } from "@data";
import { getBrownfieldSchema, getWizardSchema } from "../../../src/wizard/wizard-schema";
import { WizardApp } from "../../src/apps/wizard/WizardApp";
import { WizardFlow } from "../../src/apps/wizard/WizardFlow";

/**
 * Apoio dos testes de sequência de mensagens e de tela do Wizard: o app React
 * real (`WizardApp` + `WizardFlow`) no jsdom, dirigido por ações de pessoa e
 * por mensagens do host, roteiro a roteiro. Nasceu na paridade com o script
 * legado (W4, F3.10); a F4.3 o dirige pela jornada nova. Quem usa:
 * - `wizard-parity.test.tsx`: as mensagens webview -> host de cada ação;
 * - `wizard-tela.test.tsx`: a tela de cada ação (passo gravado, rótulo,
 *   título e botões), que a jornada redesenhada regrava de propósito.
 */

export type Action =
  | { do: "mode"; mode: "greenfield" | "brownfield" }
  | { do: "next" }
  | { do: "back" }
  | { do: "cancel" }
  | { do: "type"; text: string }
  | { do: "idea"; text: string }
  | { do: "choose"; value: string }
  | { do: "toggle"; value: string }
  | { do: "pickFolder" }
  | { do: "cockpit" }
  | { do: "host"; msg: HostToWizardMessage };

export interface Observation {
  action: string;
  posted: unknown[];
  setState: unknown[];
  label: string;
  title: string;
  next: { text: string; disabled: boolean };
  back: { disabled: boolean };
}

interface Driver {
  /** A raiz do React montada no documento (o axe da F4.4 lê daqui). */
  container: HTMLElement;
  run(action: Action): void;
  observe(action: Action): Observation;
  dispose(): void;
}

function text(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function describeAction(a: Action): string {
  switch (a.do) {
    case "mode": return `mode:${a.mode}`;
    case "type": return `type:${JSON.stringify(a.text)}`;
    case "idea": return `idea:${JSON.stringify(a.text)}`;
    case "choose":
    case "toggle": return `${a.do}:${a.value}`;
    case "host": return `host:${a.msg.type}`;
    default: return a.do;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const isDisabled = (el: HTMLButtonElement): boolean => el.disabled || el.getAttribute("aria-disabled") === "true";

function reactDriver(boot: WizardBoot): Driver {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const posted: unknown[] = [];
  const states: unknown[] = [];
  const flow = new WizardFlow(clone(boot), { postMessage: (m) => posted.push(clone(m)), setState: (s) => states.push(clone(s)), getState: () => undefined });
  flow.start();
  const root: Root = createRoot(container);
  act(() => root.render(<WizardApp flow={flow} />));

  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => container.querySelector<T>(selector);
  const click = (el: HTMLElement | null, what: string): void => {
    if (!el) throw new Error(`react: ${what} não existe`);
    act(() => el.click());
  };
  const typeInto = (selector: string, value: string, what: string): void => {
    const field = q<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (!field) throw new Error(`react: ${what} não existe`);
    act(() => {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  let cursorPosted = 0;
  let cursorStates = 0;

  return {
    container,
    run(a) {
      switch (a.do) {
        case "mode":
        case "choose":
        case "toggle": click(q(`[data-wizard-option="${a.do === "mode" ? a.mode : a.value}"]`), `opção ${a.do === "mode" ? a.mode : a.value}`); break;
        case "next": click(q('[data-wizard="next"]'), "próximo"); break;
        case "back": click(q('[data-wizard="back"]'), "voltar"); break;
        case "cancel": click(q('[data-wizard="cancel"]'), "cancelar"); break;
        case "pickFolder": click(q('[data-wizard="pick-folder"]'), "escolher pasta"); break;
        case "cockpit": click(q('[data-wizard="open-cockpit"]'), "abrir o Cockpit"); break;
        case "type": typeInto('[data-wizard-input="text"]', a.text, "campo de texto"); break;
        case "idea": typeInto('[data-wizard-input="textarea"]', a.text, "área de texto"); break;
        case "host": act(() => flow.receive(clone(a.msg))); break;
      }
    },
    observe(a) {
      // No "Pronto" o botão principal é o de abrir o Cockpit (ou, sem ele, o de fechar).
      const next = q<HTMLButtonElement>('[data-wizard="next"]') ?? q<HTMLButtonElement>('[data-wizard="open-cockpit"]') ?? q<HTMLButtonElement>('[data-wizard="cancel"]')!;
      const obs: Observation = {
        action: describeAction(a),
        posted: posted.slice(cursorPosted),
        setState: states.slice(cursorStates),
        label: text(q('[data-wizard="step-label"]')),
        title: text(q('[data-wizard="step-title"]')),
        next: { text: text(next), disabled: isDisabled(next) },
        back: { disabled: isDisabled(q<HTMLButtonElement>('[data-wizard="back"]') ?? next) },
      };
      cursorPosted = posted.length;
      cursorStates = states.length;
      return obs;
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function play(boot: WizardBoot, script: Action[]): Observation[] {
  const driver = reactDriver(boot);
  try {
    const out = [driver.observe({ do: "next" } as Action)].map((o) => ({ ...o, action: "abertura" }));
    for (const action of script) {
      driver.run(action);
      out.push(driver.observe(action));
    }
    return out;
  } finally {
    driver.dispose();
  }
}

/**
 * Monta o Wizard no documento e devolve a raiz, sem desmontar — o axe da F4.4
 * lê o DOM que a pessoa vê. Quem chama descarta no fim.
 */
export function mountWizard(boot: WizardBoot): { container: HTMLElement; dispose(): void } {
  const driver = reactDriver(boot);
  return { container: driver.container, dispose: () => driver.dispose() };
}

// ── Roteiros ─────────────────────────────────────────────────────────────

const MANIFEST: TemplateManifest = {
  id: `${BRAND.templatePrefix}python-api`,
  name: `${BRAND.templatePrefix}python-api`,
  stack: "python-api",
  version: "local",
  description: "FastAPI + React + Vite · Host: claude · Preview gerado localmente.",
  tags: ["python-api", "react-vite", "claude", "aws"],
  rubricsAvailable: true,
  generatedTree: [".claude/", ".claude/agents/", "code/", "docs/"],
};

/** Do início do projeto novo até a revisão: abertura, modo, harness, projeto, domínio, backend, frontend, infra, destino. */
const toReview: Action[] = [
  { do: "next" },
  { do: "mode", mode: "greenfield" },
  { do: "next" },
  { do: "choose", value: "claude" },
  { do: "next" },
  { do: "type", text: "loja-demo" },
  { do: "idea", text: "Uma vitrine sintética para o teste de paridade." },
  { do: "next" },
  { do: "choose", value: "ecommerce" },
  { do: "next" },
  { do: "choose", value: "python-api" },
  { do: "choose", value: "hexagonal" },
  { do: "next" },
  { do: "choose", value: "react-vite" },
  { do: "choose", value: "feature-based" },
  { do: "next" },
  { do: "choose", value: "postgresql" },
  { do: "choose", value: "aws" },
  { do: "choose", value: "github-actions" },
  { do: "next" },
  { do: "next" },
];

export const SCRIPTS: Record<string, { brownfield: boolean; actions: Action[] }> = {
  "greenfield completo: manifest local, envio, erro de geração e novo envio": {
    brownfield: false,
    actions: [
      ...toReview,
      { do: "host", msg: { type: "templateManifest", manifest: MANIFEST, source: "local" } },
      { do: "next" },
      { do: "host", msg: { type: "generationError", message: "falha sintética do gerador" } },
      { do: "next" },
      { do: "host", msg: { type: "validationError", errors: { projectName: ["Invalid"] } } },
    ],
  },
  "brownfield completo: pasta, host, frameworks, envio e erro de validação (H-BUG-52, H-BUG-20)": {
    brownfield: true,
    actions: [
      { do: "choose", value: "claude" },
      { do: "next" },
      { do: "next" },
      { do: "pickFolder" },
      { do: "host", msg: { type: "folderPicked", folder: "/sintetico/workspaces/loja-demo" } },
      { do: "next" },
      { do: "next" },
      { do: "toggle", value: "tech-radar" },
      { do: "toggle", value: "dora-4keys" },
      { do: "next" },
      { do: "next" },
      { do: "host", msg: { type: "validationError", errors: { targetDirectory: ["Pasta não está vazia (1 item)."] } } },
      { do: "back" },
      { do: "cancel" },
    ],
  },
  "pronto: a instalação termina, abre o Cockpit e fecha (passo 'Pronto')": {
    brownfield: true,
    actions: [
      { do: "choose", value: "claude" },
      { do: "next" },
      { do: "host", msg: { type: "folderPicked", folder: "/sintetico/aberta" } },
      { do: "next" },
      { do: "next" },
      { do: "next" },
      { do: "next" },
      { do: "host", msg: { type: "installed", mode: "brownfield", folder: "/sintetico/aberta", hostAdapter: "claude", folderIsOpen: true } },
      { do: "cockpit" },
      { do: "cancel" },
    ],
  },
  "intro: 'Projeto Existente' + Continuar pede switchToBrownfield sem avançar (L6)": {
    brownfield: false,
    actions: [{ do: "next" }, { do: "mode", mode: "brownfield" }, { do: "next" }],
  },
  "intro: 'Projeto Existente' e depois 'Novo Projeto' segue no greenfield (L5)": {
    brownfield: false,
    actions: [{ do: "next" }, { do: "mode", mode: "brownfield" }, { do: "mode", mode: "greenfield" }, { do: "next" }, { do: "next" }],
  },
  "preview reaproveitado depois de trocar o backend (H-BUG-25)": {
    brownfield: false,
    actions: [
      ...toReview,
      { do: "host", msg: { type: "templateManifest", manifest: MANIFEST, source: "local" } },
      ...Array.from({ length: 4 }, (): Action => ({ do: "back" })),
      { do: "choose", value: "java-spring" },
      ...Array.from({ length: 4 }, (): Action => ({ do: "next" })),
    ],
  },
  "navegação: voltar e avançar mantém o que foi digitado; texto em branco desabilita": {
    brownfield: false,
    actions: [
      { do: "next" },
      { do: "mode", mode: "greenfield" },
      { do: "next" },
      { do: "choose", value: "claude" },
      { do: "next" },
      { do: "type", text: "  loja  " },
      { do: "idea", text: "uma vitrine" },
      { do: "next" },
      { do: "back" },
      { do: "type", text: "   " },
      { do: "cancel" },
    ],
  },
};


let greenfieldSchema: readonly WizardStep[];
let brownfieldSchema: readonly WizardStep[];

/** Carrega os schemas do host (chame no `beforeAll` do teste). */
export async function loadSchemas(): Promise<void> {
  greenfieldSchema = await getWizardSchema();
  brownfieldSchema = await getBrownfieldSchema();
}

export function bootFor(brownfield: boolean): WizardBoot {
  return {
    schema: brownfield ? brownfieldSchema : greenfieldSchema,
    state: {},
    brownfield,
    brand: { displayName: BRAND.displayName, templatePrefix: BRAND.templatePrefix },
    workspace: { folder: "/sintetico/aberta", folderCount: 1 },
  };
}
