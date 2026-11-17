import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";

// O estado que a visão persiste fica em memória por cenário, como o mock faz.
const env = vi.hoisted(() => {
  const persisted: { state: unknown } = { state: undefined };
  (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage: () => undefined,
    getState: () => persisted.state,
    setState: (s: unknown) => {
      persisted.state = s;
    },
  });
  return { persisted };
});

// Um store novo por cenário (o do app é um singleton).
const holder = vi.hoisted(() => ({ store: undefined as unknown }));
vi.mock("../src/store/CockpitStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/store/CockpitStore")>();
  holder.store = new actual.CockpitStore();
  return {
    ...actual,
    get cockpitStore() {
      return holder.store as InstanceType<typeof actual.CockpitStore>;
    },
  };
});

import { ShellRoot } from "../src/apps/cockpit/ShellRoot";
import { CockpitStore } from "../src/store/CockpitStore";
import { COCKPIT_SCENARIOS, scenarioFromSearch, type CockpitScenario } from "../src/mock/cockpitScenarios";
import { cleanup, mount } from "./support/component";

/**
 * Os cenários do mock visual (`mock.html?scenario=<id>`) são a prova visual da
 * F4.2: se um deles deixar de mostrar o estado que promete, a captura mente.
 * Este teste monta cada um no `ShellRoot` e confere a frase que o define.
 */
beforeEach(() => {
  env.persisted.state = undefined;
  holder.store = new CockpitStore();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const store = (): CockpitStore => holder.store as CockpitStore;
const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const main = (): string => text(document.querySelector("main"));

function open(scenario: CockpitScenario): void {
  env.persisted.state = scenario.persisted;
  mount(<ShellRoot />);
  act(() => {
    if (scenario.degraded) store().handleMessage({ type: "shell/degraded", payload: scenario.degraded });
    if (scenario.snapshot) store().handleMessage({ type: "shell/snapshot", seq: 1, generatedAt: new Date().toISOString(), payload: scenario.snapshot() });
  });
}

const CHECKS: Record<string, () => void> = {
  execucao: () => {
    const conditions = [...document.querySelectorAll("#epic-board article[data-condition]")].map((a) => a.getAttribute("data-condition")).sort();
    expect(conditions).toEqual(["blocked", "cancelled", "failed"]);
    expect(main()).toContain("Bloqueado: bloqueada por task-3");
    expect(main()).toContain("Falhou: o teste de contrato caiu");
    expect(main()).toContain("Cancelado: escopo cortado pelo dono");
    expect(main()).toContain("Espera você · 2 decisões");
    expect(main()).toContain("1 agente trabalhando");
  },
  decisoes: () => {
    expect(main()).toContain("Espera você · 3 decisões");
    expect(main()).toContain("Gate D3 · Modernização de pagamentos");
  },
  "em-dia": () => expect(main()).toContain("Nada espera você agora"),
  descoberta: () => {
    expect(document.querySelector("[role='tablist'][aria-label='Repositórios da Descoberta']")).not.toBeNull();
    expect(main()).toContain("Gate D1");
  },
  "outra-iniciativa": () => {
    expect(text(document.querySelector("[role='note']"))).toContain("a ativa é Modernização de pagamentos");
    expect(main()).toContain("Corrigir o cálculo de juros");
  },
  "sem-detalhe": () => expect(text(document.querySelector("[role='note']"))).toContain("O detalhe das fases só carrega para a iniciativa ativa."),
  "sem-iniciativa": () => expect(text(document.querySelector("main h1"))).toBe("Ainda não há iniciativa"),
  "sem-foundation": () => expect(text(document.querySelector("main h1"))).toBe("A Foundation ainda não começou"),
  "sem-pasta": () => expect(text(document.querySelector("main h1"))).toBe("Nenhuma pasta aberta"),
  conectando: () => expect(text(document.querySelector("main h1"))).toBe("Conectando…"),
  espera: () => undefined, // precisa do relógio falso desde o mount: tem o teste próprio, abaixo
  erro: () => {
    expect(text(document.querySelector("[role='alert']"))).toContain("O Cockpit falhou ao desenhar");
    expect(document.querySelector("header")).not.toBeNull();
  },
};

describe("cenários do mock visual do Cockpit", () => {
  it("todo cenário tem a verificação da frase que o define, e nenhuma sobra", () => {
    expect(Object.keys(CHECKS).sort()).toEqual(Object.keys(COCKPIT_SCENARIOS).sort());
  });

  for (const scenario of Object.values(COCKPIT_SCENARIOS)) {
    if (scenario.id === "espera") continue;
    it(`"${scenario.id}": ${scenario.title}`, () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined); // o cenário "erro" faz o React registrar a exceção que o boundary segura
      open(scenario);
      CHECKS[scenario.id]!();
    });
  }

  it('"espera": passado o prazo, a tela explica e oferece "Tentar de novo"', () => {
    vi.useFakeTimers();
    open(COCKPIT_SCENARIOS.espera!);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(text(document.querySelector("main h1"))).toBe("O estado do projeto não chegou");
    expect([...document.querySelectorAll("main button")].map(text)).toEqual(["Tentar de novo"]);
  });

  it("sem o parâmetro (ou com um id que não existe) o mock segue como sempre", () => {
    expect(scenarioFromSearch("")).toBeNull();
    expect(scenarioFromSearch("?scenario=nao-existe")).toBeNull();
    expect(scenarioFromSearch("?scenario=decisoes")?.id).toBe("decisoes");
  });
});
