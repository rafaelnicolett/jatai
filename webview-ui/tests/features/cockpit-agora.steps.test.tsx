import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, type ComponentProps } from "react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioTitles } from "../../../tests/features/gherkin";

// O que o Cockpit manda ao host é capturado, e o estado que a visão persiste fica em memória por cenário.
const env = vi.hoisted(() => {
  const posted: Array<Record<string, unknown>> = [];
  const persisted: { state: unknown } = { state: undefined };
  (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    getState: () => persisted.state,
    setState: (s: unknown) => {
      persisted.state = s;
    },
  });
  return { posted, persisted };
});

// Um store novo por cenário: o do app é um singleton, e "antes do primeiro snapshot" e "sem pasta aberta"
// precisam de um store que nunca recebeu nada.
const holder = vi.hoisted(() => ({ store: undefined as unknown }));
vi.mock("../../src/store/CockpitStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/store/CockpitStore")>();
  holder.store = new actual.CockpitStore();
  return {
    ...actual,
    get cockpitStore() {
      return holder.store as InstanceType<typeof actual.CockpitStore>;
    },
  };
});

// A tela pode ser forçada a falhar ao desenhar (o cenário do ErrorBoundary); fora disso é a tela de verdade.
const screen = vi.hoisted(() => ({ failing: false }));
vi.mock("../../src/apps/cockpit/screens/CockpitScreen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/apps/cockpit/screens/CockpitScreen")>();
  return {
    ...actual,
    CockpitScreen: (props: ComponentProps<typeof actual.CockpitScreen>) => {
      if (screen.failing) throw new Error("o quadro não conseguiu ler o épico");
      return actual.CockpitScreen(props);
    },
  };
});

import { ShellRoot } from "../../src/apps/cockpit/ShellRoot";
import { CockpitStore } from "../../src/store/CockpitStore";
import { buildSnapshot } from "../../src/mock/snapshotBuilder";
import { EPIC_STATUS_RUNNING, REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "../support/cockpitFixtures";
import { cleanup, click, mount } from "../support/component";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";

/**
 * Step definitions de `cockpit-agora.feature` (F4.2, parte 2): o `ShellRoot` de
 * verdade no jsdom, alimentado pelo store com um snapshot que passa pelos
 * mesmos parsers do host. Nenhum cenário abre o VS Code; o que sai para o host
 * é capturado em `env.posted`. O que o operador lê (o "Agora", a trilha, o
 * quadro, os avisos) é o DOM; as decisões de tela estão nas funções puras, que
 * têm os testes delas (`deriveAgora.test.ts` e vizinhos).
 *
 * A iniciativa dos cenários se chama "mod-x" (id); na tela aparece pelo nome
 * dela, "Modernização X".
 */
const FEATURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tests/features/cockpit-agora.feature");

let seq = 0;

beforeEach(() => {
  env.posted.length = 0;
  env.persisted.state = undefined;
  holder.store = new CockpitStore();
  screen.failing = false;
  seq = 0;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const store = (): CockpitStore => holder.store as CockpitStore;

function deliver(snapshot: CockpitSnapshot): void {
  act(() => store().handleMessage({ type: "shell/snapshot", seq: ++seq, generatedAt: new Date().toISOString(), payload: snapshot }));
}

/** "O operador abre o Cockpit": monta a raiz de verdade e entrega o primeiro snapshot. */
function openCockpit(snapshot: CockpitSnapshot, props: ComponentProps<typeof ShellRoot> = {}): void {
  mount(<ShellRoot {...props} />);
  deliver(snapshot);
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function find<T extends Element = HTMLElement>(selector: string, scope: ParentNode = document): T {
  const el = scope.querySelector<T>(selector);
  if (!el) throw new Error(`não achei: ${selector}`);
  return el;
}

function buttonNamed(name: string, scope: ParentNode = document): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find((b) => text(b).includes(name) || (b.getAttribute("aria-label") ?? "").includes(name));
  if (!button) throw new Error(`não achei o botão "${name}"`);
  return button;
}

const agora = (): HTMLElement => find("section[aria-label='Agora']");
const live = (): string => text(find("[data-live-region='cockpit']"));
const bar = (): HTMLElement => find("header");

/** "O operador navega para a iniciativa": o seletor da barra, a opção pelo nome. */
function navigateTo(name: string): void {
  click(find("button[aria-haspopup='listbox']", bar()));
  const option = [...document.querySelectorAll("[role='listbox'] [role='option']")].find((o) => text(o).includes(name));
  click(option);
}

function column(name: string): HTMLElement {
  const col = [...document.querySelectorAll<HTMLElement>("#epic-board section[data-status]")].find((c) => text(c.querySelector("h2")).startsWith(name));
  if (!col) throw new Error(`não achei a coluna "${name}"`);
  return col;
}

const cardOf = (taskId: string, scope: ParentNode): HTMLElement => {
  const card = [...scope.querySelectorAll<HTMLElement>("article")].find((a) => text(a).includes(taskId));
  if (!card) throw new Error(`não achei o cartão "${taskId}"`);
  return card;
};

const DECISION_REQUESTED = { run_id: "r5", event_type: "decision-requested", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", task_id: "epic-0/task-9", message: "titularidade do código", metadata: { reason: "antes de licenciar como MIT" } };

/** Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento. */
const modXRunning = (events: Array<Record<string, unknown>> = []): CockpitSnapshot => modernizationSnapshot({ parts: { events } });

/** E uma segunda iniciativa registrada, com a "mod-x" ativa. */
function modXWith(second: string): CockpitSnapshot {
  return buildSnapshot({
    reposYaml: REPOS_YAML,
    foundationYaml: foundationYaml({ d1: "approved" }),
    initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ d2: true, scope: ["api"], epicStatus: EPIC_STATUS_RUNNING }), second]),
  });
}
const HOTFIX_Y = initiativeYaml({ id: "hotfix-y", name: "Hotfix Y", type: "hotfix", epics: ["wave-1: Diagnóstico", "wave-2: Correção"] });
const FEAT_Z = initiativeYaml({ id: "feat-z", name: "Feature Z", type: "feature", mode: "greenfield", epics: [] });

const switchRequests = (): Array<Record<string, unknown>> => env.posted.filter((m) => m.type === "switchInitiative");

const CONDITIONS = [
  { condition: "blocked", reason: "bloqueada por task-0", column: "Fila", text: "Bloqueado: bloqueada por task-0" },
  { condition: "failed", reason: "o teste de contrato caiu", column: "Fila", text: "Falhou: o teste de contrato caiu" },
  { condition: "cancelled", reason: "escopo cortado pelo dono", column: "Feito", text: "Cancelado: escopo cortado pelo dono" },
];

/** Dado a tarefa "epic-0/task-1" está "<condição>" pelo motivo "<motivo>". */
const withTaskCondition = (condition: string, reason: string): CockpitSnapshot =>
  modernizationSnapshot({ epicStatus: `epic-0:\n  status: in-progress\n  items:\n    task-1: { status: ${condition}, reason: ${JSON.stringify(reason)} }\n    task-2: { status: pending }` });

const SCENARIOS: Record<string, () => void> = {
  'O "Agora" diz onde a missão está': () => {
    openCockpit(modXRunning());
    const where = text(find("p", agora()));
    expect(where).toContain("Modernização X");
    expect(where).toContain("Execução");
    expect(where).toContain("Epic 0");
    const current = [...document.querySelectorAll("nav[aria-label='Trilha da missão'] li[aria-current='step']")];
    expect(current).toHaveLength(1);
    expect(text(current[0])).toContain("Execução");
    expect(text(current[0])).toContain("Você está aqui");
  },

  'O "Agora" lista o que espera o operador, com o gate primeiro': () => {
    const snapshot = modernizationSnapshot({
      epicStatus: "epic-0:\n  status: done\n  items:\n    task-1: { status: done }\n    task-2: { status: done, requires_approval: true, summary: 'Kit canônico' }",
      parts: { events: [DECISION_REQUESTED] },
    });
    openCockpit(snapshot);
    const card = find("article[data-kind='decision']", agora());
    expect(text(card)).toContain("Espera você · 3 decisões");
    expect(text(find("[id$='-decision']", card))).toBe("Gate D3 · Modernização X");
    expect(text(buttonNamed("Ver todas", card))).toBe("Ver todas (3)");
    // Abrir o Cockpit não lê em voz alta o que já esperava: só a decisão que chega depois é anunciada.
    expect(live()).toBe("");
  },

  'Quando nada espera o operador, o "Agora" diz que está em dia': () => {
    openCockpit(modXRunning());
    expect(text(find("article[data-kind='calm']", agora()))).toContain("Nada espera você agora");
    expect(agora().querySelector("article[data-kind='decision']")).toBeNull();
  },

  "Um agente trabalhando aparece como atividade": () => {
    const started = { run_id: "r1", event_type: "agent-started", timestamp: "2026-11-16T10:00:00Z", initiative_id: "mod-x", agent_id: "migration-agent", task_id: "epic-0/task-1", message: "semeando repos/jatai" };
    openCockpit(modXRunning([started]));
    const card = find("article[data-kind='activity']", agora());
    expect(text(find("[role='status']", card))).toBe("1 agente trabalhando");
    expect(text(card)).toContain("@migration-agent");
  },

  'Um bloqueio também aparece no "Agora", com o motivo em texto': () => {
    openCockpit(withTaskCondition("blocked", "bloqueada por task-0"));
    const stopped = find("li[data-kind='blocked']", agora());
    expect(text(stopped)).toContain("task-1");
    expect(text(stopped)).toContain("Bloqueado: bloqueada por task-0");
  },

  "Navegar para outra iniciativa não muda a iniciativa ativa": () => {
    openCockpit(modXWith(HOTFIX_Y));
    navigateTo("Hotfix Y");
    expect(text(find("p", agora()))).toContain("Hotfix Y");
    expect(text(find("[role='note']", agora()))).toContain("a ativa é Modernização X");
    expect(store().getSnapshot().snapshot?.initiatives?.active).toBe("mod-x");
    expect(switchRequests()).toEqual([]);
  },

  "Tornar ativa é uma ação explícita": () => {
    openCockpit(modXWith(HOTFIX_Y));
    navigateTo("Hotfix Y");
    expect(switchRequests()).toEqual([]);
    click(buttonNamed("Tornar ativa", find("[role='note']", agora())));
    expect(switchRequests()).toEqual([{ type: "switchInitiative", id: "hotfix-y" }]);
  },

  "A iniciativa que não é a ativa mostra o que o registro sabe e avisa do detalhe": () => {
    openCockpit(modXWith(FEAT_Z));
    navigateTo("Feature Z");
    const note = find("[role='note']", agora());
    expect(text(note)).toContain("O detalhe das fases só carrega para a iniciativa ativa.");
    expect(text(buttonNamed("Tornar ativa", note))).toBe("Tornar ativa");
  },

  "Sem iniciativa, o primeiro uso oferece criar uma": () => {
    openCockpit(buildSnapshot({ mode: "greenfield" }));
    const page = find("main");
    expect(text(find("h1", page))).toBe("Ainda não há iniciativa");
    click(buttonNamed("Nova iniciativa", page));
    expect(env.posted).toEqual([{ type: "newInitiative" }]);
  },

  "Sem pasta aberta, o Cockpit oferece abrir uma pasta": () => {
    mount(<ShellRoot />);
    act(() => store().handleMessage({ type: "shell/degraded", payload: { source: "workspace", message: "Nenhuma pasta aberta no editor." } }));
    const page = find("main");
    expect(text(find("h1", page))).toBe("Nenhuma pasta aberta");
    // A ação é UMA, e é a da página: a barra não oferece "Nova iniciativa" enquanto não há estado conhecido.
    expect([...bar().querySelectorAll("button")].map(text)).not.toContain("Nova iniciativa");
    click(buttonNamed("Abrir o assistente", page));
    expect(env.posted).toEqual([{ type: "runCommand", command: expect.stringMatching(/\.initializeDeliveryKit$/) }]);
  },

  "Sem Foundation, o Cockpit oferece começar a Descoberta": () => {
    openCockpit(buildSnapshot({ mode: "brownfield" }));
    // A Descoberta é a visão do workspace brownfield sem iniciativa; o seletor da barra a oferece e o operador a abre.
    click(find("button[aria-haspopup='listbox']", bar()));
    click([...document.querySelectorAll("[role='listbox'] [role='option']")].find((o) => text(o).includes("Descoberta")));
    const page = find("main");
    expect(text(find("h1", page))).toBe("A Foundation ainda não começou");
    click(buttonNamed("Começar a Descoberta", page));
    expect(env.posted).toEqual([{ type: "injectRaw", prompt: expect.stringContaining("Descoberta") }]);
  },

  "Sem resposta do State Service, a espera tem prazo e oferece tentar de novo": () => {
    vi.useFakeTimers();
    mount(<ShellRoot />);
    expect(text(find("main"))).toContain("Conectando…");
    expect(find("main [aria-busy='true']")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    const page = find("main");
    expect(text(find("h1", page))).toBe("O estado do projeto não chegou");
    expect(text(page)).toContain("Esperamos 9 segundos");
    expect(page.querySelector("[aria-busy='true']")).toBeNull();
    expect([...bar().querySelectorAll("button")].map(text)).not.toContain("Nova iniciativa"); // a única ação é "Tentar de novo"
    click(buttonNamed("Tentar de novo", page));
    expect(env.posted).toEqual([{ type: "shell/requestSnapshot" }]);
  },

  "Uma falha numa tela não apaga o Cockpit": () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // o React registra a exceção que o ErrorBoundary segura
    screen.failing = true;
    openCockpit(modXRunning());
    const alert = find("[role='alert']");
    expect(text(alert)).toContain("O Cockpit falhou ao desenhar");
    expect(text(alert)).toContain("o quadro não conseguiu ler o épico");
    expect(text(buttonNamed("Tentar de novo", alert))).toBe("Tentar de novo");
    // O resto do Cockpit continua à vista: a barra com o seletor, e o teclado.
    expect(find("button[aria-haspopup='listbox']", bar())).not.toBeNull();
    expect(buttonNamed("Mapa", bar())).not.toBeNull();
    // E há como recuperar: com o motivo resolvido, "Tentar de novo" traz a tela de volta.
    screen.failing = false;
    click(buttonNamed("Tentar de novo", alert));
    expect(document.querySelector("[role='alert']")).toBeNull();
    expect(find("section[aria-label='Agora']")).not.toBeNull();
  },

  "Uma decisão nova é anunciada uma vez, numa região viva": () => {
    vi.useFakeTimers();
    openCockpit(modXRunning());
    expect(live()).toBe(""); // abrir o Cockpit não lê em voz alta o que já esperava
    deliver(modXRunning([DECISION_REQUESTED]));
    expect(live()).toBe("Nova decisão espera você: Titularidade do código");
    // O texto some depois de alguns segundos; o mesmo estado, entregue de novo, não volta a anunciar.
    act(() => {
      vi.advanceTimersByTime(6_500);
    });
    expect(live()).toBe("");
    deliver(modXRunning([DECISION_REQUESTED]));
    expect(live()).toBe("");
  },

  'O botão "Mapa" fica na barra superior e liga a troca de visão': () => {
    const onOpenMap = vi.fn();
    openCockpit(modXRunning(), { onOpenMap });
    const button = buttonNamed("Mapa", bar());
    expect(button.closest("header")).not.toBeNull();
    expect(onOpenMap).not.toHaveBeenCalled();
    click(button);
    expect(onOpenMap).toHaveBeenCalledTimes(1);
  },
};

for (const c of CONDITIONS) {
  SCENARIOS[`Uma tarefa parada mostra a condição em texto, com o motivo [${c.condition} · ${c.reason} · ${c.column} · ${c.text}]`] = () => {
    openCockpit(withTaskCondition(c.condition, c.reason));
    const card = cardOf("task-1", column(c.column));
    expect(card.getAttribute("data-condition")).toBe(c.condition);
    expect(text(card)).toContain(c.text);
  };
}

describe('Funcionalidade: Entrada "Agora" do Cockpit', () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
