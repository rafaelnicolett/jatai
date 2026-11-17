import { describe, it, expect } from "vitest";
import { parseInitiativesYaml, activeInitiative, readActiveInitiativeId, hasPlanningGate, parseWaveLabel, parseWaveContent, INITIATIVES_REL, HOTFIX_WAVE_TEMPLATE, HOTFIX_EPIC_TEMPLATE } from "../src/data/initiatives-contract";

describe("initiatives-contract — path canônico", () => {
  it("aponta para .github/artifacts/initiatives.yaml", () => {
    expect(INITIATIVES_REL).toBe(".github/artifacts/initiatives.yaml");
  });
});

describe("parseInitiativesYaml — happy path", () => {
  it("lê o registro com active + N iniciativas", () => {
    const { state, errors } = parseInitiativesYaml(`
version: 1
active: modernize-billing
initiatives:
  - id: modernize-billing
    name: "Modernizar Billing"
    mode: brownfield
    status: in-progress
    stream: downstream
    current_phase: sprint-runner
    owner: time-financeiro
    created_at: "2026-07-01T10:00:00Z"
    priority: high
  - id: new-feature-x
    name: "Feature X"
    status: planned
`);
    expect(errors).toEqual([]);
    expect(state?.active).toBe("modernize-billing");
    expect(state?.initiatives).toHaveLength(2);

    const billing = state!.initiatives[0]!;
    expect(billing.mode).toBe("brownfield");
    expect(billing.status).toBe("in-progress");
    expect(billing.current_phase).toBe("sprint-runner");
    expect(billing.priority).toBe("high");
  });

  it("sem 'active' declarado, a primeira iniciativa listada assume o posto", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: first
    name: First
    status: planned
  - id: second
    name: Second
    status: planned
`);
    expect(state?.active).toBe("first");
  });

  // ADR-0022 §5 (F6.5): antes, um status desconhecido caía para "planned" em silêncio.
  it("REGRESSÃO: status desconhecido é preservado como 'unknown' com o texto original, não vira 'planned' (ADR-0022 / H-GAP-07)", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: nonsense
`);
    expect(state?.initiatives[0]).toMatchObject({ status: "unknown", status_text: "nonsense" });
  });

  it("sem 'name', usa o id como rótulo", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: no-name-here
    status: planned
`);
    expect(state?.initiatives[0]!.name).toBe("no-name-here");
  });
});

describe("parseInitiativesYaml — degradação", () => {
  it("YAML inválido devolve state null e um erro", () => {
    const { state, errors } = parseInitiativesYaml(":\n  :\n    [[[");
    expect(state).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("entrada sem 'id' é descartada e reportada", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - name: Sem Id
    status: planned
`);
    expect(state).toBeNull();
    expect(errors[0]).toContain("'id' ausente");
  });

  it("id duplicado é descartado e reportado — não pode haver ambiguidade no switchInitiative", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: dup
    name: Um
    status: planned
  - id: dup
    name: Dois
    status: planned
`);
    expect(state?.initiatives).toHaveLength(1);
    expect(errors[0]).toContain("duplicado");
  });

  it("arquivo sem nenhuma iniciativa válida devolve null (registro só existe com conteúdo)", () => {
    const { state } = parseInitiativesYaml("initiatives: []");
    expect(state).toBeNull();
  });
});

describe("parseInitiativesYaml — type: modernization (@modernization-planner)", () => {
  it("lê type/scope/arch_target/driven_by/waves do formato real de modernization-planner.agent.md", () => {
    const { state, errors } = parseInitiativesYaml(`
active: mod-billing-hexagonal
initiatives:
  - id: mod-billing-hexagonal
    type: modernization
    name: "billing-api → hexagonal"
    status: planned
    scope: [billing-api]
    arch_target: hexagonal
    driven_by:
      - debt-042
      - debt-017
    waves:
      - "wave-1: characterization tests nos módulos de Faturamento"
      - "wave-2: extrair domínio via Branch by Abstraction"
`);
    expect(errors).toEqual([]);
    const mod = state!.initiatives[0]!;
    expect(mod.type).toBe("modernization");
    expect(mod.scope).toEqual(["billing-api"]);
    expect(mod.arch_target).toBe("hexagonal");
    expect(mod.driven_by).toEqual(["debt-042", "debt-017"]);
    expect(mod.waves).toEqual([
      "wave-1: characterization tests nos módulos de Faturamento",
      "wave-2: extrair domínio via Branch by Abstraction",
    ]);
  });

  it("sem 'type' declarado, o campo fica ausente — trata como feature (default implícito)", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
`);
    expect(state?.initiatives[0]!.type).toBeUndefined();
  });

  it("'type' desconhecido é descartado silenciosamente, não quebra o parse", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    type: nonsense
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]!.type).toBeUndefined();
  });

  it("campos de modernization vazios/ausentes não aparecem no objeto (mesmo padrão dos outros campos opcionais)", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    type: modernization
    scope: []
    waves: []
`);
    expect(state?.initiatives[0]!.scope).toBeUndefined();
    expect(state?.initiatives[0]!.waves).toBeUndefined();
  });
});

describe("parseInitiativesYaml — gate de Planning (feature construída sobre brownfield via @modernization-planner)", () => {
  const YAML = `
initiatives:
  - id: feat-multi-loja-pre-pago
    type: feature
    name: "Múltiplas Lojas para Clientes Pré-pagos"
    status: planned
    scope: [acme-server-application, acme-api, acme-android]
    migration_strategy: expand-contract
    planning_artifacts:
      - .github/artifacts/planning/feat-multi-loja-pre-pago/roadmap.md
      - .github/artifacts/planning/feat-multi-loja-pre-pago/risk-matrix.md
    waves:
      - "wave-1: Expand (characterization tests, nova tabela, dual-write)"
      - "wave-2: Feature (endpoint novo, Parallel Run, corte de leitura)"
      - "wave-3: Contract (backfill definitivo, desligar dual-write)"
    roadmap_gate:
      status: approved
      approved_at: "2026-07-27"
      note: "Roadmap aprovado pelo usuário."
    risk_matrix_gate:
      status: approved
      approved_at: "2026-07-27"
    gate_d2:
      status: approved
      approved_at: "2026-07-27"
`;

  it("lê roadmap_gate/risk_matrix_gate/gate_d2/planning_artifacts/migration_strategy mesmo com type: feature", () => {
    const { state, errors } = parseInitiativesYaml(YAML);
    expect(errors).toEqual([]);
    const init = state!.initiatives[0]!;
    expect(init.type).toBe("feature");
    expect(init.migration_strategy).toBe("expand-contract");
    expect(init.planning_artifacts).toEqual([
      ".github/artifacts/planning/feat-multi-loja-pre-pago/roadmap.md",
      ".github/artifacts/planning/feat-multi-loja-pre-pago/risk-matrix.md",
    ]);
    expect(init.roadmap_gate).toEqual({ status: "approved", approved_at: "2026-07-27", note: "Roadmap aprovado pelo usuário." });
    expect(init.risk_matrix_gate).toEqual({ status: "approved", approved_at: "2026-07-27" });
    expect(init.gate_d2).toEqual({ status: "approved", approved_at: "2026-07-27" });
  });

  it("hasPlanningGate é true — mesmo sendo type: feature, sem arch_target nem waves", () => {
    const { state } = parseInitiativesYaml(YAML);
    expect(hasPlanningGate(state!.initiatives[0])).toBe(true);
  });

  it("hasPlanningGate é false pra uma feature genérica sem nenhum gate de Planning", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: feat-simples
    name: Feature simples
    status: planned
`);
    expect(hasPlanningGate(state!.initiatives[0])).toBe(false);
  });

  it("hasPlanningGate tolera undefined/null (iniciativa ativa inexistente)", () => {
    expect(hasPlanningGate(undefined)).toBe(false);
    expect(hasPlanningGate(null)).toBe(false);
  });

  it("gate de Planning presente SEM 'waves' gera um warning — o gap real que causou a UI errada em produção", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: feat-sem-waves
    type: feature
    name: X
    status: planned
    migration_strategy: expand-contract
    gate_d2:
      status: approved
      approved_at: "2026-07-27"
`);
    expect(state?.initiatives[0]!.gate_d2).toBeDefined();
    expect(errors).toEqual([
      "initiatives[0] (feat-sem-waves): tem gate de Planning (roadmap_gate/risk_matrix_gate/gate_d2/planning_artifacts) mas 'waves'/'epics' estão vazios — a barra lateral de ondas do Progresso não vai aparecer até isso ser preenchido",
    ]);
  });

  it("gate de Planning presente com 'epics' (em vez de 'waves') NÃO dispara o warning — ADR-0006", () => {
    const { errors } = parseInitiativesYaml(`
initiatives:
  - id: feat-com-epics
    type: feature
    name: X
    status: planned
    migration_strategy: expand-contract
    epics:
      - "epic-1: fundação"
    gate_d2:
      status: approved
      approved_at: "2026-09-03"
`);
    expect(errors).toEqual([]);
  });

  it("iniciativa sem NENHUM gate de Planning não dispara o warning de 'waves' ausente", () => {
    const { errors } = parseInitiativesYaml(`
initiatives:
  - id: feat-comum
    name: Feature comum
    status: planned
`);
    expect(errors).toEqual([]);
  });

  it("gate malformado (sem 'status') é descartado, não quebra o parse", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    gate_d2:
      approved_at: "2026-07-27"
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]!.gate_d2).toBeUndefined();
  });
});

describe("parseInitiativesYaml — wave_status (checklist real de Execution por onda)", () => {
  it("lê status/completed_at/artifacts/note do formato real de mod-android-to-flutter", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: mod-android-to-flutter
    type: modernization
    name: X
    status: in-progress
    waves:
      - "wave-0: fundação (skeleton, DI)"
      - "wave-1: Auth (splash, login)"
    wave_status:
      wave-0:
        status: done
        completed_at: "2026-07-19"
        artifacts:
          - "acme_flutter (novo repo)"
          - "88 testes de caracterização"
        note: "Escrever os testes expôs 13 comportamentos novos."
      wave-1:
        status: in-progress
`);
    expect(errors).toEqual([]);
    const init = state!.initiatives[0]!;
    expect(init.wave_status).toEqual({
      "wave-0": {
        status: "done",
        completed_at: "2026-07-19",
        artifacts: ["acme_flutter (novo repo)", "88 testes de caracterização"],
        note: "Escrever os testes expôs 13 comportamentos novos.",
      },
      "wave-1": { status: "in-progress" },
    });
  });

  it("lê o formato item-a-item real (Maestro agregando @test-backfill-agent/@migration-agent) e deriva status da onda", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: feat-multi-loja-pre-pago
    type: feature
    name: X
    status: planned
    wave_status:
      wave-1:
        item-1.1:
          status: done
          completed_at: "2026-07-28"
          artifacts:
            - .github/artifacts/execution/test-backfill-report-acme-api.md
          summary: "50 characterization tests novos, todos verdes."
          known_bugs_pinned:
            - "G-04: Carteira#saldo pode ficar negativo"
        item-1.4:
          status: done
          repo: acme-api
          completed_at: "2026-07-28"
          commit: "4a2cf26"
          merge_block: "⚠️ NÃO mergear sem confirmar migrations em produção."
`);
    expect(errors).toEqual([]);
    const wave1 = state!.initiatives[0]!.wave_status!["wave-1"]!;
    expect(wave1.status).toBe("done");
    expect(Object.keys(wave1.items!)).toEqual(["item-1.1", "item-1.4"]);
    expect(wave1.items!["item-1.1"]).toEqual({
      status: "done",
      completed_at: "2026-07-28",
      artifacts: [".github/artifacts/execution/test-backfill-report-acme-api.md"],
      summary: "50 characterization tests novos, todos verdes.",
      known_bugs_pinned: ["G-04: Carteira#saldo pode ficar negativo"],
    });
    expect(wave1.items!["item-1.4"]).toEqual({
      status: "done",
      repo: "acme-api",
      completed_at: "2026-07-28",
      commit: "4a2cf26",
      merge_block: "⚠️ NÃO mergear sem confirmar migrations em produção.",
    });
  });

  it("onda em item-a-item com pelo menos 1 item não-done deriva status 'in-progress'", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-1:
        item-1.1:
          status: done
        item-1.2:
          status: in-progress
`);
    expect(state!.initiatives[0]!.wave_status!["wave-1"]!.status).toBe("in-progress");
  });

  it("item sem 'status' dentro da onda é descartado, itens válidos sobrevivem", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-1:
        item-1.1:
          status: done
        item-1.2:
          repo: acme-api
`);
    expect(errors).toEqual([]);
    expect(Object.keys(state!.initiatives[0]!.wave_status!["wave-1"]!.items!)).toEqual(["item-1.1"]);
  });

  // M3: a onda que não tem `status` nem item reconhecível sumia sem aviso.
  it("REGRESSÃO: onda sem 'status' e sem item reconhecível é descartada COM aviso; o resto do mapa sobrevive (M3)", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-0:
        status: done
      wave-1:
        completed_at: "2026-07-20"
`);
    expect(errors).toEqual([
      "initiatives[0] (x): wave_status.wave-1 não tem 'status' nem item com 'status' — a onda foi ignorada",
    ]);
    expect(state?.initiatives[0]!.wave_status).toEqual({ "wave-0": { status: "done" } });
  });

  it("REGRESSÃO: `items:` como invólucro (formato do modelo do Cockpit) é lido como os itens da onda (M3)", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-1:
        items:
          item-1.1:
            status: done
          item-1.2:
            status: in-progress
            repo: acme-api
`);
    expect(errors).toEqual([]);
    expect(state!.initiatives[0]!.wave_status!["wave-1"]).toEqual({
      status: "in-progress",
      items: { "item-1.1": { status: "done" }, "item-1.2": { status: "in-progress", repo: "acme-api" } },
    });
  });

  it("REGRESSÃO: invólucro `items:` sem nenhum item com 'status' avisa em vez de perder a onda em silêncio (M3)", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    epic_status:
      epic-1:
        items:
          item-1.1:
            repo: acme-api
`);
    expect(errors).toEqual([
      "initiatives[0] (x): epic_status.epic-1 não tem 'status' nem item com 'status' — a onda foi ignorada",
    ]);
    expect(state!.initiatives[0]!.epic_status).toBeUndefined();
  });

  it("um item que se chama 'items' e tem 'status' continua sendo um item (o invólucro é só o mapa sem 'status')", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-1:
        items:
          status: done
`);
    expect(state!.initiatives[0]!.wave_status!["wave-1"]!.items).toEqual({ items: { status: "done" } });
  });

  it("filho direto da onda vence o mesmo id dentro do invólucro `items:` (o formato do arquivo é o canônico)", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status:
      wave-1:
        item-1.1:
          status: done
        items:
          item-1.1:
            status: pending
`);
    expect(state!.initiatives[0]!.wave_status!["wave-1"]!.items).toEqual({ "item-1.1": { status: "done" } });
  });

  it("wave_status ausente ou totalmente vazio não aparece no objeto", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    wave_status: {}
`);
    expect(state?.initiatives[0]!.wave_status).toBeUndefined();
  });
});

describe("parseInitiativesYaml — epics/epic_status (ADR-0006, vocabulário novo, aditivo)", () => {
  it("lê 'epics' com a mesma tolerância de 'waves'", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    type: modernization
    epics:
      - "epic-1: fundação"
      - "epic-2: expand"
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]!.epics).toEqual(["epic-1: fundação", "epic-2: expand"]);
    expect(state?.initiatives[0]!.waves).toBeUndefined();
  });

  it("lê 'epic_status' item-a-item com o MESMO parser de 'wave_status' (toWaveStatusMap reaproveitado)", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    epic_status:
      epic-1:
        task-1.1:
          status: done
        task-1.2:
          status: in-progress
`);
    expect(errors).toEqual([]);
    const epic1 = state!.initiatives[0]!.epic_status!["epic-1"]!;
    expect(epic1.status).toBe("in-progress");
    expect(Object.keys(epic1.items!)).toEqual(["task-1.1", "task-1.2"]);
  });

  it("epics e wave_status podem coexistir no parser (aditivo) mesmo que a convenção seja nunca escrever os dois juntos", () => {
    const { state, errors } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    waves:
      - "wave-1: legado"
    epics:
      - "epic-1: novo"
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]!.waves).toEqual(["wave-1: legado"]);
    expect(state?.initiatives[0]!.epics).toEqual(["epic-1: novo"]);
  });

  it("epics vazio não aparece no objeto (mesmo padrão de waves)", () => {
    const { state } = parseInitiativesYaml(`
initiatives:
  - id: x
    name: X
    status: planned
    epics: []
`);
    expect(state?.initiatives[0]!.epics).toBeUndefined();
  });
});

describe("parseWaveLabel", () => {
  it("extrai índice e rótulo de 'wave-N: descrição'", () => {
    expect(parseWaveLabel("wave-1: characterization tests nos módulos de Faturamento")).toEqual({
      index: 1,
      label: "characterization tests nos módulos de Faturamento",
    });
  });

  it("tolera 'wave 2 - descrição' (sem hífen antes do número, hífen em vez de dois-pontos)", () => {
    expect(parseWaveLabel("wave 2 - extrair domínio")).toEqual({ index: 2, label: "extrair domínio" });
  });

  it("formato que não bate com 'wave-N: ...' devolve o texto inteiro como label, index null", () => {
    expect(parseWaveLabel("Migração de schema do faturamento")).toEqual({
      index: null,
      label: "Migração de schema do faturamento",
    });
  });

  it("ADR-0006: também extrai índice e rótulo de 'epic-N: descrição' — aditivo, mesma regra de wave-N", () => {
    expect(parseWaveLabel("epic-1: Diagnóstico — causa raiz e escopo do bug")).toEqual({
      index: 1,
      label: "Diagnóstico — causa raiz e escopo do bug",
    });
  });

  it("ADR-0006: tolera 'epic 2 - descrição' (mesma tolerância de formato de 'wave 2 - ...')", () => {
    expect(parseWaveLabel("epic 2 - expand")).toEqual({ index: 2, label: "expand" });
  });
});

describe("parseWaveContent", () => {
  it("extrai título, itens entre parênteses e nota depois do em-dash (formato real observado)", () => {
    expect(
      parseWaveContent(
        "Dinheiro (recarga cartão, PIX, gestão de cartão, extrato) — maior risco, requer specs de paridade aprovadas antes de iniciar"
      )
    ).toEqual({
      title: "Dinheiro",
      items: ["recarga cartão", "PIX", "gestão de cartão", "extrato"],
      note: "maior risco, requer specs de paridade aprovadas antes de iniciar",
    });
  });

  it("sem nota, devolve só título + itens (sem a chave 'note')", () => {
    const result = parseWaveContent("Auth & Onboarding (splash, login, signup)");
    expect(result.title).toBe("Auth & Onboarding");
    expect(result.items).toEqual(["splash", "login", "signup"]);
    expect(result.note).toBeUndefined();
  });

  it("sem parênteses (formato simples do exemplo do agente), devolve o texto inteiro como título, itens vazio", () => {
    expect(parseWaveContent("characterization tests nos módulos de Faturamento")).toEqual({
      title: "characterization tests nos módulos de Faturamento",
      items: [],
    });
  });
});

describe("activeInitiative", () => {
  it("acha a entrada cujo id bate com 'active'", () => {
    const { state } = parseInitiativesYaml(`
active: b
initiatives:
  - id: a
    name: A
    status: planned
  - id: b
    name: B
    status: in-progress
`);
    expect(activeInitiative(state)?.name).toBe("B");
  });

  it("state null devolve undefined", () => {
    expect(activeInitiative(null)).toBeUndefined();
  });
});

// C2 / H-BUG-02: o writer do CLI grava `active: "id"`; os leitores por regex
// guardavam as aspas e montavam `initiatives/"id"/` (split-brain com o
// Cockpit e os agentes, que leem o YAML e usam `initiatives/id/`).
describe("readActiveInitiativeId — `active:` de topo lido como YAML (C2 / H-BUG-02)", () => {
  const ini = (activeLine: string): string => `version: 1\n${activeLine}\ninitiatives:\n  - id: "loja"\n    name: "Loja"\n`;

  it("REGRESSÃO: aspas duplas, aspas simples e sem aspas dão o mesmo id", () => {
    expect(readActiveInitiativeId(ini('active: "loja"'))).toBe("loja");
    expect(readActiveInitiativeId(ini("active: 'loja'"))).toBe("loja");
    expect(readActiveInitiativeId(ini("active: loja"))).toBe("loja");
  });

  it("REGRESSÃO: comentário no fim da linha não entra no id", () => {
    expect(readActiveInitiativeId(ini('active: "loja" # trocado pelo Cockpit'))).toBe("loja");
    expect(readActiveInitiativeId(ini("active: loja   # comentário"))).toBe("loja");
  });

  it("concorda com parseInitiativesYaml (Cockpit) em todos os estilos de escalar", () => {
    for (const line of ['active: "loja"', "active: 'loja'", "active: loja", 'active: "loja" # c', "active:   loja  "]) {
      expect(readActiveInitiativeId(ini(line)), line).toBe(parseInitiativesYaml(ini(line)).state!.active);
    }
  });

  // Achado da F6.1 (frente B): sem `active:` os leitores do caminho humano
  // caíam no arquivo global e `active: null` virava o id "null", enquanto o
  // Cockpit (parseInitiativesYaml) escolhe a primeira iniciativa listada.
  it("REGRESSÃO: sem `active:`, vazio, só espaços ou nulo (null, ~): a primeira iniciativa listada, como o Cockpit", () => {
    expect(readActiveInitiativeId("initiatives:\n  - id: a\n")).toBe("a");
    for (const line of ["active:", 'active: ""', "active: '   '", "active: null", "active: ~", "active: Null", "active: NULL", "active: null # trocar"]) {
      expect(readActiveInitiativeId(ini(line)), line).toBe("loja");
      expect(readActiveInitiativeId(ini(line)), line).toBe(parseInitiativesYaml(ini(line)).state!.active);
    }
  });

  it("`active: \"null\"` entre aspas é um id de texto, como no Cockpit", () => {
    expect(readActiveInitiativeId(ini('active: "null"'))).toBe("null");
    expect(parseInitiativesYaml(ini('active: "null"')).state!.active).toBe("null");
  });

  it("sem nenhuma iniciativa listada e sem `active:`: null (o chamador cai no caminho global, como o Cockpit)", () => {
    expect(readActiveInitiativeId("version: 1\ninitiatives: []\n")).toBeNull();
    expect(readActiveInitiativeId("version: 1\nactive: null\n")).toBeNull();
    expect(readActiveInitiativeId("")).toBeNull();
  });

  it("escalar plano é lido como texto, sem tipos (um id só com dígitos continua string)", () => {
    expect(readActiveInitiativeId(ini("active: 2026"))).toBe("2026");
  });

  it("só o `active:` de topo conta — chave indentada dentro de uma iniciativa é ignorada", () => {
    expect(readActiveInitiativeId("initiatives:\n  - id: a\n    active: b\nactive: \"c\"\n")).toBe("c");
    expect(readActiveInitiativeId("initiatives:\n  - id: a\n    active: b\n")).toBe("a");
  });

  it("CRLF: o \\r não entra no id", () => {
    expect(readActiveInitiativeId('version: 1\r\nactive: "loja"\r\ninitiatives: []\r\n')).toBe("loja");
  });

  it("documento com YAML inválido em outro trecho: ainda lê a linha `active:` como YAML", () => {
    const broken = 'active: "loja" # c\ninitiatives:\n  - id: a\n    name: "sem fechar\n';
    expect(readActiveInitiativeId(broken)).toBe("loja");
  });
});

describe("HOTFIX_WAVE_TEMPLATE (ADR-0001)", () => {
  it("tem exatamente 3 ondas — Diagnóstico, Fix + Testes, Validação", () => {
    expect(HOTFIX_WAVE_TEMPLATE).toHaveLength(3);
    expect(HOTFIX_WAVE_TEMPLATE[0]).toMatch(/^wave-1: Diagnóstico/);
    expect(HOTFIX_WAVE_TEMPLATE[1]).toMatch(/^wave-2: Fix \+ Testes/);
    expect(HOTFIX_WAVE_TEMPLATE[2]).toMatch(/^wave-3: Validação/);
  });

  it("cada onda é parseável por parseWaveLabel — regressão: um template que parseWaveLabel não entende quebra o mapa de ondas no Cockpit", () => {
    for (const [i, raw] of HOTFIX_WAVE_TEMPLATE.entries()) {
      const parsed = parseWaveLabel(raw);
      expect(parsed.index).toBe(i + 1);
      expect(parsed.label.length).toBeGreaterThan(0);
    }
  });

  it("uma iniciativa hotfix com este template usa waves — regressão viva do bug reportado (0/18 na escadaria genérica)", () => {
    const { state, errors } = parseInitiativesYaml(`
active: hf-1
initiatives:
  - id: hf-1
    name: "Hotfix de exemplo"
    status: in-progress
    type: hotfix
    waves:
      - "${HOTFIX_WAVE_TEMPLATE[0]}"
      - "${HOTFIX_WAVE_TEMPLATE[1]}"
      - "${HOTFIX_WAVE_TEMPLATE[2]}"
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]?.waves).toHaveLength(3);
  });
});

describe("HOTFIX_EPIC_TEMPLATE (ADR-0006, vocabulário novo — HOTFIX_WAVE_TEMPLATE nunca é alterado)", () => {
  it("tem exatamente 3 epics — mesmo conteúdo de HOTFIX_WAVE_TEMPLATE, prefixo epic-N", () => {
    expect(HOTFIX_EPIC_TEMPLATE).toHaveLength(3);
    expect(HOTFIX_EPIC_TEMPLATE[0]).toMatch(/^epic-1: Diagnóstico/);
    expect(HOTFIX_EPIC_TEMPLATE[1]).toMatch(/^epic-2: Fix \+ Testes/);
    expect(HOTFIX_EPIC_TEMPLATE[2]).toMatch(/^epic-3: Validação/);
  });

  it("uma iniciativa hotfix pode usar epics em vez de waves", () => {
    const { state, errors } = parseInitiativesYaml(`
active: hf-2
initiatives:
  - id: hf-2
    name: "Hotfix com hierarquia nova"
    status: in-progress
    type: hotfix
    epics:
      - "${HOTFIX_EPIC_TEMPLATE[0]}"
      - "${HOTFIX_EPIC_TEMPLATE[1]}"
      - "${HOTFIX_EPIC_TEMPLATE[2]}"
`);
    expect(errors).toEqual([]);
    expect(state?.initiatives[0]?.epics).toHaveLength(3);
    expect(state?.initiatives[0]?.waves).toBeUndefined();
  });
});
