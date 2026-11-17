import { describe, it, expect } from "vitest";
import { upsertPhaseStatusInYaml, upsertChecklistItemInYaml, upsertGateD1InYaml } from "../../src/views/actions/yamlUpsert";
import { upsertInitiative, upsertWaveItem, bumpPhase } from "../../src/cli/writers/initiatives-writer";
import { parseDeliveryState } from "../../src/data/delivery-state-contract.pure";
import { parseInitiativesYaml } from "../../src/data/initiatives-contract.pure";
import { parseFoundationState } from "../../src/data/foundation-state-contract.pure";

/**
 * A promessa central da Frente B: "o que o CLI escreve, o Cockpit lê certo".
 * Estes testes não chamam o CLI (isso é `helyx-state-subprocess.test.ts`) —
 * eles fecham o loop escrita→leitura usando os MESMOS parsers que
 * `CockpitNextController` usa em produção (`src/data/*-contract.pure.ts`),
 * pra pegar qualquer divergência de schema entre o que o writer produz e o
 * que o parser espera (foi exatamente esse tipo de divergência —
 * `checklist` vs `human_checklist` — que causou o bug real da Frente A).
 */

describe("golden round-trip — delivery-state.yaml", () => {
  it("upsertPhaseStatusInYaml + upsertChecklistItemInYaml produzem YAML que parseDeliveryState lê corretamente", () => {
    let content = upsertPhaseStatusInYaml("", "business", "done", "@business");
    content = upsertChecklistItemInYaml(content, "business", "problem-section", true, "human_checklist");
    content = upsertChecklistItemInYaml(content, "business", "kpi-defined", false, "human_checklist");

    const parsed = parseDeliveryState(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.phases.business).toMatchObject({
      status: "done",
      agent: "@business",
      human_checklist: { "problem-section": true, "kpi-defined": false },
    });
  });

  it("duas fases upsertadas em sequência sobrevivem as duas no parse final", () => {
    let content = upsertPhaseStatusInYaml("", "business", "done");
    content = upsertPhaseStatusInYaml(content, "product", "in-progress", "@product");

    const parsed = parseDeliveryState(content);
    expect(parsed!.phases.business?.status).toBe("done");
    expect(parsed!.phases.product).toMatchObject({ status: "in-progress", agent: "@product" });
  });
});

describe("golden round-trip — initiatives.yaml", () => {
  it("upsertInitiative produz YAML que parseInitiativesYaml lê sem erros", () => {
    const content = upsertInitiative("", {
      id: "feat-x",
      name: "Feature X",
      status: "in-progress",
      stream: "upstream",
      currentPhase: "business",
      setActive: true,
    });

    const { state, errors } = parseInitiativesYaml(content);
    expect(errors).toEqual([]);
    expect(state).not.toBeNull();
    expect(state!.active).toBe("feat-x");
    expect(state!.initiatives).toHaveLength(1);
    expect(state!.initiatives[0]).toMatchObject({
      id: "feat-x",
      name: "Feature X",
      status: "in-progress",
      stream: "upstream",
      current_phase: "business",
    });
  });

  it("upsertWaveItem produz wave_status que parseInitiativesYaml reconhece com o mesmo shape que a UI já lê (item-a-item)", () => {
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X", type: "modernization" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", {
      status: "done",
      repo: "billing-api",
      commit: "4a2cf26",
      completedAt: "2026-07-28",
      artifacts: ["docs/adr/0003.md"],
    }).content;
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.2", { status: "in-progress" }).content;

    const { state, errors } = parseInitiativesYaml(content);
    expect(errors).toEqual([]);
    const initiative = state!.initiatives[0]!;
    const wave1 = initiative.wave_status?.["wave-1"];
    expect(wave1).toBeDefined();
    // status da wave é derivado dos items — nem todos done ainda, então "in-progress"
    expect(wave1!.status).toBe("in-progress");
    expect(wave1!.items?.["item-1.1"]).toMatchObject({
      status: "done",
      repo: "billing-api",
      commit: "4a2cf26",
      completed_at: "2026-07-28",
      artifacts: ["docs/adr/0003.md"],
    });
    expect(wave1!.items?.["item-1.2"]).toMatchObject({ status: "in-progress" });
  });

  it("wave_status fica 'done' só quando TODOS os items da wave estão done — mesma regra que a UI já espera", () => {
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done" }).content;
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.2", { status: "done" }).content;

    const { state } = parseInitiativesYaml(content);
    expect(state!.initiatives[0]!.wave_status?.["wave-1"]?.status).toBe("done");
  });

  it("bumpPhase seguido de parseInitiativesYaml reflete o current_phase novo, sem duplicar a iniciativa", () => {
    let content = upsertInitiative("", { id: "feat-x", name: "Feature X", currentPhase: "business" });
    content = bumpPhase(content, "feat-x", "product").content;

    const { state, errors } = parseInitiativesYaml(content);
    expect(errors).toEqual([]);
    expect(state!.initiatives).toHaveLength(1);
    expect(state!.initiatives[0]!.current_phase).toBe("product");
  });

  it("Onda 1 — aprovar (humanApprovedAt) sem status: parseInitiativesYaml lê o item com status preservado + human_approved_at novo", () => {
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done", mergeBlock: "aguarda rollback" }).content;
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { humanApprovedAt: "2026-08-05T10:00:00Z" }).content;

    const { state, errors } = parseInitiativesYaml(content);
    expect(errors).toEqual([]);
    const item = state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(item).toMatchObject({
      status: "done",
      merge_block: "aguarda rollback",
      human_approved_at: "2026-08-05T10:00:00Z",
    });
  });

  it("--requires-approval (writer) grava um bool YAML de verdade (sem aspas), lido de volta como boolean por parseInitiativesYaml", () => {
    let content = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    content = upsertWaveItem(content, "mod-x", "wave-1", "item-1.1", { status: "done", requiresApproval: true }).content;

    expect(content).toMatch(/requires_approval:\s*true(?!")/); // sem aspas — precisa ser lido como boolean, não string "true"

    const { state, errors } = parseInitiativesYaml(content);
    expect(errors).toEqual([]);
    const item = state!.initiatives[0]!.wave_status?.["wave-1"]?.items?.["item-1.1"];
    expect(item).toMatchObject({ status: "done", requires_approval: true });
  });
});

describe("golden round-trip — foundation-state.yaml (gate_d1)", () => {
  it("upsertGateD1InYaml produz YAML que parseFoundationState lê como aprovado, sem afetar as fases do repo", () => {
    const raw = [
      "repos:",
      "  billing-api:",
      "    phases:",
      "      tech-stack:",
      "        status: done",
      "        human_checklist: {}",
      "    gate_d1:",
      "      status: pending",
      "",
    ].join("\n");

    const out = upsertGateD1InYaml(raw, "billing-api", "approved", "2026-08-05T10:00:00Z");
    const state = parseFoundationState(out);

    expect(state).not.toBeNull();
    expect(state!.repos["billing-api"]!.gate_d1).toEqual({ status: "approved", approved_at: "2026-08-05T10:00:00Z" });
    expect(state!.repos["billing-api"]!.phases["tech-stack"]!.status).toBe("done"); // fases intocadas
  });
});
