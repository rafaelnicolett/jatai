import { describe, it, expect, afterEach } from "vitest";
import { Radio } from "lucide-react";
import { EmptyState } from "../src/design-system/patterns/EmptyState/EmptyState";
import { Button } from "../src/design-system/primitives";
import { cleanup, mount, rulesMatching, source } from "./support/component";

/** EmptyState do DS v2 (§4.12): page, inline e quiet; sempre por que está vazio, e a ação quando há. */

afterEach(cleanup);

const css = source("design-system/patterns/EmptyState/EmptyState.module.css");

describe("EmptyState — variantes", () => {
  it("page: glifo da marca, título (h2 por padrão), texto e a ação principal", () => {
    const c = mount(<EmptyState title="Sem iniciativa ativa" body="Abra uma iniciativa conversando com @jatai" action={<Button>Abrir o chat</Button>} />);
    expect(c.querySelector("[data-variant='page']")).not.toBeNull();
    expect(c.querySelector("h2")?.textContent).toBe("Sem iniciativa ativa");
    expect(c.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(c.querySelector("button")?.textContent).toBe("Abrir o chat");
  });

  it("page: o ícone que a tela passa continua valendo (compatível com as telas de antes do DS v2)", () => {
    const c = mount(<EmptyState icon={Radio} title="Nada para acompanhar ainda" />);
    expect(c.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o nível do título depende do contexto", () => {
    expect(mount(<EmptyState title="A" headingLevel={1} />).querySelector("h1")).not.toBeNull();
    expect(mount(<EmptyState variant="inline" title="B" headingLevel={3} />).querySelector("h3")).not.toBeNull();
  });

  it("inline: borda tracejada, título, texto e ação opcional", () => {
    const c = mount(<EmptyState variant="inline" title="Ainda sem tarefas abertas" body="Começa quando a F0.4 estiver verde." />);
    expect(c.querySelector("[data-variant='inline']")).not.toBeNull();
    expect(c.textContent).toContain("Começa quando a F0.4 estiver verde.");
    expect(rulesMatching(css, ".inline")).toContain("1px dashed");
    expect(c.querySelector("button")).toBeNull();
  });

  it("quiet: uma linha com o glifo ✓ (ou ◌), sem título de seção", () => {
    const done = mount(<EmptyState variant="quiet" title="Nada espera você agora" />);
    expect(done.querySelector("h1,h2,h3")).toBeNull();
    expect(done.querySelector("svg")?.getAttribute("data-status")).toBe("done");
    expect(done.textContent).toBe("Nada espera você agora");
    expect(mount(<EmptyState variant="quiet" glyph="future" title="Ainda não começou" />).querySelector("svg")?.getAttribute("data-status")).toBe("future");
  });

  it("esperando: aria-busy", () => {
    expect(mount(<EmptyState title="Conectando…" busy />).querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
