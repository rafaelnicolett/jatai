import { describe, it, expect, afterEach, vi } from "vitest";
import { EpicBoard, type BoardColumnView } from "../src/design-system/patterns/EpicBoard/EpicBoard";
import { GateTimeline, type GateItemView } from "../src/design-system/patterns/GateTimeline/GateTimeline";
import { cleanup, click, mount, rulesMatching, source } from "./support/component";

/** Quadro do épico (§4.5) e linha do tempo de gates (§4.6) do DS v2. */

afterEach(cleanup);

const boardCss = source("design-system/patterns/EpicBoard/EpicBoard.module.css");

const columns: BoardColumnView[] = [
  { status: "queue", blockedCount: 1, tasks: [{ key: "t2", id: "task-2", title: "Kit canônico", column: "queue", meta: "@test-backfill-agent", condition: { kind: "blocked", reason: "bloqueada por task-1" } }] },
  { status: "working", blockedCount: 0, tasks: [{ key: "t1", id: "task-1", title: "Semear o repositório", column: "working", meta: "@migration-agent" }] },
  { status: "you", blockedCount: 0, tasks: [{ key: "t3", id: "task-3", title: "Titularidade", column: "you", action: { label: "Ver o que está em jogo", onClick: vi.fn() } }] },
  { status: "done", blockedCount: 0, tasks: [{ key: "t0", id: "task-0", title: "Escopo cortado", column: "done", condition: { kind: "cancelled", reason: "decisão do dono" } }] },
];

function board(over: Partial<React.ComponentProps<typeof EpicBoard>> = {}) {
  return mount(<EpicBoard id="epic-board" labelledBy="stop-epic-0" title="Epic 0 · Fundação" description="repositório isolado e CI" columns={columns} {...over} />);
}

describe("EpicBoard — landmark e colunas", () => {
  it("é o tabpanel da parada selecionada, com o único h1 visível e as 4 colunas na ordem fixa", () => {
    const c = board();
    const panel = c.querySelector("section#epic-board")!;
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("stop-epic-0");
    expect(panel.querySelector("h1")?.textContent).toBe("Epic 0 · Fundação");
    const headings = [...panel.querySelectorAll("section h2")].map((h) => h.textContent?.replace(/\s+/g, " ").trim() ?? "");
    expect(headings.map((h) => h.split(",")[0]!.replace(/ \d.*$/, ""))).toEqual(["Fila", "Trabalhando", "Espera você", "Feito"]);
    // A contagem e o bloqueio entram no título da coluna, em texto.
    expect(headings[0]).toContain("1 tarefa");
    expect(headings[0]).toContain("1 bloqueada");
  });

  it("cada coluna é uma seção com lista de cartões; o status vem do título da coluna", () => {
    const c = board();
    const sections = [...c.querySelectorAll("section[data-status]")];
    expect(sections.map((x) => x.getAttribute("data-status"))).toEqual(["queue", "working", "you", "done"]);
    expect(sections.map((x) => x.querySelectorAll("ul > li > article").length)).toEqual([1, 1, 1, 1]);
  });

  it("bloqueado é condição do cartão (fica na Fila, com o motivo em texto); cancelado vai para o Feito, com o motivo", () => {
    const c = board();
    const queue = c.querySelector("section[data-status='queue']")!;
    expect(queue.querySelector("article")?.getAttribute("data-condition")).toBe("blocked");
    expect(queue.textContent).toContain("Bloqueado: bloqueada por task-1");
    const done = c.querySelector("section[data-status='done']")!;
    expect(done.querySelector("article")?.getAttribute("data-condition")).toBe("cancelled");
    expect(done.textContent).toContain("Cancelado: decisão do dono");
  });

  it("a ação do cartão que espera você chama o que o dono pediu", () => {
    const onClick = vi.fn();
    const c = board({ columns: columns.map((col) => (col.status === "you" ? { ...col, tasks: [{ ...col.tasks[0]!, action: { label: "Ver o que está em jogo", onClick } }] } : col)) });
    click([...c.querySelectorAll("button")].find((b) => b.textContent === "Ver o que está em jogo"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("só o título vira botão de detalhes, nunca o cartão inteiro", () => {
    const onOpen = vi.fn();
    const c = board({ columns: columns.map((col) => (col.status === "working" ? { ...col, tasks: [{ ...col.tasks[0]!, onOpen }] } : col)) });
    const working = c.querySelector("section[data-status='working']")!;
    const button = working.querySelector("article button")!;
    expect(button.textContent).toBe("Semear o repositório");
    click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("sem cartão nenhum, diz por que está vazio, e sem parada vira uma região nomeada", () => {
    const empty = board({ columns: columns.map((c) => ({ ...c, tasks: [], blockedCount: 0 })), empty: { title: "Ainda sem tarefas abertas", body: 'Começa quando "Fundação" fechar.' } });
    expect(empty.textContent).toContain('Começa quando "Fundação" fechar.');
    const noStop = board({ labelledBy: undefined });
    expect(noStop.querySelector("section#epic-board")?.getAttribute("role")).toBeNull();
    expect(noStop.querySelector("section#epic-board")?.getAttribute("aria-label")).toBe("Epic 0 · Fundação");
  });
});

describe("EpicBoard — responsivo pela largura do próprio quadro", () => {
  it("1 coluna abaixo de 420px, 2 × 2 de 420 a 759px e 4 a partir de 760px (container query)", () => {
    expect(boardCss).toContain("container-type: inline-size");
    expect(boardCss).toContain("@container (min-width: 420px)");
    expect(boardCss).toContain("@container (min-width: 760px)");
    expect(rulesMatching(boardCss, ".grid")).toContain("minmax(0, 1fr)");
  });
});

describe("GateTimeline", () => {
  const items: GateItemView[] = [
    { badge: "D1", title: "Descoberta · 2 repositórios", status: "approved", meta: "✓ aprovado em 25/08 por Pessoa Fictícia" },
    { badge: "D2", title: "Planejamento → Execução", status: "waiting", meta: "espera você", onReview: vi.fn() },
    { badge: "D3", title: "Execução → Operação", status: "future", meta: "2 tarefas abertas" },
  ];

  it("é uma aside 'Gates' com uma lista; cada item é lido inteiro, com o estado em texto", () => {
    const c = mount(<GateTimeline items={items} />);
    const aside = c.querySelector("aside")!;
    expect(aside.getAttribute("aria-label")).toBe("Gates");
    const text = [...aside.querySelectorAll("ol > li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());
    expect(text[0]).toBe("D1, aprovadoDescoberta · 2 repositórios✓ aprovado em 25/08 por Pessoa Fictícia");
    expect(text[2]).toContain("D3, depois");
  });

  it("o gate que espera você tem 'Revisar o gate', com o nome completo, que abre a decisão", () => {
    const onReview = vi.fn();
    const c = mount(<GateTimeline items={items.map((i) => (i.badge === "D2" ? { ...i, onReview } : i))} />);
    const button = c.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Revisar o gate D2: Planejamento → Execução");
    expect(c.querySelectorAll("button")).toHaveLength(1);
    click(button);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("o estado também vai na forma do selo: aprovado sólido, depois tracejado, e ■ no que espera você", () => {
    const c = mount(<GateTimeline items={items} />);
    expect(c.querySelectorAll("li")[1]?.querySelector("svg[data-status='you']")).not.toBeNull();
  });

  it("sem gates, diz isso em uma linha calma", () => {
    const c = mount(<GateTimeline items={[]} empty="Esta iniciativa ainda não tem gates." />);
    expect(c.querySelector("ol")).toBeNull();
    expect(c.textContent).toContain("Esta iniciativa ainda não tem gates.");
  });
});
