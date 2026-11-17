import { describe, it, expect } from "vitest";
import { Bug } from "lucide-react";
import type { Initiative } from "@data";
import { initiativeKindLabel, initiativeMeta, workspaceComposition } from "../src/apps/cockpit/shell/ContextBar/initiativeSummary";

function initiative(overrides: Partial<Initiative> = {}): Initiative {
  return { id: "x", name: "x", status: "in-progress", ...overrides };
}

describe("initiativeKindLabel (wave-3 — combo box de iniciativas)", () => {
  it("hotfix → 'Hotfix'", () => {
    expect(initiativeKindLabel("hotfix")).toBe("Hotfix");
  });

  it("modernization → 'Modernização'", () => {
    expect(initiativeKindLabel("modernization")).toBe("Modernização");
  });

  it("feature e ausência de type caem no default 'Feature' — mesma regra de InitiativeKind (ausente = feature)", () => {
    expect(initiativeKindLabel("feature")).toBe("Feature");
    expect(initiativeKindLabel(undefined)).toBe("Feature");
  });
});

describe("initiativeMeta", () => {
  it("feature: 'Feature · Brownfield'/'Feature · Greenfield' conforme mode", () => {
    expect(initiativeMeta(initiative({ type: "feature", mode: "brownfield" }))).toBe("Feature · Brownfield");
    expect(initiativeMeta(initiative({ type: "feature", mode: "greenfield" }))).toBe("Feature · Greenfield");
  });

  it("hotfix/modernization sem waves: só o rótulo do tipo, sem contagem de onda", () => {
    expect(initiativeMeta(initiative({ type: "hotfix" }))).toBe("Hotfix");
    expect(initiativeMeta(initiative({ type: "modernization" }))).toBe("Modernização");
  });

  it("hotfix com waves: conta ondas 'done' via wave_status, usando a mesma derivação de chave que modernizationWaveKey", () => {
    const i = initiative({
      type: "hotfix",
      waves: ["wave-1: Diagnóstico", "wave-2: Fix + Testes", "wave-3: Validação"],
      wave_status: {
        "wave-1": { status: "done" },
        "wave-2": { status: "in-progress" },
      },
    });
    expect(initiativeMeta(i)).toBe("Hotfix · onda 1/3");
  });

  it("onda sem índice explícito no texto usa a posição no array (fallback do parseWaveLabel)", () => {
    const i = initiative({
      type: "modernization",
      waves: ["fundação (item1, item2)", "hardening (item3)"],
      wave_status: {
        "wave-0": { status: "done" },
      },
    });
    expect(initiativeMeta(i)).toBe("Modernização · onda 1/2");
  });
});

describe("workspaceComposition — tira de estatísticas do ContextBar", () => {
  it("workspace vazio e sem repos: nenhum chip (nunca mostra '0 X' vazio)", () => {
    expect(workspaceComposition([], 0)).toEqual([]);
  });

  it("repoCount > 0 mas nenhuma iniciativa: só o chip de repositórios", () => {
    const chips = workspaceComposition([], 3);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ value: 3, label: "repositórios" });
  });

  it("singular correto quando o valor é 1", () => {
    expect(workspaceComposition([], 1)[0]).toMatchObject({ value: 1, label: "repositório" });
  });

  it("type ausente conta como feature — mesma regra de InitiativeKind (ausente = feature)", () => {
    const chips = workspaceComposition([initiative({ type: undefined }), initiative({ type: "feature" }), initiative({ type: "hotfix" })], 0);
    const featureChip = chips.find((c) => c.label.startsWith("feature"));
    expect(featureChip).toMatchObject({ value: 2, label: "features" });
  });

  it("hotfix/modernization sem waves declaradas: cai pra contagem de iniciativas, não '0/0 ondas'", () => {
    const chips = workspaceComposition([initiative({ type: "hotfix" })], 0);
    expect(chips).toEqual([{ icon: Bug, value: 1, label: "hotfix", tone: "danger" }]);
  });

  it("hotfix/modernization com waves: soma done/total de TODAS as iniciativas do tipo, não só uma", () => {
    const hotfixA = initiative({
      id: "a",
      type: "hotfix",
      waves: ["wave-1: x", "wave-2: y"],
      wave_status: { "wave-1": { status: "done" } },
    });
    const hotfixB = initiative({
      id: "b",
      type: "hotfix",
      waves: ["wave-1: z"],
      wave_status: { "wave-1": { status: "done" } },
    });
    const chips = workspaceComposition([hotfixA, hotfixB], 0);
    expect(chips).toEqual([{ icon: Bug, value: "2/3", label: "ondas hotfix", tone: "danger" }]);
  });

  it("composição completa na ordem repos → features → hotfix → modernização, cada um só quando existe", () => {
    const chips = workspaceComposition(
      [
        initiative({ type: "feature" }),
        initiative({ type: "hotfix", waves: ["wave-1: x"], wave_status: { "wave-1": { status: "done" } } }),
        initiative({ type: "modernization", waves: ["wave-1: x", "wave-2: y"] }),
      ],
      2
    );
    expect(chips.map((c) => c.label)).toEqual(["repositórios", "feature", "ondas hotfix", "ondas modernização"]);
  });
});

// Achado da sessão (onda 4, ContextBar.tsx:44, hoje initiativeSummary.ts),
// corrigido na F3.9: `waveProgress` lia só `waves`/`wave_status` com a chave
// `wave-N`, e uma iniciativa com `epics`/`epic_status` (ADR-0006, chave
// `epic-N`) aparecia sem progresso. Agora usa o mesmo vocabulário da vista
// por ondas (`resolveGroupVocabulary`). O texto ainda dizia "onda"; na F4.2
// (ADR-0006) ele passou a seguir o vocabulário da hierarquia: "epic N/M".
describe("REGRESSÃO: iniciativa com epics no ContextBar (chave epic-N)", () => {
  const withEpics = initiative({
    type: "modernization",
    epics: ["epic-1: diagnóstico", "epic-2: correção"],
    epic_status: { "epic-1": { status: "done" } },
  });

  it("REGRESSÃO: o combo mostra o progresso dos epics pela chave epic-N", () => {
    expect(initiativeMeta(withEpics)).toBe("Modernização · epic 1/2");
  });

  it("REGRESSÃO (ADR-0006): iniciativa com epics diz 'epic N/M', e só a que usa ondas diz 'onda N/M'", () => {
    expect(initiativeMeta(withEpics)).toContain("epic");
    expect(initiativeMeta(withEpics)).not.toContain("onda");
    expect(initiativeMeta(initiative({ type: "hotfix", waves: ["wave-1: a", "wave-2: b"], wave_status: { "wave-1": { status: "done" } } }))).toBe("Hotfix · onda 1/2");
  });

  it("REGRESSÃO: a composição do workspace soma os epics com as ondas das outras iniciativas do tipo", () => {
    const withWaves = initiative({ id: "w", type: "modernization", waves: ["wave-1: x", "wave-2: y", "wave-3: z"], wave_status: { "wave-2": { status: "done" } } });
    expect(workspaceComposition([withEpics], 0).map((c) => [c.value, c.label])).toEqual([["1/2", "ondas modernização"]]);
    expect(workspaceComposition([withEpics, withWaves], 0).map((c) => [c.value, c.label])).toEqual([["2/5", "ondas modernização"]]);
  });

  it("iniciativa só com waves continua lendo wave-N (sem mudança)", () => {
    expect(initiativeMeta(initiative({ type: "hotfix", waves: ["wave-1: a", "wave-2: b"], wave_status: { "wave-1": { status: "done" } } }))).toBe("Hotfix · onda 1/2");
  });
});
