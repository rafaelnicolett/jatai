import { describe, expect, it } from "vitest";

import { formatarData } from "./formatarData";

describe("formatarData", () => {
  it("escreve dia, mês e ano", () => {
    expect(formatarData("2026-10-19")).toBe("19/10/2026");
  });

  it("ignora o horário do texto ISO", () => {
    expect(formatarData("2026-10-05T15:00:00Z")).toBe("05/10/2026");
  });

  it("devolve o texto como veio quando não é uma data", () => {
    expect(formatarData("amanhã")).toBe("amanhã");
  });
});
