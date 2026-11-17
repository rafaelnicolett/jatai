import { describe, it, expect, vi } from "vitest";
import type { ModernizationWaveEntry, WaveItemStatusEntry } from "@data";
import type { Initiative } from "@data";
import {
  modernizationMapNodes,
  modernizationBoardCards,
  modernizationWaveKey,
  waveViewKindLabel,
  usesWaveView,
  resolveGroupVocabulary,
  MODERNIZATION_OVERVIEW_KEY,
} from "../src/features/delivery/computeModernizationBoard";

function wave(overrides: Partial<ModernizationWaveEntry> = {}): ModernizationWaveEntry {
  return { index: 1, label: "fundação (item1, item2, item3) — risco: nada", raw: "wave-1: fundação (item1, item2, item3) — risco: nada", ...overrides };
}

function waveItem(overrides: Partial<WaveItemStatusEntry> = {}): WaveItemStatusEntry {
  return { status: "done", ...overrides };
}

describe("modernizationMapNodes", () => {
  it("nó __overview__ vem primeiro, status done fixo, seguido de 1 nó por onda", () => {
    const waves = [wave({ index: 1, status: { status: "done" } }), wave({ index: 2, status: { status: "in-progress" } }), wave({ index: 3 })];
    const nodes = modernizationMapNodes(waves);

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ key: MODERNIZATION_OVERVIEW_KEY, label: "Visão geral", status: "done", kind: "phase" });
    expect(nodes[1]).toMatchObject({ key: "wave-1", status: "done" });
    expect(nodes[2]).toMatchObject({ key: "wave-2", status: "running" });
    expect(nodes[3]).toMatchObject({ key: "wave-3", status: "pending" });
  });

  it("array de ondas vazio devolve só o nó overview", () => {
    expect(modernizationMapNodes([])).toEqual([{ key: MODERNIZATION_OVERVIEW_KEY, label: "Visão geral", status: "done", kind: "phase" }]);
  });
});

describe("modernizationBoardCards — onda item-a-item", () => {
  it("1 card por item, lane === status mapeado, sem approve quando status não é done", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: {
        status: "in-progress",
        items: {
          "item-1.1": waveItem({ status: "done", requires_approval: true }),
          "item-1.2": waveItem({ status: "in-progress" }),
        },
      },
    });
    const onApprove = vi.fn();
    const onToggle = vi.fn();
    const cards = modernizationBoardCards("wave-1", w, [], onApprove, {}, onToggle);

    expect(cards).toHaveLength(2);
    const done = cards.find((c) => c.key === "item-1.1")!;
    const running = cards.find((c) => c.key === "item-1.2")!;
    expect(done.lane).toBe("done");
    expect(done.approve).toBeDefined();
    expect(running.lane).toBe("running");
    expect(running.approve).toBeUndefined();
  });

  it("item done COM requires_approval:true e sem human_approved_at ganha approve; onApprove chama com acknowledged=true quando não há fricção", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: { status: "done", items: { "item-1.1": waveItem({ status: "done", requires_approval: true }) } },
    });
    const onApprove = vi.fn();
    const cards = modernizationBoardCards("wave-1", w, ["merge_block", "known_bugs_pinned"], onApprove, {}, vi.fn());

    expect(cards[0]!.approve).toBeDefined();
    expect(cards[0]!.approve!.friction).toBeUndefined();
    cards[0]!.approve!.onApprove();
    expect(onApprove).toHaveBeenCalledWith("item-1.1", true);
  });

  it("item done SEM requires_approval (default ausente = false) nunca ganha approve — fix desta sessão: antes todo item done mostrava o botão", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: { status: "done", items: { "item-1.1": waveItem({ status: "done" }) } },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards[0]!.approve).toBeUndefined();
  });

  it("item já com human_approved_at não ganha approve mesmo com requires_approval:true (evita reaprovar)", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: {
        status: "done",
        items: { "item-1.1": waveItem({ status: "done", requires_approval: true, human_approved_at: "2026-08-01T00:00:00Z" }) },
      },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards[0]!.approve).toBeUndefined();
  });

  it("item com merge_block e status não-done vira lane blocked (enriquecimento além do mapeamento padrão)", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: {
        status: "in-progress",
        items: { "item-1.1": waveItem({ status: "in-progress", merge_block: "aguarda revisão de contrato" }) },
      },
    });
    const cards = modernizationBoardCards("wave-1", w, ["merge_block"], vi.fn(), {}, vi.fn());
    expect(cards[0]!.lane).toBe("blocked");
    // não-done: mesmo tendo merge_block preenchido, não ganha approve (regra idêntica a WaveItemApproveAction)
    expect(cards[0]!.approve).toBeUndefined();
  });

  it("item done com requires_approval:true e known_bugs_pinned preenchido exige fricção (checkbox) antes de aprovar", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: {
        status: "done",
        items: { "item-1.1": waveItem({ status: "done", requires_approval: true, known_bugs_pinned: ["bug-42"] }) },
      },
    });
    const onApprove = vi.fn();
    const onToggle = vi.fn();
    const cards = modernizationBoardCards("wave-1", w, ["merge_block", "known_bugs_pinned"], onApprove, {}, onToggle);

    const card = cards[0]!;
    expect(card.lane).toBe("done");
    expect(card.approve!.friction).toBeDefined();
    expect(card.approve!.friction!.acknowledged).toBe(false);

    // Sem reconhecer, o clique ainda registra acknowledged=false (quem bloqueia o botão é o PhaseBoard, via friction.acknowledged)
    card.approve!.onApprove();
    expect(onApprove).toHaveBeenCalledWith("item-1.1", false);

    card.approve!.friction!.onAcknowledgedChange(true);
    expect(onToggle).toHaveBeenCalledWith("item-1.1", true);

    // Com acknowledgedByItem já true, onApprove passa acknowledged=true
    const acknowledgedCards = modernizationBoardCards("wave-1", w, ["merge_block", "known_bugs_pinned"], onApprove, { "item-1.1": true }, onToggle);
    acknowledgedCards[0]!.approve!.onApprove();
    expect(onApprove).toHaveBeenCalledWith("item-1.1", true);
  });

  it("catálogo da wave (parseWaveContent) faz merge com wave.status.items por id — item ainda sem entrada aparece pending, preservando a ordem do catálogo (fix desta sessão: antes esse item simplesmente sumia)", () => {
    const w = wave({
      label: "fundação (item-1.1, item-1.2, item-1.3) — risco: nada",
      status: {
        status: "in-progress",
        items: {
          // Fora de ordem de propósito — a ordem do card final deve seguir o catálogo, não esta inserção.
          "item-1.2": waveItem({ status: "in-progress" }),
          "item-1.1": waveItem({ status: "done" }),
        },
      },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());

    expect(cards.map((c) => c.key)).toEqual(["item-1.1", "item-1.2", "wave-1-plan-2"]);
    expect(cards[0]).toMatchObject({ lane: "done" });
    expect(cards[1]).toMatchObject({ lane: "running" });
    expect(cards[2]).toMatchObject({ lane: "pending", status: "pending", title: "item-1.3" });
  });

  it("item já reportado com chave fora do texto do catálogo continua visível (nunca escondido)", () => {
    const w = wave({
      label: "fundação (item-1.1) — risco: nada",
      status: {
        status: "in-progress",
        items: {
          "item-1.1": waveItem({ status: "done" }),
          "item-extra-fora-do-catalogo": waveItem({ status: "in-progress" }),
        },
      },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards.map((c) => c.key)).toEqual(["item-1.1", "item-extra-fora-do-catalogo"]);
  });
});

describe("modernizationBoardCards — card.details (commit/artifacts/known_bugs_pinned repassados de WaveItemStatusEntry, gap fechado desta sessão)", () => {
  it("item com commit/artifacts/known_bugs_pinned preenchidos ganha card.details com os 3 campos repassados (gap fechado desta sessão: antes nenhum desses 3 chegava até o BoardCard)", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: {
        status: "done",
        items: {
          "item-1.1": waveItem({
            status: "done",
            commit: "7d409ea",
            artifacts: ["docs/adr/0003-x.md", "repos/helyx-vscode/tests/config-loader.test.ts"],
            known_bugs_pinned: ["requireFlag trata --flag \"\" igual a flag ausente"],
          }),
        },
      },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards[0]!.details).toEqual({
      commit: "7d409ea",
      artifacts: ["docs/adr/0003-x.md", "repos/helyx-vscode/tests/config-loader.test.ts"],
      knownBugs: ["requireFlag trata --flag \"\" igual a flag ausente"],
    });
  });

  it("item sem commit/artifacts/known_bugs_pinned não ganha card.details (undefined, nunca objeto vazio)", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: { status: "done", items: { "item-1.1": waveItem({ status: "done" }) } },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards[0]!.details).toBeUndefined();
  });

  it("item com artifacts vazio ([]) não ganha details.artifacts — mesma regra de 'não force campos vazios' já aplicada a known_bugs_pinned/merge_block em itemLane", () => {
    const w = wave({
      label: "onda sem catálogo parseável",
      status: { status: "done", items: { "item-1.1": waveItem({ status: "done", artifacts: [], commit: "abc1234" }) } },
    });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards[0]!.details).toEqual({ commit: "abc1234" });
  });
});

describe("modernizationBoardCards — onda plana (só status no nível da onda)", () => {
  it("1 card único representando a onda, sem approve (não há alvo item-a-item pra aprovar)", () => {
    const w = wave({ status: { status: "in-progress" } });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());

    expect(cards).toHaveLength(1);
    expect(cards[0]!.lane).toBe("running");
    expect(cards[0]!.approve).toBeUndefined();
  });
});

describe("modernizationBoardCards — onda sem wave.status (Execution ainda não chegou)", () => {
  it("cards vêm de parseWaveContent(wave.label).items, todos lane pending, sem approve", () => {
    const w = wave({ label: "fundação (item1, item2, item3) — risco: nada", status: undefined });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());

    expect(cards.map((c) => c.title)).toEqual(["item1", "item2", "item3"]);
    expect(cards.every((c) => c.lane === "pending")).toBe(true);
    expect(cards.every((c) => c.approve === undefined)).toBe(true);
  });

  it("label sem parênteses (sem itens parseáveis) devolve array vazio", () => {
    const w = wave({ label: "só um título solto", status: undefined });
    const cards = modernizationBoardCards("wave-1", w, [], vi.fn(), {}, vi.fn());
    expect(cards).toEqual([]);
  });
});

describe("modernizationWaveKey", () => {
  it("usa wave.index quando presente, senão a posição no array", () => {
    expect(modernizationWaveKey(wave({ index: 5 }), 2)).toBe("wave-5");
    expect(modernizationWaveKey(wave({ index: null }), 2)).toBe("wave-2");
  });
});

describe("waveViewKindLabel (ADR-0001 — vocabulário por tipo de iniciativa)", () => {
  it("modernization → 'Modernização'", () => {
    expect(waveViewKindLabel("modernization")).toBe("Modernização");
  });

  it("hotfix → 'Hotfix' — regressão: antes desta mudança caía no fallback 'Planning'", () => {
    expect(waveViewKindLabel("hotfix")).toBe("Hotfix");
  });

  it("feature com hasPlanningGate (migração de schema) e ausência de type caem no fallback 'Planning'", () => {
    expect(waveViewKindLabel("feature")).toBe("Planning");
    expect(waveViewKindLabel(undefined)).toBe("Planning");
  });
});

function initiative(overrides: Partial<Initiative> = {}): Initiative {
  return { id: "x", name: "x", status: "in-progress", ...overrides };
}

describe("usesWaveView (ADR-0001 — roteamento vista-por-ondas vs. escadaria de 16 fases)", () => {
  it("null/undefined → false", () => {
    expect(usesWaveView(null)).toBe(false);
    expect(usesWaveView(undefined)).toBe(false);
  });

  it("type: modernization → true", () => {
    expect(usesWaveView(initiative({ type: "modernization" }))).toBe(true);
  });

  it("type: hotfix → true — regressão desta sessão: antes só 'modernization'/hasPlanningGate disparavam a vista por ondas", () => {
    expect(usesWaveView(initiative({ type: "hotfix" }))).toBe(true);
  });

  it("type: feature sem gate de Planning → false (escadaria genérica de 16 fases)", () => {
    expect(usesWaveView(initiative({ type: "feature" }))).toBe(false);
  });

  it("type: feature COM gate de Planning (migração de schema) → true", () => {
    expect(usesWaveView(initiative({ type: "feature", gate_d2: { status: "approved" } }))).toBe(true);
  });
});

describe("resolveGroupVocabulary (ADR-0006 — dado-driven, nunca lê a setting diretamente)", () => {
  it("iniciativa só com 'waves' → vocabulário Onda (legado, prefix wave)", () => {
    const v = resolveGroupVocabulary(initiative({ waves: ["wave-1: fundação"] }));
    expect(v).toMatchObject({ prefix: "wave", groupLabel: "Onda", groupLabelPlural: "ondas", labels: ["wave-1: fundação"] });
  });

  it("iniciativa com 'epics' → vocabulário Epic (novo, prefix epic)", () => {
    const v = resolveGroupVocabulary(initiative({ epics: ["epic-1: fundação"] }));
    expect(v).toMatchObject({ prefix: "epic", groupLabel: "Epic", groupLabelPlural: "epics", labels: ["epic-1: fundação"] });
  });

  it("epics vazio (mas presente) cai pro legado — mesma regra de 'não fabricar' já usada no parser", () => {
    const v = resolveGroupVocabulary(initiative({ epics: [], waves: ["wave-1: fundação"] }));
    expect(v.prefix).toBe("wave");
  });

  it("sem waves nem epics → vocabulário Onda com labels vazio (nunca lança)", () => {
    const v = resolveGroupVocabulary(initiative({}));
    expect(v).toMatchObject({ prefix: "wave", labels: [] });
  });

  it("statusMap resolve pro epic_status quando vocabulário é Epic", () => {
    const v = resolveGroupVocabulary(initiative({ epics: ["epic-1: x"], epic_status: { "epic-1": { status: "done" } } }));
    expect(v.statusMap).toEqual({ "epic-1": { status: "done" } });
  });
});

describe("modernizationMapNodes / modernizationWaveKey — vocabulário Epic (ADR-0006)", () => {
  it("modernizationMapNodes aceita groupLabel/prefix e rotula os nós como 'Epic N'", () => {
    const waves = [wave({ index: 1, status: { status: "done" } })];
    const nodes = modernizationMapNodes(waves, "Epic", "epic");
    expect(nodes[1]).toMatchObject({ key: "epic-1", label: "Epic 1", status: "done" });
  });

  it("modernizationWaveKey com prefix 'epic' gera 'epic-N' em vez de 'wave-N'", () => {
    expect(modernizationWaveKey(wave({ index: 3 }), 0, "epic")).toBe("epic-3");
  });

  it("modernizationWaveKey sem prefix continua 'wave-N' (retrocompat — default inalterado)", () => {
    expect(modernizationWaveKey(wave({ index: 3 }), 0)).toBe("wave-3");
  });
});
