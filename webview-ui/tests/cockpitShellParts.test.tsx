import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { ErrorBoundary } from "../src/apps/cockpit/shell/ErrorBoundary/ErrorBoundary";
import { useAnnouncer } from "../src/apps/cockpit/view/useAnnouncer";
import { LiveRegion } from "../src/apps/cockpit/view/LiveRegion";
import { cleanup, click, mount, rerender, source } from "./support/component";

/** Peças do Cockpit que o G9 e o DS v2 pedem: ErrorBoundary com recuperação e a região viva. */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

let shouldThrow = true;
function Boom({ label = "ok" }: { label?: string }) {
  if (shouldThrow) throw new Error("falha de desenho de teste");
  return <p>{label}</p>;
}

describe("ErrorBoundary (G9)", () => {
  it("uma exceção de render vira um alerta com o motivo em texto, e o resto da página continua", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const c = mount(
      <div>
        <header>Barra superior</header>
        <ErrorBoundary label="Quadro do épico">
          <Boom />
        </ErrorBoundary>
      </div>
    );
    const alert = c.querySelector("[role='alert']")!;
    expect(alert.textContent).toContain("Quadro do épico falhou ao desenhar");
    expect(alert.textContent).toContain("falha de desenho de teste");
    expect(alert.textContent).toContain("Nada foi gravado");
    expect(c.querySelector("header")?.textContent).toBe("Barra superior");
  });

  it("'Tentar de novo' desenha a tela outra vez", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const c = mount(
      <ErrorBoundary>
        <Boom label="voltou" />
      </ErrorBoundary>
    );
    expect(c.querySelector("[role='alert']")).not.toBeNull();
    shouldThrow = false;
    click(c.querySelector("button"));
    expect(c.querySelector("[role='alert']")).toBeNull();
    expect(c.textContent).toBe("voltou");
  });

  it("o erro de uma tela não segue para a próxima: navegar (resetKey) limpa", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const c = mount(
      <ErrorBoundary resetKey="a">
        <Boom label="b" />
      </ErrorBoundary>
    );
    expect(c.querySelector("[role='alert']")).not.toBeNull();
    shouldThrow = false;
    rerender(
      c,
      <ErrorBoundary resetKey="b">
        <Boom label="b" />
      </ErrorBoundary>
    );
    expect(c.querySelector("[role='alert']")).toBeNull();
    expect(c.textContent).toBe("b");
  });
});

describe("região viva", () => {
  function Probe({ onReady }: { onReady: (announce: (t: string) => void) => void }) {
    const { message, announce } = useAnnouncer(1_000);
    onReady(announce);
    return <LiveRegion message={message} />;
  }

  it("é um role=status educado, sempre montado, que lê o anúncio e o esquece depois (para repetir mais tarde)", () => {
    vi.useFakeTimers();
    let announce: (t: string) => void = () => undefined;
    const c = mount(<Probe onReady={(a) => (announce = a)} />);
    const region = c.querySelector("[role='status']")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    act(() => announce("Nova decisão espera você: Titularidade do código"));
    expect(region.textContent).toBe("Nova decisão espera você: Titularidade do código");
    act(() => vi.advanceTimersByTime(1_000));
    expect(region.textContent).toBe("");
  });
});

describe("estado de visão (G15)", () => {
  it("o módulo que guarda a visão nunca fala com o host: nada de postMessage, só vscode.setState", () => {
    // Só o código conta: o comentário do módulo explica justamente que ele não chama o host.
    const code = source("apps/cockpit/view/useViewState.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/postMessage|switchInitiative/);
    expect(code).toContain("setPersistedState");
  });
});
