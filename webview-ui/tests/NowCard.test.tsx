import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { NowCard, type NowDecisionView, type NowProblemView } from "../src/design-system/patterns/NowCard/NowCard";
import { accessibleName, cleanup, click, mount, rulesMatching, source } from "./support/component";

/** "Agora" do DS v2 (§4.3): seção, cartões com título, região viva com intervalo, decisão e o que está parado. */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const css = source("design-system/patterns/NowCard/NowCard.module.css");

const where = { initiative: "Modernização X", path: ["Execução", "Epic 0"] };
const noActivity = { count: 0, agents: [], lastEventText: "Último evento há 12 min" };
const working = { count: 2, agents: [{ name: "@migration-agent", task: "semeando repos/jatai" }, { name: "@test-backfill-agent" }], activityKey: "t1" };

function decision(id: string, title: string, onDecide = vi.fn()): NowDecisionView {
  return { id, title, detail: "Trava só a publicação, não o trabalho local.", onDecide };
}

function now(over: Partial<React.ComponentProps<typeof NowCard>> = {}) {
  return mount(<NowCard where={where} activity={noActivity} decisions={[]} problems={[]} {...over} />);
}

describe("NowCard — leitura", () => {
  it("é uma seção 'Agora' com um artigo por cartão, cada um com título", () => {
    const c = now({ activity: working, decisions: [decision("d1", "Titularidade do código")] });
    const section = c.querySelector("section")!;
    expect(section.getAttribute("aria-label")).toBe("Agora");
    const articles = [...section.querySelectorAll("article")];
    expect(articles).toHaveLength(2);
    expect(articles.map((a) => accessibleName(a).split(" ")[0])).toEqual(["2", "Titularidade"]);
  });

  it("diz onde a missão está: a iniciativa e o caminho", () => {
    const c = now();
    expect(c.querySelector("p")?.textContent?.replace(/\s+/g, " ")).toContain("Modernização X");
    expect(c.textContent).toContain("Execução");
    expect(c.textContent).toContain("Epic 0");
  });
});

describe("NowCard — atividade", () => {
  it("com agentes: a contagem e o que eles fazem; a contagem fica num role=status", () => {
    const c = now({ activity: working });
    const status = c.querySelector("[role='status']")!;
    expect(status.textContent).toBe("2 agentes trabalhando");
    expect(c.textContent).toContain("@migration-agent semeando repos/jatai · @test-backfill-agent");
    expect(c.querySelector("[class*='satellite']")).not.toBeNull();
  });

  it("sem agentes: 'Nenhum agente trabalhando', o último evento, e a órbita sem satélite", () => {
    const c = now();
    expect(c.querySelector("[role='status']")?.textContent).toBe("Nenhum agente trabalhando");
    expect(c.textContent).toContain("Último evento há 12 min");
    expect(c.querySelector("[class*='satellite']")).toBeNull();
  });

  it("obsoleto: o eyebrow vira '⚠ Sem atualização há 20 s' e a órbita some", () => {
    const c = now({ activity: { ...working, staleSeconds: 20 } });
    expect(c.textContent).toContain("⚠ Sem atualização há 20 s");
    expect(c.querySelector("[class*='satellite']")).toBeNull();
  });

  it("o anúncio muda no máximo a cada 10 segundos (nada de anúncio a cada tique)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    const c = now({ activity: { count: 1, agents: [{ name: "@a" }] } });
    // O primeiro texto já está no ar; a mudança só chega depois do intervalo.
    expect(c.querySelector("[role='status']")?.textContent).toBe("1 agente trabalhando");
    expect(c.querySelector("[role='status']")?.getAttribute("aria-live")).toBeNull(); // role=status já é educado (polite)
    const text = () => c.querySelector("[role='status']")!.textContent;
    act(() => vi.advanceTimersByTime(1_000));
    expect(text()).toBe("1 agente trabalhando");
  });
});

describe("NowCard — o que espera você", () => {
  it("nada esperando: 'Nada espera você agora', calmo, sem botão", () => {
    const c = now();
    expect(c.textContent).toContain("Nada espera você agora");
    expect(c.querySelector("button")).toBeNull();
    expect(c.querySelector("[data-kind='decision']")).toBeNull();
  });

  it("uma decisão: eyebrow 'Espera você', título, detalhe e o botão com o nome completo", () => {
    const onDecide = vi.fn();
    const c = now({ decisions: [decision("d1", "Titularidade do código", onDecide)] });
    const card = c.querySelector("[data-kind='decision']")!;
    expect(card.textContent).toContain("Espera você");
    expect(card.textContent).toContain("Titularidade do código");
    const button = card.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Decidir: Titularidade do código");
    click(button);
    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it("várias: a primeira em destaque, e 'Ver todas' abre a lista com um 'Decidir' para cada", () => {
    const second = vi.fn();
    const c = now({ decisions: [decision("d1", "Gate D3"), decision("d2", "Aprovar o kit", second), decision("d3", "Titularidade")] });
    const card = c.querySelector("[data-kind='decision']")!;
    expect(card.textContent).toContain("3 decisões");
    const all = [...card.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Ver todas"))!;
    expect(all.getAttribute("aria-expanded")).toBe("false");
    click(all);
    expect(all.getAttribute("aria-expanded")).toBe("true");
    const items = [...card.querySelectorAll("ul li")];
    expect(items.map((li) => li.querySelector("button")?.getAttribute("aria-label"))).toEqual(["Decidir: Aprovar o kit", "Decidir: Titularidade"]);
    click(items[0]!.querySelector("button"));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a decisão não pulsa: nada de animação infinita no cartão de decisão", () => {
    expect(rulesMatching(css, ".card")).not.toContain("infinite");
    expect(css).not.toMatch(/animation:[^;]*infinite/);
  });
});

describe("NowCard — o que está parado", () => {
  const problems: NowProblemView[] = [
    { key: "epic-0/task-1", kind: "blocked", title: "Kit canônico", reason: "bloqueada por task-0" },
    { key: "epic-0/task-2", kind: "failed", title: "CI", reason: "o teste de contrato caiu" },
  ];

  it("lista cada um com o motivo em texto (Bloqueado: …, Falhou: …), nunca só cor", () => {
    const c = now({ problems });
    const items = [...c.querySelectorAll("li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());
    expect(items).toEqual(["Kit canônico Bloqueado: bloqueada por task-0", "CI Falhou: o teste de contrato caiu"]);
    expect(c.querySelectorAll("li svg[aria-hidden='true']")).toHaveLength(2);
  });

  it("sem nada parado, a seção nem aparece", () => {
    expect(now().querySelector("[class*='problems']")).toBeNull();
  });
});

describe("NowCard — iniciativa que só se vê", () => {
  it("avisa que navegar não troca a ativa e oferece 'Tornar ativa'", () => {
    const onMakeActive = vi.fn();
    const c = now({ viewing: { activeName: "Modernização X", onMakeActive } });
    const note = c.querySelector("[role='note']")!;
    expect(note.textContent).toContain("a ativa é Modernização X");
    expect(note.textContent).toContain("Navegar não troca a ativa");
    click(note.querySelector("button"));
    expect(onMakeActive).toHaveBeenCalledTimes(1);
  });

  it("quando o registro não traz o detalhe das fases, o aviso diz por quê dentro da mesma nota", () => {
    const c = now({ viewing: { activeName: "Modernização X", onMakeActive: vi.fn(), detailNotice: "O detalhe das fases só carrega para a iniciativa ativa." } });
    const notes = c.querySelectorAll("[role='note']");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toContain("O detalhe das fases só carrega para a iniciativa ativa.");
  });

  it("sem o aviso de detalhe, a nota não inventa um", () => {
    const c = now({ viewing: { activeName: null, onMakeActive: vi.fn() } });
    expect(c.querySelector("[role='note']")!.textContent).not.toContain("detalhe das fases");
  });
});
