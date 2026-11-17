import { describe, it, expect } from "vitest";
import { BOOT_DEADLINE_MS, deriveConnection, staleSeconds } from "../src/apps/cockpit/view/connection";
import { connectionEmpty, viewEmpty } from "../src/apps/cockpit/view/emptyStates";
import { resolveViewTarget } from "../src/apps/cockpit/view/viewTarget";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml } from "./support/cockpitFixtures";

describe("deriveConnection (G9: o 'conectando…' eterno vira espera com prazo)", () => {
  const base = { status: "booting" as const, configured: false, degraded: [], waitedMs: 0 };

  it("espera dentro do prazo e, passado o prazo, explica e oferece tentar de novo", () => {
    expect(deriveConnection(base)).toEqual({ kind: "connecting" });
    expect(deriveConnection({ ...base, waitedMs: BOOT_DEADLINE_MS - 1 })).toEqual({ kind: "connecting" });
    expect(deriveConnection({ ...base, waitedMs: BOOT_DEADLINE_MS })).toEqual({ kind: "timeout", waitedSeconds: 8 });
  });

  it("o aviso do host de que não há pasta aberta vale antes de qualquer espera", () => {
    const degraded = [{ source: "workspace", message: "Nenhuma pasta aberta." }];
    expect(deriveConnection({ ...base, degraded })).toEqual({ kind: "no-folder", message: "Nenhuma pasta aberta." });
  });

  it("com snapshot, vale pronto; sem config, pede para configurar", () => {
    expect(deriveConnection({ ...base, status: "ready", configured: true })).toEqual({ kind: "ready" });
    expect(deriveConnection({ ...base, status: "ready", configured: false })).toEqual({ kind: "unconfigured" });
  });

  it("o dado só é obsoleto depois de 12 segundos sem snapshot novo", () => {
    const at = "2026-11-16T10:00:00Z";
    const t = new Date(at).getTime();
    expect(staleSeconds(at, t + 12_000)).toBeNull();
    expect(staleSeconds(at, t + 20_000)).toBe(20);
    expect(staleSeconds(null, t)).toBeNull();
  });
});

describe("estados vazios: cada um explica por que está vazio e traz uma ação", () => {
  it("cada estado de conexão tem título, explicação e a ação certa", () => {
    expect(connectionEmpty({ kind: "ready" })).toBeNull();
    expect(connectionEmpty({ kind: "connecting" })).toMatchObject({ id: "connecting", busy: true });
    expect(connectionEmpty({ kind: "timeout", waitedSeconds: 8 })).toMatchObject({
      id: "timeout",
      title: "O estado do projeto não chegou",
      action: { label: "Tentar de novo", message: { type: "shell/requestSnapshot" } },
    });
    expect(connectionEmpty({ kind: "no-folder", message: "x" })).toMatchObject({
      id: "no-folder",
      title: "Nenhuma pasta aberta",
      action: { label: "Abrir o assistente", message: { type: "runCommand", command: "jatai.initializeDeliveryKit" } },
    });
    expect(connectionEmpty({ kind: "unconfigured" })?.action?.message).toEqual({ type: "runCommand", command: "jatai.initializeDeliveryKit" });
  });

  it("projeto novo, sem iniciativa: explica e oferece criar a primeira", () => {
    const snapshot = buildSnapshot({ mode: "greenfield" });
    const empty = viewEmpty(snapshot, resolveViewTarget(snapshot, null));
    expect(empty).toMatchObject({ id: "no-initiative", title: "Ainda não há iniciativa", action: { label: "Nova iniciativa", message: { type: "newInitiative" } } });
  });

  it("Descoberta sem nenhum repositório mapeado: a Foundation ainda não começou, e a ação começa a Descoberta", () => {
    const snapshot = buildSnapshot({});
    const empty = viewEmpty(snapshot, { kind: "discovery" });
    expect(empty).toMatchObject({ id: "no-foundation", title: "A Foundation ainda não começou", action: { label: "Começar a Descoberta" } });
    expect(empty?.action?.message).toMatchObject({ type: "injectRaw" });
    expect((empty?.action?.message as { prompt: string }).prompt).toContain("@jatai");
  });

  it("com repositórios ou com iniciativa, não há estado vazio", () => {
    expect(viewEmpty(buildSnapshot({ reposYaml: REPOS_YAML, foundationYaml: foundationYaml() }), { kind: "discovery" })).toBeNull();
    const snapshot = buildSnapshot({ initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({})]) });
    expect(viewEmpty(snapshot, { kind: "initiative", id: "mod-x" })).toBeNull();
  });
});
