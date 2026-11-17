import { describe, it, expect } from "vitest";
import { resolveActiveLens, isBrownfieldWorkspace } from "../src/store/activeLens";
import type { HelyxConfig, ReposInventory } from "@shared/cockpit-protocol";

const singleProjectConfig = (mode: "greenfield" | "brownfield"): HelyxConfig => ({
  version: "1.0.0",
  project: { name: "Proj", slug: "proj", mode },
  host_adapter: "claude",
});

const reposInventory = (count: number): ReposInventory => ({
  version: 1,
  repos: Array.from({ length: count }, (_, i) => ({
    id: `repo-${i}`,
    source: "local-path",
    path: `repos/repo-${i}`,
    scan_profile: "deep",
  })),
});

describe("resolveActiveLens", () => {
  it("não-brownfield sempre cai em delivery — nunca teve Discovery, a pill 'Descoberta' nem existe pra ele", () => {
    expect(resolveActiveLens(false, undefined, "init-a")).toEqual({ kind: "delivery", initiativeId: "init-a" });
    expect(resolveActiveLens(false, true, "init-a")).toEqual({ kind: "delivery", initiativeId: "init-a" });
  });

  it("brownfield sem escolha explícita (undefined) cai em discovery — preserva o comportamento atual", () => {
    expect(resolveActiveLens(true, undefined, "init-a")).toEqual({ kind: "discovery" });
  });

  it("brownfield com discoveryLensSelected=true cai em discovery", () => {
    expect(resolveActiveLens(true, true, "init-a")).toEqual({ kind: "discovery" });
  });

  it("brownfield com discoveryLensSelected=false cai em delivery, carregando o id da iniciativa ativa", () => {
    expect(resolveActiveLens(true, false, "init-a")).toEqual({ kind: "delivery", initiativeId: "init-a" });
  });
});

describe("isBrownfieldWorkspace", () => {
  it("config single-project com mode brownfield → true", () => {
    expect(isBrownfieldWorkspace(singleProjectConfig("brownfield"), null)).toBe(true);
  });

  it("config single-project com mode greenfield e sem repos.yaml → false", () => {
    expect(isBrownfieldWorkspace(singleProjectConfig("greenfield"), null)).toBe(false);
  });

  it(
    "regressão: workspace brownfield multi-repo pós-Foundation (config no shape do @assessor, sem project/mode) " +
      "com repos.yaml populado → true. Sem isso, um workspace com Foundation 100% concluída caía sempre na " +
      "lente Delivery (iniciativa ativa, geralmente vazia), escondendo o Discovery inteiro por padrão.",
    () => {
      expect(isBrownfieldWorkspace(null, reposInventory(2))).toBe(true);
    }
  );

  it("sem config e sem repos.yaml (workspace nunca configurado) → false", () => {
    expect(isBrownfieldWorkspace(null, null)).toBe(false);
    expect(isBrownfieldWorkspace(null, reposInventory(0))).toBe(false);
  });
});
