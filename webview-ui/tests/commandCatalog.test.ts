import { describe, it, expect, vi } from "vitest";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { buildDeckCommands } from "../src/features/command-deck/commandCatalog";

/** Só os campos que `buildDeckCommands` de fato lê — o resto do `CockpitSnapshot` real não importa aqui. */
function snapshot(overrides: {
  mode?: "brownfield" | "greenfield";
  initiatives?: { id: string; name: string }[];
  hasRepos?: boolean;
} = {}): CockpitSnapshot {
  return {
    config: overrides.mode ? { version: "1", project: { name: "x", slug: "x", mode: overrides.mode }, host_adapter: "claude" } : null,
    initiatives: overrides.initiatives ? { active: overrides.initiatives[0]?.id ?? "", initiatives: overrides.initiatives } : null,
    reposInventory: overrides.hasRepos ? { repos: [{}] } : null,
  } as unknown as CockpitSnapshot;
}

describe("buildDeckCommands", () => {
  it("sem snapshot: só navegação + ações globais + catálogo estático, sem lentes", () => {
    const { commands } = buildDeckCommands({
      snapshot: null, onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn(),
    });
    expect(commands.some((c) => c.id === "nav-live-progress")).toBe(true);
    expect(commands.some((c) => c.id === "open-chat")).toBe(true);
    expect(commands.some((c) => c.id === "shortcut-sync-repos")).toBe(true);
    expect(commands.some((c) => c.id === "lens-discovery")).toBe(false);
    expect(commands.some((c) => c.id.startsWith("lens-"))).toBe(false);
  });

  it("2 comandos de navegação — Progresso e Operações (wave-3: shell simplificada, ver PersistedUIState.ts)", () => {
    const { commands } = buildDeckCommands({ snapshot: null, onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn() });
    expect(commands.filter((c) => c.group === "Navegar")).toHaveLength(2);
  });

  it("brownfield: inclui 'Abrir Descoberta'", () => {
    const { commands } = buildDeckCommands({
      snapshot: snapshot({ mode: "brownfield" }), onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn(),
    });
    expect(commands.some((c) => c.id === "lens-discovery")).toBe(true);
  });

  it("greenfield: NÃO inclui 'Abrir Descoberta'", () => {
    const { commands } = buildDeckCommands({
      snapshot: snapshot({ mode: "greenfield" }), onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn(),
    });
    expect(commands.some((c) => c.id === "lens-discovery")).toBe(false);
  });

  it(
    "regressão: brownfield multi-repo pós-Foundation (sem config.project.mode, só repos.yaml) também inclui 'Abrir Descoberta'",
    () => {
      const { commands } = buildDeckCommands({
        snapshot: snapshot({ hasRepos: true }), onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn(),
      });
      expect(commands.some((c) => c.id === "lens-discovery")).toBe(true);
    }
  );

  it("uma iniciativa vira um comando 'Trocar para <nome>'", () => {
    const { commands } = buildDeckCommands({
      snapshot: snapshot({ initiatives: [{ id: "mod-x", name: "Modernização X" }] }),
      onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn(),
    });
    expect(commands.find((c) => c.id === "lens-mod-x")).toMatchObject({ label: "Trocar para Modernização X", group: "Iniciativas" });
  });

  it("hasRepos=false: pergunta 'Adicionar repositório' fica de fora (requiresRepos)", () => {
    const { commands } = buildDeckCommands({ snapshot: snapshot({ hasRepos: false }), onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn() });
    expect(commands.some((c) => c.id === "ask-ask-add-repo")).toBe(false);
  });

  it("hasRepos=true: pergunta 'Adicionar repositório' aparece", () => {
    const { commands } = buildDeckCommands({ snapshot: snapshot({ hasRepos: true }), onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn() });
    expect(commands.some((c) => c.id === "ask-ask-add-repo")).toBe(true);
  });

  it("run('nav-live-progress') chama onTabChange('live-progress')", () => {
    const onTabChange = vi.fn();
    const { run } = buildDeckCommands({ snapshot: null, onTabChange, onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn() });
    run("nav-live-progress");
    expect(onTabChange).toHaveBeenCalledWith("live-progress");
  });

  it("run('lens-mod-x') chama onOpenInitiative('mod-x')", () => {
    const onOpenInitiative = vi.fn();
    const { run } = buildDeckCommands({
      snapshot: snapshot({ initiatives: [{ id: "mod-x", name: "Modernização X" }] }),
      onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative,
    });
    run("lens-mod-x");
    expect(onOpenInitiative).toHaveBeenCalledWith("mod-x");
  });

  it("run com id desconhecido não lança", () => {
    const { run } = buildDeckCommands({ snapshot: null, onTabChange: vi.fn(), onOpenDiscovery: vi.fn(), onOpenInitiative: vi.fn() });
    expect(() => run("nao-existe")).not.toThrow();
  });
});
