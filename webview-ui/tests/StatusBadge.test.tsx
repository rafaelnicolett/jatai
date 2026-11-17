import { describe, it, expect, afterEach } from "vitest";
import { StatusBadge } from "../src/design-system/patterns/StatusBadge/StatusBadge";
import { StatusGlyph } from "../src/design-system/primitives/StatusGlyph/StatusGlyph";
import {
  WORK_STATUSES,
  WORK_STATUS_INFO,
  describeWorkStatus,
  toWorkStatus,
  workStatusFromPlanItem,
} from "../src/design-system/status/workStatus";
import { accessibleName, cleanup, mount, rulesMatching, source } from "./support/component";

/**
 * StatusGlyph + StatusBadge do DS v2 (§3.3, §4.10, §4.13) com os status de
 * trabalho da ADR-0022. Princípio 2 da v2: cor nunca trabalha sozinha. Cada
 * status tem forma de glifo própria e texto.
 */

afterEach(cleanup);

describe("workStatus — vocabulário v2 + ADR-0022 (lógica pura)", () => {
  it("cada um dos 8 status tem rótulo pt-BR, família de cor e diz se exige motivo", () => {
    expect(WORK_STATUSES).toHaveLength(8);
    expect(WORK_STATUS_INFO.blocked).toMatchObject({ label: "Bloqueado", tone: "blocked", needsReason: true });
    expect(WORK_STATUS_INFO.failed).toMatchObject({ label: "Falhou", tone: "blocked", needsReason: true });
    expect(WORK_STATUS_INFO.cancelled).toMatchObject({ label: "Cancelado", needsReason: true, closed: true });
    expect(WORK_STATUS_INFO.you.label).toBe("Espera você");
  });

  it("PlanItemStatus vira status v2 pela tabela da §3.3 (pending depois de gate aberto vira 'depois')", () => {
    expect(workStatusFromPlanItem("pending")).toBe("queue");
    expect(workStatusFromPlanItem("pending", { afterOpenGate: true })).toBe("future");
    expect(workStatusFromPlanItem("running")).toBe("working");
    expect(workStatusFromPlanItem("review")).toBe("you");
    expect(workStatusFromPlanItem("done")).toBe("done");
    expect(workStatusFromPlanItem("blocked")).toBe("blocked");
    expect(toWorkStatus("failed")).toBe("failed");
    expect(toWorkStatus("running")).toBe("working");
  });

  it("o texto completo leva o motivo: 'Falhou: timeout no CI'", () => {
    expect(describeWorkStatus("failed", " timeout no CI ")).toBe("Falhou: timeout no CI");
    expect(describeWorkStatus("done")).toBe("Feito");
  });
});

describe("StatusGlyph — forma própria por status, sempre aria-hidden", () => {
  it("os 8 glifos são desenhos diferentes entre si (nenhum status depende só da cor)", () => {
    const shapes = WORK_STATUSES.map((st) => mount(<StatusGlyph status={st} />).querySelector("svg")!.innerHTML);
    expect(new Set(shapes).size).toBe(WORK_STATUSES.length);
  });

  it("é decorativo: aria-hidden e não focável", () => {
    const svg = mount(<StatusGlyph status="blocked" />).querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
  });

  it("forced-colors: o glifo usa currentColor e cai em CanvasText", () => {
    const css = source("design-system/primitives/StatusGlyph/StatusGlyph.module.css");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("CanvasText");
  });

  it("a rajada do ● para com movimento reduzido (repetições pelo token, zeradas na v2)", () => {
    const css = source("design-system/primitives/StatusGlyph/StatusGlyph.module.css");
    expect(rulesMatching(css, ".pulse")).toContain("var(--jt-iterations-burst)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("StatusBadge — glifo + texto, com motivo (ADR-0022)", () => {
  it("blocked mostra ⊘ e o motivo em texto; o nome acessível é o texto inteiro", () => {
    const badge = mount(<StatusBadge status="blocked" reason="bloqueada por T0.2" />).firstElementChild!;
    expect(badge.getAttribute("data-status")).toBe("blocked");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(accessibleName(badge)).toBe("Bloqueado: bloqueada por T0.2");
  });

  it("failed usa a família do bloqueio, com glifo e texto próprios ('Falhou: <motivo>')", () => {
    const badge = mount(<StatusBadge status="failed" reason="timeout no CI" />).firstElementChild!;
    expect(badge.getAttribute("data-tone")).toBe("blocked");
    expect(badge.querySelector("svg")?.getAttribute("data-status")).toBe("failed");
    expect(accessibleName(badge)).toBe("Falhou: timeout no CI");
  });

  it("cancelled sai riscado, com o motivo", () => {
    const badge = mount(<StatusBadge status="cancelled" reason="escopo cortado" />).firstElementChild!;
    expect(badge.getAttribute("data-status")).toBe("cancelled");
    expect(accessibleName(badge)).toBe("Cancelado: escopo cortado");
    const css = source("design-system/patterns/StatusBadge/StatusBadge.module.css");
    expect(rulesMatching(css, '[data-status="cancelled"]')).toContain("line-through");
  });

  it("compacto: só o glifo na tela, o texto completo no nome acessível e na dica", () => {
    const badge = mount(<StatusBadge status="running" compact />).firstElementChild!;
    expect(badge.getAttribute("data-status")).toBe("working");
    expect(accessibleName(badge)).toBe("Trabalhando");
    expect(badge.getAttribute("title")).toBe("Trabalhando");
  });

  it("aceita o PlanItemStatus legado (review → 'Espera você') e um rótulo próprio", () => {
    expect(accessibleName(mount(<StatusBadge status="review" />).firstElementChild!)).toBe("Espera você");
    expect(accessibleName(mount(<StatusBadge status="done" label="Concluído" />).firstElementChild!)).toBe("Concluído");
  });

  it("alto contraste e forced-colors: fundo some (token) e entra a borda de 1px no traço do status", () => {
    const css = source("design-system/patterns/StatusBadge/StatusBadge.module.css");
    expect(rulesMatching(css, "vscode-high-contrast")).toContain("var(--badge-line)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
