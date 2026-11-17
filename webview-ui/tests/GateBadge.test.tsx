import { describe, it, expect, afterEach } from "vitest";
import { GateBadge } from "../src/design-system/patterns/GateBadge/GateBadge";
import type { GateStatus } from "../src/design-system/patterns/GateBadge/gateStatus";
import { accessibleName, cleanup, mount, rulesMatching, source } from "./support/component";

/** GateBadge do DS v2 (§4.11): estado do gate por borda, marca e texto. */

afterEach(cleanup);

const css = source("design-system/patterns/GateBadge/GateBadge.module.css");

describe("GateBadge", () => {
  it("lê a chave e o estado em texto: 'D1, aprovado'", () => {
    const cases: Array<[GateStatus, string]> = [
      ["approved", "D1, aprovado"],
      ["waiting", "D1, espera você"],
      ["future", "D1, depois"],
      ["blocked", "D1, bloqueado"],
    ];
    for (const [status, name] of cases) {
      const badge = mount(<GateBadge gate="D1" status={status} />).firstElementChild!;
      expect(accessibleName(badge), status).toBe(name);
      expect(badge.getAttribute("data-status")).toBe(status);
    }
  });

  it("nunca só cor: espera você tem ■ e bloqueado tem ⊘ no canto (aria-hidden); depois é tracejado", () => {
    const waiting = mount(<GateBadge gate="D3" status="waiting" />).querySelector("svg")!;
    const blocked = mount(<GateBadge gate="D3" status="blocked" />).querySelector("svg")!;
    expect(waiting.getAttribute("data-status")).toBe("you");
    expect(blocked.getAttribute("data-status")).toBe("blocked");
    expect(waiting.getAttribute("aria-hidden")).toBe("true");
    expect(mount(<GateBadge gate="D1" status="approved" />).querySelector("svg")).toBeNull();
    expect(rulesMatching(css, '[data-status="future"]')).toContain("dashed");
  });

  it("anatomia da §4.11: 26 × 26, raio 8, mono 11/600; forced-colors mantém a borda", () => {
    const body = rulesMatching(css, ".badge ");
    expect(body).toContain("var(--jt-size-gate-badge)");
    expect(body).toContain("var(--jt-radius-sm)");
    expect(body).toContain("var(--jt-type-eyebrow-strong)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
