import { describe, it, expect, afterEach, vi } from "vitest";
import { EpicStop } from "../src/design-system/patterns/EpicStop/EpicStop";
import { epicStopName } from "../src/design-system/patterns/EpicStop/epicStopName";
import { accessibleName, cleanup, click, mount, rulesMatching, source } from "./support/component";

/** EpicStop do DS v2 (§4.2): uma parada da trilha, aba do tablist dos épicos. */

afterEach(cleanup);

const css = source("design-system/patterns/EpicStop/EpicStop.module.css");

function stop(c: HTMLElement): HTMLButtonElement {
  return c.querySelector("button")!;
}

describe("epicStopName (lógica pura)", () => {
  it("monta o nome da §4.2: 'Epic 0 · Fundação · 18% · em andamento · a missão está aqui'", () => {
    expect(epicStopName({ n: 0, label: "Fundação", status: "working", progress: 18.4, here: true })).toBe(
      "Epic 0 · Fundação · 18% · em andamento · a missão está aqui",
    );
  });

  it("fila não diz estado; progresso fica entre 0 e 100", () => {
    expect(epicStopName({ n: 3, label: "Kit", status: "queue", progress: 140 })).toBe("Epic 3 · Kit · 100%");
    expect(epicStopName({ n: 2, label: "Saneamento", status: "blocked" })).toBe("Epic 2 · Saneamento · bloqueado");
  });
});

describe("EpicStop — papel, nome e estados", () => {
  it("é uma aba (role=tab) com aria-selected, aria-controls e o nome completo", () => {
    const b = stop(mount(<EpicStop n={1} label="Marca" status="you" selected controls="epic-board" />));
    expect(b.getAttribute("role")).toBe("tab");
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(b.getAttribute("aria-controls")).toBe("epic-board");
    expect(accessibleName(b)).toBe("Epic 1 · Marca · decisão esperando você");
  });

  it("onde a missão está: aria-current=step", () => {
    const here = stop(mount(<EpicStop n={0} label="Fundação" status="working" here />));
    const other = stop(mount(<EpicStop n={1} label="Marca" />));
    expect(here.getAttribute("aria-current")).toBe("step");
    expect(other.hasAttribute("aria-current")).toBe(false);
    expect(rulesMatching(css, '.stop[data-here="true"] .circle')).toContain("var(--jt-mel)");
  });

  it("marcas de estado, nunca só cor: concluído troca o número por ✓; espera você ■; bloqueado ⊘", () => {
    const done = stop(mount(<EpicStop n={4} label="Docs" status="done" />));
    expect(done.querySelector("svg")?.getAttribute("data-status")).toBe("done");
    expect(done.textContent).not.toContain("4");
    expect(stop(mount(<EpicStop n={5} label="X" status="you" />)).querySelector('svg[data-status="you"]')).not.toBeNull();
    expect(stop(mount(<EpicStop n={6} label="Y" status="blocked" />)).querySelector('svg[data-status="blocked"]')).not.toBeNull();
  });

  it("o clique seleciona; tabIndex e onKeyDown passam (o tabindex itinerante é da trilha)", () => {
    const onClick = vi.fn();
    const b = stop(mount(<EpicStop n={0} label="Fundação" tabIndex={-1} onClick={onClick} />));
    expect(b.tabIndex).toBe(-1);
    click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("EpicStop — CSS de acessibilidade", () => {
  it("foco visível no círculo (3px afastado 2px), sem tirar o contorno sem substituto", () => {
    expect(rulesMatching(css, ".stop:focus-visible .circle")).toContain("var(--jt-size-focus-width) solid var(--jt-focus)");
  });

  it("selecionada: anel --jt-selected e rótulo em 600; forced-colors com Highlight", () => {
    expect(rulesMatching(css, '.stop[aria-selected="true"] .circle')).toContain("var(--jt-selected)");
    expect(rulesMatching(css, '.stop[aria-selected="true"] .label')).toContain("var(--jt-weight-semibold)");
    expect(css.slice(css.indexOf("@media (forced-colors: active)"))).toContain("Highlight");
  });

  it("forced-colors: o círculo de onde a missão está (preenchido) fica fora do ajuste, ou o número some atrás do Canvas", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(rulesMatching(fc, '.stop[data-here="true"] .circle')).toContain("forced-color-adjust: none");
    expect(rulesMatching(css, '.stop[data-here="true"] .circle')).toContain("var(--jt-fg-on-mel)");
  });
});
