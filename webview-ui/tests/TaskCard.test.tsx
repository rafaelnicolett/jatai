import { describe, it, expect, afterEach, vi } from "vitest";
import { TaskCard } from "../src/design-system/patterns/TaskCard/TaskCard";
import { accessibleName, cleanup, click, mount, rulesMatching, source } from "./support/component";

/**
 * TaskCard do DS v2 (§4.5) com as condições da ADR-0022 (§7): bloqueado é
 * condição do card com motivo; falhou usa a mesma família, com glifo e texto
 * próprios; cancelado vai riscado, com o motivo.
 */

afterEach(cleanup);

const css = source("design-system/patterns/TaskCard/TaskCard.module.css");

describe("TaskCard — estrutura e nome", () => {
  it("é um <article> nomeado pelo título (h3), com id, meta e tempo", () => {
    const c = mount(<TaskCard id="T0.2" title="Semear repos/jatai" variant="working" meta="@migration-agent" elapsed="há 12 min" />);
    const article = c.querySelector("article")!;
    expect(accessibleName(article)).toBe("Semear repos/jatai");
    expect(article.querySelector("h3")?.textContent).toBe("Semear repos/jatai");
    expect(article.getAttribute("data-variant")).toBe("working");
    expect(c.textContent).toContain("T0.2");
    expect(c.textContent).toContain("há 12 min");
  });

  it("onOpen: só o título vira botão (o card inteiro nunca é botão)", () => {
    const onOpen = vi.fn();
    const c = mount(<TaskCard id="T1" title="CI mínimo" variant="queue" onOpen={onOpen} />);
    const buttons = c.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest("h3")).not.toBeNull();
    click(buttons[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ação de 'espera você': Button you sm com nome completo", () => {
    const onClick = vi.fn();
    const c = mount(
      <TaskCard
        id="F0.1"
        title="Titularidade"
        variant="you"
        action={{ label: "Ver o que está em jogo", accessibleLabel: "Ver o que está em jogo: Titularidade", onClick }}
      />,
    );
    const b = c.querySelector("button")!;
    expect(b.className).toContain("btn--you");
    expect(accessibleName(b)).toBe("Ver o que está em jogo: Titularidade");
    click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("TaskCard — condições da ADR-0022", () => {
  it("bloqueado: ⊘ antes do id e o motivo em texto; a coluna não muda", () => {
    const c = mount(<TaskCard id="T0.3" title="Golden" variant="queue" condition={{ kind: "blocked", reason: "bloqueada por T0.2" }} />);
    const article = c.querySelector("article")!;
    expect(article.getAttribute("data-variant")).toBe("queue");
    expect(article.getAttribute("data-condition")).toBe("blocked");
    expect(article.querySelector('svg[data-status="blocked"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(c.textContent).toContain("Bloqueado: bloqueada por T0.2");
  });

  it("falhou: glifo ✕ e 'Falhou: <motivo>', borda da família do bloqueio", () => {
    const c = mount(<TaskCard id="T2" title="Build" variant="working" condition={{ kind: "failed", reason: "timeout no CI" }} />);
    expect(c.querySelector('svg[data-status="failed"]')).not.toBeNull();
    expect(c.textContent).toContain("Falhou: timeout no CI");
    expect(rulesMatching(css, '.card[data-condition="failed"]')).toContain("var(--jt-status-blocked-line)");
  });

  it("cancelado: título riscado e o motivo", () => {
    const c = mount(<TaskCard id="T9" title="Portal" variant="done" condition={{ kind: "cancelled", reason: "escopo cortado (ADR-0015)" }} />);
    expect(c.textContent).toContain("Cancelado: escopo cortado (ADR-0015)");
    expect(rulesMatching(css, '.card[data-condition="cancelled"] .title')).toContain("line-through");
  });
});

describe("TaskCard — CSS de acessibilidade e movimento", () => {
  it("variantes da §4.5: working com borda working-line, you com you-line, done transparente", () => {
    expect(rulesMatching(css, '.card[data-variant="working"]')).toContain("var(--jt-status-working-line)");
    expect(rulesMatching(css, '.card[data-variant="you"]')).toContain("var(--jt-status-you-line)");
    expect(rulesMatching(css, '.card[data-variant="done"]')).toContain("transparent");
  });

  it("foco visível no título-botão; forced-colors; o fade de entrada some com movimento reduzido", () => {
    expect(rulesMatching(css, ".titleButton:focus-visible")).toContain("var(--jt-focus)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(rulesMatching(css, ".card ")).toContain("var(--jt-dur-base)");
  });
});
