import { describe, it, expect } from "vitest";
import { upsertInitiative, switchActive, bumpPhase, upsertWaveItem } from "../../src/cli/writers/initiatives-writer";

/**
 * Unit tests puros do motor de escrita estrutural (`yaml` eemeli) — cobrem
 * dois bugs reais encontrados na implementação (ambos verificados também
 * por `golden-round-trip.test.ts`, que relê com o parser real):
 *
 * 1. `doc.setIn`/`doc.addIn` com um objeto/array plano rendem flow-style
 *    (`{ a: 1 }`) por padrão, e um `{}` vazio nem sequer vira um `YAMLMap`
 *    de verdade.
 * 2. Todo scalar string sai sempre ENTRE ASPAS (`status: "done"`, não
 *    `status: done`) — de propósito: um valor sem aspas que "parece" outra
 *    coisa (data, bool, número) é reinterpretado como esse outro tipo por
 *    `js-yaml` na leitura (ex.: `completed_at: 2026-07-28` sem aspas vira
 *    `Date`, não string, e o campo some no parse). Os testes abaixo
 *    verificam a presença das aspas, não é ruído.
 */

describe("upsertInitiative", () => {
  it("cria uma iniciativa nova em block-style, com strings entre aspas, sem duplicar entrada existente", () => {
    const out = upsertInitiative("", {
      id: "feat-x",
      name: "Feature X",
      status: "planned",
      stream: "upstream",
      currentPhase: "business",
    });
    expect(out).not.toContain("[");
    expect(out).toMatch(/initiatives:\n {2}- id: "feat-x"/);
    expect(out).toContain('name: "Feature X"');
    expect(out).toContain('current_phase: "business"');
  });

  it("faz merge de campos numa iniciativa já existente em vez de duplicar", () => {
    const created = upsertInitiative("", { id: "feat-x", name: "Feature X", currentPhase: "business" });
    const updated = upsertInitiative(created, { id: "feat-x", currentPhase: "product" });
    const matches = updated.match(/id: "feat-x"/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(updated).toContain('current_phase: "product"');
    expect(updated).toContain('name: "Feature X"'); // campo não re-enviado é preservado
  });

  it("--active seta o active: de topo; sem a flag, não mexe nele", () => {
    const withoutActive = upsertInitiative("", { id: "feat-x", name: "Feature X" });
    expect(withoutActive).not.toContain("active:");

    const withActive = upsertInitiative("", { id: "feat-y", name: "Feature Y", setActive: true });
    expect(withActive).toContain('active: "feat-y"');
  });
});

describe("switchActive", () => {
  it("troca o active: preservando o resto do documento", () => {
    const raw = "active: mod-billing\ninitiatives:\n  - id: mod-billing\n    name: Billing\n    status: planned\n";
    const out = switchActive(raw, "feat-lojas");
    expect(out).toContain('active: "feat-lojas"');
    expect(out).toContain("id: mod-billing"); // resto do doc intocado (não reescrito por este writer)
  });
});

describe("bumpPhase", () => {
  it("atualiza current_phase da iniciativa certa quando há mais de uma", () => {
    let doc = upsertInitiative("", { id: "a", name: "A", currentPhase: "business" });
    doc = upsertInitiative(doc, { id: "b", name: "B", currentPhase: "business" });

    const { content, found } = bumpPhase(doc, "b", "product");
    expect(found).toBe(true);
    expect(content).toMatch(/id: "a"[\s\S]*current_phase: "business"/);
    expect(content).toMatch(/id: "b"[\s\S]*current_phase: "product"/);
  });

  it("found: false quando o id não existe — não deve inventar entrada nem corromper o arquivo", () => {
    const doc = upsertInitiative("", { id: "a", name: "A" });
    const { content, found } = bumpPhase(doc, "nao-existe", "product");
    expect(found).toBe(false);
    expect(content).toBe(doc); // conteúdo devolvido intacto
  });
});

describe("upsertWaveItem", () => {
  it("cria wave_status.<wave>.<item> do zero, em block-style, sem wrapper 'items:'", () => {
    const base = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    const { content, found } = upsertWaveItem(base, "mod-x", "wave-1", "item-1.1", {
      status: "done",
      repo: "billing-api",
      commit: "4a2cf26",
      artifacts: ["docs/adr/0003.md", "code/services/billing-api/README.md"],
    });
    expect(found).toBe(true);
    expect(content).not.toContain("[");
    // item-1.1 é filho DIRETO de wave-1 — sem "items:" no meio (ver docblock do writer)
    expect(content).toMatch(/wave_status:\n {6}wave-1:\n {8}item-1\.1:/);
    expect(content).toContain('status: "done"');
    expect(content).toContain('repo: "billing-api"');
    expect(content).toMatch(/artifacts:\n\s+- "docs\/adr\/0003\.md"/);
  });

  it("dois itens na mesma wave convivem — o segundo não sobrescreve o primeiro", () => {
    const base = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    const step1 = upsertWaveItem(base, "mod-x", "wave-1", "item-1.1", { status: "done" }).content;
    const step2 = upsertWaveItem(step1, "mod-x", "wave-1", "item-1.2", { status: "in-progress" }).content;

    expect(step2).toContain("item-1.1:");
    expect(step2).toContain("item-1.2:");
    expect(step2).toMatch(/item-1\.1:\n\s+status: "done"/);
    expect(step2).toMatch(/item-1\.2:\n\s+status: "in-progress"/);
  });

  it("atualiza um item já existente in-place (upsert, não duplica)", () => {
    const base = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    const first = upsertWaveItem(base, "mod-x", "wave-1", "item-1.1", { status: "in-progress" }).content;
    const second = upsertWaveItem(first, "mod-x", "wave-1", "item-1.1", { status: "done", commit: "abc123" }).content;

    expect((second.match(/item-1\.1:/g) ?? []).length).toBe(1);
    expect(second).toContain('status: "done"');
    expect(second).toContain('commit: "abc123"');
  });

  it("valores que parecem data/número/bool saem sempre entre aspas — não viram outro tipo YAML na releitura", () => {
    const base = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    const { content } = upsertWaveItem(base, "mod-x", "wave-1", "item-1.1", {
      status: "done",
      completedAt: "2026-07-28",
    });
    expect(content).toContain('completed_at: "2026-07-28"');
  });

  it("found: false quando a iniciativa não existe", () => {
    const { found } = upsertWaveItem("initiatives: []\n", "nao-existe", "wave-1", "item-1.1", { status: "done" });
    expect(found).toBe(false);
  });

  it("Onda 1 — status omitido: aprova (humanApprovedAt) sem tocar no status que o agente já reportou", () => {
    const base = upsertInitiative("", { id: "mod-x", name: "Modernização X" });
    const reported = upsertWaveItem(base, "mod-x", "wave-1", "item-1.1", {
      status: "done",
      repo: "billing-api",
      mergeBlock: "aguarda confirmação de rollback",
    }).content;

    const approved = upsertWaveItem(reported, "mod-x", "wave-1", "item-1.1", {
      humanApprovedAt: "2026-08-05T10:00:00Z",
    }).content;

    expect(approved).toContain('status: "done"'); // preservado, não sobrescrito
    expect(approved).toContain('repo: "billing-api"'); // preservado
    expect(approved).toContain('merge_block: "aguarda confirmação de rollback"'); // preservado
    expect(approved).toContain('human_approved_at: "2026-08-05T10:00:00Z"'); // novo
  });
});
