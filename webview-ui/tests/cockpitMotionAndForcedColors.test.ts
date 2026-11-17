import { describe, it, expect } from "vitest";
import { source } from "./support/component";

/**
 * Movimento reduzido e forced-colors em TODA folha de estilo das telas do Cockpit
 * (F4.2, acessibilidade sem exceção). O jsdom não aplica `prefers-reduced-motion`
 * nem `forced-colors`, então a verificação é sobre o código-fonte do CSS, como nos
 * outros testes de CSS do DS. O que cada componente faz com teclado, marcos e
 * região viva tem o teste de componente dele.
 */
const SHEETS: Record<string, string> = {
  PhaseTrack: "design-system/patterns/PhaseTrack/PhaseTrack.module.css",
  EpicStop: "design-system/patterns/EpicStop/EpicStop.module.css",
  NowCard: "design-system/patterns/NowCard/NowCard.module.css",
  EpicPotList: "design-system/patterns/EpicPot/EpicPotList.module.css",
  EpicBoard: "design-system/patterns/EpicBoard/EpicBoard.module.css",
  GateTimeline: "design-system/patterns/GateTimeline/GateTimeline.module.css",
  DecisionDialog: "design-system/patterns/DecisionDialog/DecisionDialog.module.css",
  EmptyState: "design-system/patterns/EmptyState/EmptyState.module.css",
  ContextBar: "apps/cockpit/shell/ContextBar/ContextBar.module.css",
  InitiativeSwitcher: "apps/cockpit/shell/ContextBar/InitiativeSwitcher.module.css",
  NotificationCenter: "apps/cockpit/shell/NotificationCenter/NotificationCenter.module.css",
  ErrorBoundary: "apps/cockpit/shell/ErrorBoundary/ErrorBoundary.module.css",
  CockpitScreen: "apps/cockpit/screens/CockpitScreen.module.css",
  TaskDetails: "apps/cockpit/screens/TaskDetails.module.css",
  AppShell: "apps/cockpit/shell/AppShell/AppShell.module.css",
};

/** Sem bloco de forced-colors próprio, e por quê: só layout e tipografia, com cor vinda de tokens que o `tokens.css` remapeia para cores do sistema. */
const NO_FORCED_COLORS_BLOCK: Record<string, string> = {
  EmptyState: "só tipografia e o glifo da marca, com cor por token",
  NotificationCenter: "superfície e bordas por token (Canvas e CanvasText em forced-colors)",
  CockpitScreen: "só layout da página",
  TaskDetails: "só layout; o diálogo é o DecisionDialog, que tem o bloco",
  AppShell: "só layout e a rolagem",
};

const css = (name: string): string => source(SHEETS[name]!).replace(/\/\*[\s\S]*?\*\//g, "");

/** Cada declaração `animation:` e `transition:` do arquivo. */
function motionDeclarations(sheet: string): string[] {
  return [...sheet.matchAll(/\b(?:animation|transition)\s*:([^;{}]+)(?:;|\})/g)].map((m) => m[1]!.trim());
}

describe("movimento reduzido nas telas do Cockpit", () => {
  it("o tokens.css zera as iterações e os deslocamentos quando a pessoa pede movimento reduzido", () => {
    const tokens = source("design-system/tokens/tokens.css");
    const block = tokens.slice(tokens.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const token of ["--jt-iterations-burst: 0", "--jt-iterations-ambient: 0", "--jt-iterations-light-up: 0", "--jt-dur-fill: 0ms", "--jt-motion-distance-md: 0px"]) {
      expect(block).toContain(token);
    }
  });

  for (const name of Object.keys(SHEETS)) {
    it(`${name}: nada de animação infinita, e a duração e as iterações vêm só de tokens`, () => {
      const sheet = css(name);
      expect(sheet).not.toMatch(/\binfinite\b/);
      for (const declaration of motionDeclarations(sheet)) {
        // Um literal de tempo (200ms, 1s) escaparia do zeramento do `prefers-reduced-motion`.
        expect(declaration, `${name}: ${declaration}`).not.toMatch(/(?<![-\w])\d*\.?\d+m?s\b/);
        if (declaration.includes("@keyframes")) continue;
        expect(declaration, `${name}: ${declaration}`).toMatch(/var\(--jt-/);
      }
    });
  }

  it("as animações de rajada (órbita do Agora e abelha da trilha) rodam só `--jt-iterations-burst` vezes", () => {
    expect(css("NowCard")).toMatch(/animation:[^;]*var\(--jt-iterations-burst\)/);
    expect(css("PhaseTrack")).toMatch(/animation:[^;]*var\(--jt-iterations-burst\)/);
  });
});

describe("forced-colors nas telas do Cockpit", () => {
  for (const name of Object.keys(SHEETS)) {
    if (name in NO_FORCED_COLORS_BLOCK) {
      it(`${name}: sem bloco próprio (${NO_FORCED_COLORS_BLOCK[name]}), e sem cor escrita à mão`, () => {
        expect(css(name)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      });
      continue;
    }
    it(`${name}: tem o bloco @media (forced-colors: active) e só cores de sistema nele`, () => {
      const sheet = css(name);
      const start = sheet.indexOf("@media (forced-colors: active)");
      expect(start).toBeGreaterThanOrEqual(0);
      const block = sheet.slice(start);
      expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(block).toMatch(/\b(CanvasText|Canvas|Highlight|ButtonText|ButtonFace|GrayText|LinkText)\b/);
    });
  }

  it("o texto sobre o preenchimento da marca sai do ajuste (o rótulo some atrás do Canvas, medido no Chrome)", () => {
    const button = source("design-system/primitives/Button/Button.module.css");
    expect(button.slice(button.indexOf("@media (forced-colors: active)"))).toContain("forced-color-adjust: none");
    expect(css("EpicStop").slice(css("EpicStop").indexOf("@media (forced-colors: active)"))).toContain("forced-color-adjust: none");
  });
});
