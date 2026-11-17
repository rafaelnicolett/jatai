import { describe, it, expect, afterEach } from "vitest";
import { StatusColumn } from "../src/design-system/patterns/StatusColumn/StatusColumn";
import { STATUS_COLUMN_ORDER, blockedText, tasksText } from "../src/design-system/patterns/StatusColumn/statusColumns";
import { TaskCard } from "../src/design-system/patterns/TaskCard/TaskCard";
import { accessibleName, cleanup, mount, rerender } from "./support/component";

/** StatusColumn do DS v2 (§4.5): seção com h2 "Fila, 3 tarefas" e uma lista de cards. */

afterEach(cleanup);

describe("statusColumns (lógica pura)", () => {
  it("ordem fixa: Fila · Trabalhando · Espera você · Feito; plural em pt-BR", () => {
    expect(STATUS_COLUMN_ORDER).toEqual(["queue", "working", "you", "done"]);
    expect(tasksText(1)).toBe("1 tarefa");
    expect(tasksText(3)).toBe("3 tarefas");
    expect(blockedText(2)).toBe("2 bloqueadas");
  });
});

describe("StatusColumn", () => {
  it("é uma <section> nomeada pelo h2 'Fila, 3 tarefas', com uma <ul> de <li>", () => {
    const c = mount(
      <StatusColumn status="queue">
        <TaskCard id="T1" title="A" variant="queue" />
        <TaskCard id="T2" title="B" variant="queue" />
        <TaskCard id="T3" title="C" variant="queue" />
      </StatusColumn>,
    );
    const section = c.querySelector("section")!;
    expect(section.querySelector("h2")).not.toBeNull();
    expect(accessibleName(section)).toBe("Fila, 3 tarefas");
    expect(section.querySelectorAll("ul > li > article")).toHaveLength(3);
  });

  it("coluna vazia mostra o cabeçalho com 0 e nenhuma lista", () => {
    const section = mount(<StatusColumn status="you" />).querySelector("section")!;
    expect(accessibleName(section)).toBe("Espera você, 0 tarefas");
    expect(section.querySelector("ul")).toBeNull();
  });

  it("bloqueio é sufixo do cabeçalho, com ⊘ e texto", () => {
    const section = mount(
      <StatusColumn status="queue" blockedCount={1}>
        <TaskCard id="T1" title="A" variant="queue" condition={{ kind: "blocked", reason: "bloqueada por T0.2" }} />
      </StatusColumn>,
    ).querySelector("section")!;
    expect(accessibleName(section)).toBe("Fila, 1 tarefa, 1 bloqueada");
    expect(section.querySelector('h2 svg[data-status="blocked"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o ● de Trabalhando só respira quando chega um evento (activityKey); a rajada recomeça a cada evento", () => {
    const c = mount(<StatusColumn status="working" />);
    const glyph = () => c.querySelector('h2 svg[data-status="working"]')!;
    const still = glyph().getAttribute("class") ?? "";
    rerender(c, <StatusColumn status="working" activityKey="evt-1" />);
    const first = glyph();
    expect(first.getAttribute("class")).not.toBe(still);
    rerender(c, <StatusColumn status="working" activityKey="evt-2" />);
    expect(glyph()).not.toBe(first);
  });

  it("aceita h3 quando o quadro já tem h2", () => {
    expect(mount(<StatusColumn status="done" headingLevel={3} />).querySelector("h3")).not.toBeNull();
  });
});
