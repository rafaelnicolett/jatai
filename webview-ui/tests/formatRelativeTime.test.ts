import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "../src/apps/cockpit/shell/NotificationCenter/formatRelativeTime";

const NOW = new Date("2026-08-05T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("menos de 1 min: 'agora'", () => {
    expect(formatRelativeTime("2026-08-05T11:59:30Z", NOW)).toBe("agora");
  });

  it("timestamp no futuro (relógio dessincronizado): 'agora', nunca negativo", () => {
    expect(formatRelativeTime("2026-08-05T12:05:00Z", NOW)).toBe("agora");
  });

  it("minutos", () => {
    expect(formatRelativeTime("2026-08-05T11:45:00Z", NOW)).toBe("há 15 min");
  });

  it("horas", () => {
    expect(formatRelativeTime("2026-08-05T08:00:00Z", NOW)).toBe("há 4 h");
  });

  it("dias", () => {
    expect(formatRelativeTime("2026-08-02T12:00:00Z", NOW)).toBe("há 3 d");
  });

  it("mais de uma semana: cai para data absoluta", () => {
    expect(formatRelativeTime("2026-07-01T12:00:00Z", NOW)).toBe(new Date("2026-07-01T12:00:00Z").toLocaleDateString("pt-BR"));
  });

  it("timestamp inválido: devolve a string original em vez de quebrar", () => {
    expect(formatRelativeTime("não-é-data", NOW)).toBe("não-é-data");
  });
});
