import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { stringify } from "yaml";
import { parseInitiativesYaml } from "../../src/data/initiatives-contract.pure";
import { parseDeliveryState } from "../../src/data/delivery-state-contract.pure";
import { parseFoundationState } from "../../src/data/foundation-state-contract.pure";
import { parseReposYaml, upsertPinnedSha, upsertRepoField } from "../../src/data/repos-contract.pure";
import { parseContextReposYaml } from "../../src/data/context-repos-contract.pure";
import { parseRepoGraph } from "../../src/data/repo-graph-contract.pure";
import { parseSprintBacklog } from "../../src/data/sprint-backlog-contract.pure";
import { parseDevopsStatus, parseObservabilityStatus, parseIncidentsLog, parseSustainLog } from "../../src/data/operations-contract.pure";
import { upsertInitiative, switchActive, bumpPhase, upsertWaveItem } from "../../src/cli/writers/initiatives-writer";
import { upsertSprintItemStatus } from "../../src/cli/writers/sprint-backlog-writer";
import {
  upsertPhaseStatusInYaml,
  upsertChecklistItemInYaml,
  upsertPhaseArtifactsInYaml,
  upsertPhaseCompletedAtInYaml,
  upsertPhaseInYaml,
  upsertGateD1InYaml,
} from "../../src/views/actions/yamlUpsert";
import { YamlStateRepository } from "../../src/cli/lib/StateRepository";
import { getActiveDeliveryStatePath } from "../../src/views/actions/deliveryStatePaths.pure";
import { getActiveSyncContext } from "../../src/views/actions/hostChat";
import { WorkspaceStateReader } from "../../src/chat/WorkspaceStateReader";
import { cleanupWorkspaces, listTree, makeWorkspace } from "../characterization/helpers/workspace-fixture";

/**
 * Round-trip dos schemas YAML (parse → write → parse) — F0.4 (lane B),
 * arquitetura-e-refatoracao.md §5.3 ("YAML é a fonte da verdade") e §7.1
 * ("Schemas YAML … golden round-trip + fixtures").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Fixtures SINTÉTICAS em `tests/contract/fixtures/yaml/` (ids inventados, sem
 * dado real). Para cada um dos 8 schemas:
 * 1. MODELO: o que o parser lê da fixture (snapshot) — pina as normalizações
 *    (defaults, enums rebaixados, entradas descartadas com erro);
 * 2. PONTO FIXO: `parse(stringify(parse(x))) == parse(x)` — o modelo
 *    normalizado é ele mesmo um YAML válido para o parser (contrato para o
 *    passo 3.1, que move os parsers para `core/`);
 * 3. WRITER REAL (quando o código tem um): `parse(write(x))` muda SÓ o que o
 *    writer devia mudar, e preserva comentários (edição cirúrgica).
 *
 * `tests/cli/golden-round-trip.test.ts` já fecha writer→parser partindo de
 * arquivo vazio; aqui o ponto de partida é um arquivo rico e os efeitos
 * colaterais conhecidos ficam pinados como `@known-bug` (C2, A1, A2, A3, A9,
 * H-BUG-26/34/57/62, H-GAP-07).
 */

const FIX = path.join(__dirname, "fixtures", "yaml");
const read = (name: string): string => fs.readFileSync(path.join(FIX, name), "utf-8");

/**
 * Serialização do ponto fixo com strings ENTRE ASPAS — o mesmo estilo dos
 * writers do código (`initiatives-writer.ts` força `QUOTE_DOUBLE`). Sem
 * aspas, datas ISO viravam `Date` no js-yaml e sumiam (H-BUG-34 / M5,
 * corrigido na F3.3: os parsers de estado leem sem o tipo timestamp).
 */
const quotedYaml = (value: unknown): string => stringify(value, { defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN" });

/** O modelo de iniciativas embrulha itens em `items`; o arquivo não (itens são filhos diretos da onda). */
function initiativesModelToFile(state: unknown): unknown {
  const clone = structuredClone(state) as { initiatives: Array<Record<string, unknown>> };
  for (const init of clone.initiatives) {
    for (const key of ["wave_status", "epic_status"]) {
      const groups = init[key] as Record<string, Record<string, unknown>> | undefined;
      if (!groups) continue;
      for (const [wave, entry] of Object.entries(groups)) {
        const { items, ...own } = entry as { items?: Record<string, unknown> };
        groups[wave] = { ...own, ...(items ?? {}) };
      }
    }
  }
  return clone;
}

afterAll(() => cleanupWorkspaces());

describe("round-trip — initiatives.yaml", () => {
  const raw = read("initiatives.yaml");
  const parsed = parseInitiativesYaml(raw);

  it("modelo lido da fixture (snapshot) — sem erros", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.state).toMatchSnapshot();
  });

  it("ponto fixo: o modelo re-serializado (itens achatados de volta na onda) é lido igual", () => {
    expect(parseInitiativesYaml(quotedYaml(initiativesModelToFile(parsed.state))).state).toEqual(parsed.state);
  });

  // M3 (achado da F0.4), corrigido na F6.3: o MODELO expõe
  // `wave_status.<onda>.items`, mas no ARQUIVO os itens são filhos diretos da
  // onda. Um YAML escrito no formato do modelo (`items:` literal, como um
  // agente que copiou o JSON do Cockpit) perdia todos os itens sem erro
  // nenhum: `items` virava um "item" sem `status` e era descartado.
  it("REGRESSÃO: `items:` literal sob a onda (formato do MODELO) é lido como invólucro — o modelo volta igual, sem erro (M3)", () => {
    expect(parsed.state!.initiatives[1]!.wave_status!["wave-1"]!.items).toBeDefined();
    const { state, errors } = parseInitiativesYaml(quotedYaml(parsed.state));
    expect(errors).toEqual([]);
    expect(state).toEqual(parsed.state);
  });

  it("writer upsertWaveItem: só o item alvo muda; comentários sobrevivem", () => {
    const { content, found } = upsertWaveItem(raw, "pedidos-mod", "wave-1", "item-1.2", { status: "done", commit: "def5678" });
    expect(found).toBe(true);
    expect(content).toContain("# brownfield com Planning (waves + gates)");
    const after = parseInitiativesYaml(content).state!;
    const expected = structuredClone(parsed.state!);
    const wave = expected.initiatives[1]!.wave_status!["wave-1"]!;
    wave.items!["item-1.2"] = { status: "done", repo: "catalogo-web", commit: "def5678" };
    expect(after).toEqual(expected);
  });

  it("writer bumpPhase + upsertInitiative(merge): campos não informados ficam intactos", () => {
    let content = bumpPhase(raw, "loja-demo", "product").content;
    content = upsertInitiative(content, { id: "catalogo-hotfix", owner: "time-catalogo" });
    const after = parseInitiativesYaml(content).state!;
    const expected = structuredClone(parsed.state!);
    expected.initiatives[0]!.current_phase = "product";
    expected.initiatives[2]!.owner = "time-catalogo";
    expect(after).toEqual(expected);
  });

  it("writer switchActive grava o id ENTRE ASPAS (bytes pinados) e o parser estrutural lê sem aspas", () => {
    const content = switchActive(raw, "pedidos-mod");
    expect(content).toMatch(/^active: "pedidos-mod"$/m);
    expect(parseInitiativesYaml(content).state!.active).toBe("pedidos-mod");
  });

  // C2 / H-BUG-02 (crítico, Epic 6), corrigido na F6.1: o writer grava
  // `active: "id"` e os leitores do caminho humano (toggles/aprovações, chat,
  // telemetria) agora leem o valor como YAML, sem as aspas — a mesma pasta
  // `initiatives/id/` que o parser estrutural (Cockpit, agentes via CLI) usa.
  // Achado da F6.1 (frente B): sem `active:` (ou com `active: null`), os
  // leitores do caminho humano usavam o delivery-state GLOBAL (ou
  // `initiatives/null/`), enquanto o Cockpit mostra a primeira iniciativa.
  it("REGRESSÃO: sem `active:` ou com `active: null`, os leitores do caminho humano usam a iniciativa que o Cockpit mostra (a primeira)", () => {
    const withoutActive = raw.replace(/^active:.*\n/m, "");
    expect(withoutActive).not.toMatch(/^active:/m);
    for (const [name, content] of [["sem-active", withoutActive], ["active-null", `active: null\n${withoutActive}`]] as const) {
      const root = makeWorkspace(`active-${name}`, { ".github/artifacts/initiatives.yaml": content });
      const cockpit = parseInitiativesYaml(content).state!.active;
      expect(cockpit, name).toBe("loja-demo");

      expect(path.relative(root, getActiveDeliveryStatePath(root)), name).toBe(path.join(".github", "artifacts", "initiatives", cockpit, "delivery-state.yaml"));
      expect(getActiveSyncContext(root).initiativeId, name).toBe(cockpit);
      expect(new WorkspaceStateReader(root).read().activeId, name).toBe(cockpit);
      expect(fs.existsSync(path.join(root, ".github/artifacts/initiatives/null")), name).toBe(false);
    }
  });

  it('REGRESSÃO: depois de switchActive, os leitores do caminho humano veem o id sem aspas e usam initiatives/id/ (C2 / H-BUG-02)', () => {
    const root = makeWorkspace("c2-split-brain", { ".github/artifacts/initiatives.yaml": switchActive(raw, "pedidos-mod") });

    expect(parseInitiativesYaml(fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8")).state!.active).toBe("pedidos-mod");

    const activePath = getActiveDeliveryStatePath(root);
    expect(path.relative(root, activePath)).toBe(path.join(".github", "artifacts", "initiatives", "pedidos-mod", "delivery-state.yaml"));
    expect(listTree(root).filter((p) => p.includes('"'))).toEqual([]);

    expect(getActiveSyncContext(root)).toEqual({ initiativeId: "pedidos-mod", initiativeName: "Modernização de Pedidos", projectSlug: "" });

    const chat = new WorkspaceStateReader(root).read();
    expect(chat.activeId).toBe("pedidos-mod");
  });

  // Achado da F3.1 (frente D; parte do H-BUG-22): o chat
  // (`WorkspaceStateReader`) só reconhecia `- id:` na coluna 0. O writer do
  // CLI grava a lista indentada (e entre aspas), e o chat dizia "Workspace sem
  // iniciativas" num workspace que o Cockpit mostra cheio.
  it("REGRESSÃO: o chat lê a lista de iniciativas indentada (writer do CLI e fixture) e flow-style, com os mesmos valores do Cockpit", () => {
    const viaCli = upsertInitiative(upsertInitiative("", { id: "pedidos-mod", name: "Pedidos", currentPhase: "product", stream: "downstream", priority: "P1" }), { id: "loja-demo" });
    const flow = 'active: loja-demo\ninitiatives: [{id: loja-demo, name: "Loja Demo", current_phase: business}, {id: pedidos-mod, status: done}]\n';
    for (const [name, content] of [["fixture", raw], ["writer-do-cli", switchActive(viaCli, "pedidos-mod")], ["flow-style", flow]] as const) {
      const root = makeWorkspace(`chat-lista-${name}`, { ".github/artifacts/initiatives.yaml": content });
      const cockpit = parseInitiativesYaml(content).state!;
      const chat = new WorkspaceStateReader(root).read();
      expect(chat.initiatives.map((i) => i.id), name).toEqual(cockpit.initiatives.map((i) => i.id));
      expect(chat.activeInitiative?.id, name).toBe(cockpit.active);
      for (const [i, init] of cockpit.initiatives.entries()) {
        expect(chat.initiatives[i], `${name} ${init.id}`).toMatchObject({
          name: init.name,
          status: init.status,
          stream: init.stream ?? "upstream",
          current_phase: init.current_phase ?? "business",
        });
      }
    }
  });

  it("REGRESSÃO: o chat acha a iniciativa ativa com aspas em qualquer combinação de `active:` e `- id:` (C2 / H-BUG-02)", () => {
    const file = (active: string, id: string): string => `active: ${active}\ninitiatives:\n- id: ${id}\n  name: "Pedidos"\n  status: in-progress\n`;
    for (const [active, id] of [['"pedidos-mod"', '"pedidos-mod"'], ['"pedidos-mod"', "pedidos-mod"], ["pedidos-mod", "'pedidos-mod'"], ["pedidos-mod # c", "pedidos-mod"]] as const) {
      const root = makeWorkspace("c2-chat", { ".github/artifacts/initiatives.yaml": file(active, id) });
      const chat = new WorkspaceStateReader(root).read();
      expect(chat.activeInitiative?.id, `${active} / ${id}`).toBe("pedidos-mod");
    }
  });

  // H-BUG-26, corrigido junto com o C2 na F6.1 (mesma função, mesma causa: ler
  // escalar YAML por regex guardando as aspas). O writer grava `- id: "x"`; o
  // bump in-place agora compara o id da entrada e o `active:` como YAML.
  it("REGRESSÃO: bumpActiveInitiativeCurrentPhaseInPlace acha a iniciativa criada pelo writer (`- id: \"x\"`) e grava a fase (H-BUG-26)", async () => {
    const seeded = upsertInitiative("", { id: "pedidos-mod", currentPhase: "business" });
    const root = makeWorkspace("bug26", { ".github/artifacts/initiatives.yaml": seeded });
    const repo = new YamlStateRepository();
    await repo.setActiveInitiativeInPlace(root, "pedidos-mod");
    const before = fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8");
    expect(before).toMatch(/^active: pedidos-mod$/m);
    expect(before).toContain('- id: "pedidos-mod"');
    await repo.bumpActiveInitiativeCurrentPhaseInPlace(root, "product");
    const after = fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8");
    expect(after).toBe(before.replace('current_phase: "business"', "current_phase: product"));
    expect(parseInitiativesYaml(after).state!.initiatives[0]!.current_phase).toBe("product");
  });

  it("REGRESSÃO: bumpActiveInitiativeCurrentPhaseInPlace com `active: \"id\"` (switchActive) e `- id:` sem aspas grava a fase da iniciativa certa (C2 / H-BUG-02)", async () => {
    const root = makeWorkspace("c2-bump", { ".github/artifacts/initiatives.yaml": switchActive(raw, "pedidos-mod") });
    await new YamlStateRepository().bumpActiveInitiativeCurrentPhaseInPlace(root, "operation");
    const after = parseInitiativesYaml(fs.readFileSync(path.join(root, ".github/artifacts/initiatives.yaml"), "utf-8")).state!;
    expect(after.initiatives.find((i) => i.id === "pedidos-mod")!.current_phase).toBe("operation");
    expect(after.initiatives.find((i) => i.id === "loja-demo")!.current_phase).toBe("business");
  });

  // M5 / H-BUG-34, corrigido na F3.3: o js-yaml (DEFAULT_SCHEMA) virava data
  // sem aspas em `Date`, e o parser, que só aceita string, descartava o campo.
  it("REGRESSÃO: created_at sem aspas (2025-03-01) é lido como o texto do arquivo (M5 / H-BUG-34)", () => {
    const { state } = parseInitiativesYaml("initiatives:\n  - id: x\n    created_at: 2025-03-01\n");
    expect(state!.initiatives[0]).toEqual({ id: "x", name: "x", status: "planned", created_at: "2025-03-01" });
  });
});

describe("round-trip — delivery-state.yaml", () => {
  const raw = read("delivery-state.yaml");
  const parsed = parseDeliveryState(raw);

  it("modelo lido da fixture (snapshot): alias sprint-planner → sprint-plan, status desconhecido → unknown com o texto (ADR-0022)", () => {
    expect(parsed).toMatchSnapshot();
  });

  it("ponto fixo: o modelo re-serializado é lido igual", () => {
    expect(parseDeliveryState(quotedYaml(parsed))).toEqual(parsed);
  });

  it("writers cirúrgicos (checklist alias-aware, artifacts, completed_at): só o alvo muda, comentário sobrevive", () => {
    let content = upsertChecklistItemInYaml(raw, "sprint-plan", "capacity-ok", true, "human_checklist");
    content = upsertPhaseArtifactsInYaml(content, "product", [".github/artifacts/prd.md"]);
    content = upsertPhaseCompletedAtInYaml(content, "product", "2025-03-09T00:00:00Z");
    content = upsertPhaseStatusInYaml(content, "business", "skipped");
    expect(content).toContain("# Fixture SINTÉTICA");
    expect(content).not.toMatch(/^ {2}sprint-plan:/m); // alias-aware: nenhum bloco-sombra
    const expected = structuredClone(parsed!);
    expected.phases["sprint-plan"]!.human_checklist["capacity-ok"] = true;
    expected.phases.product!.artifacts = [{ path: ".github/artifacts/prd.md" }];
    expected.phases.product!.completed_at = "2025-03-09T00:00:00Z";
    expected.phases.business!.status = "skipped";
    expect(parseDeliveryState(content)).toEqual(expected);
  });

  // Corrigido na F3.1 — A1 / H-BUG-05: antes o bloco inteiro da fase era
  // substituído por `status: done` + `completed_at` (somiam agent, artifacts e
  // human_checklist).
  it("upsertPhaseInYaml atualiza só status e completed_at: agent, artifacts e human_checklist sobrevivem (A1 / H-BUG-05)", () => {
    const after = parseDeliveryState(upsertPhaseInYaml(raw, "business", "2025-03-10T00:00:00Z"))!;
    expect(after.phases.business).toEqual({ ...parsed!.phases.business!, status: "done", completed_at: "2025-03-10T00:00:00Z" });
    expect(after.phases.business!.agent).toBe("@business");
    const others = structuredClone(parsed!);
    delete others.phases.business;
    const afterOthers = structuredClone(after);
    delete afterOthers.phases.business;
    expect(afterOthers).toEqual(others);
  });

  // Corrigido na F3.1 — A1 / H-BUG-05: antes o human-ok ia para a seção
  // `checklist` (que nenhum leitor do gate lê) e logo depois o bloco inteiro
  // era apagado.
  it("advanceDeliveryPhaseInPlace mantém o bloco da fase e grava o human-ok em human_checklist (A1 / H-BUG-05)", async () => {
    const root = makeWorkspace("a1-advance", { "ds.yaml": raw });
    const file = path.join(root, "ds.yaml");
    await new YamlStateRepository().advanceDeliveryPhaseInPlace(file, "product", "2025-03-11T00:00:00Z", { id: "ux-design", agent: "@ux-designer" });
    const text = fs.readFileSync(file, "utf-8");
    expect(text).toContain("# Fixture SINTÉTICA");
    const after = parseDeliveryState(text)!;
    expect(after.phases.product).toEqual({
      status: "done",
      agent: "@product",
      completed_at: "2025-03-11T00:00:00Z",
      human_checklist: { "prd-references-brief": true, "human-ok": true },
    });
    expect(after.phases["ux-design"]).toEqual({ status: "in-progress", agent: "@ux-designer", human_checklist: {} });
  });

  // Corrigido na F3.1 — A2 / H-BUG-06 (bloco-sombra, bug antigo #2/#3): antes
  // nascia um bloco `sprint-plan:` ao lado do `sprint-planner:` do agente e o
  // parser escondia o do agente.
  it("upsertPhaseStatusInYaml reconhece alias — atualiza o bloco `sprint-planner:` do agente, sem bloco-sombra (A2 / H-BUG-06)", () => {
    const content = upsertPhaseStatusInYaml(raw, "sprint-plan", "in-progress");
    expect(content).not.toMatch(/^ {2}sprint-plan:$/m);
    expect(content).toMatch(/^ {2}sprint-planner:\n {4}status: in-progress$/m);
    const after = parseDeliveryState(content)!;
    expect(after.phases["sprint-plan"]).toEqual({ status: "in-progress", agent: "@sprint-planner", human_checklist: { "backlog-ok": true } });
  });

  it("escrita com o id do agente (alias) acha o bloco canônico, e bloco novo nasce com a chave canônica (A2 / H-BUG-06)", () => {
    const canonicalBlock = "phases:\n  sprint-plan:\n    status: in-progress\n";
    const status = upsertPhaseStatusInYaml(canonicalBlock, "sprint-planner", "done");
    expect(status).toBe("phases:\n  sprint-plan:\n    status: done\n");
    expect(upsertChecklistItemInYaml(canonicalBlock, "sprint-planner", "backlog-ok", true, "human_checklist")).not.toMatch(/^ {2}sprint-planner:/m);
    expect(upsertPhaseCompletedAtInYaml(canonicalBlock, "sprint-planner", "2025-03-12T00:00:00Z")).not.toMatch(/^ {2}sprint-planner:/m);
    expect(upsertPhaseArtifactsInYaml(canonicalBlock, "sprint-planner", ["x.md"])).not.toMatch(/^ {2}sprint-planner:/m);
    expect(upsertPhaseInYaml(canonicalBlock, "sprint-planner", "2025-03-12T00:00:00Z")).not.toMatch(/^ {2}sprint-planner:/m);
    const fresh = upsertPhaseStatusInYaml("phases:\n  bdd:\n    status: done\n", "sprint-planner", "in-progress");
    expect(fresh).toMatch(/^ {2}sprint-plan:\n {4}status: in-progress$/m);
    expect(upsertPhaseStatusInYaml("", "domain-modeler", "in-progress")).toBe("phases:\n  domain:\n    status: in-progress\n");
  });

  // Corrigido na F3.1 — A3 / H-BUG-17: antes `readChecklistState('sprint-plan')`
  // devolvia {} com o bloco no alias, e a aprovação travava em "Não posso avançar".
  it("readChecklistState('sprint-plan') lê o checklist do bloco gravado sob o alias sprint-planner (A3 / H-BUG-17)", () => {
    const root = makeWorkspace("a3-checklist", { "ds.yaml": raw });
    const repo = new YamlStateRepository();
    expect(repo.readChecklistState(path.join(root, "ds.yaml"), "sprint-plan", "human_checklist")).toEqual({ "backlog-ok": true });
    expect(repo.readChecklistState(path.join(root, "ds.yaml"), "sprint-planner", "human_checklist")).toEqual({ "backlog-ok": true });
    const canonical = makeWorkspace("a3-checklist-canonico", { "ds.yaml": "phases:\n  sprint-plan:\n    human_checklist:\n      backlog-ok: true\n" });
    expect(repo.readChecklistState(path.join(canonical, "ds.yaml"), "sprint-planner", "human_checklist")).toEqual({ "backlog-ok": true });
  });

  // Achado da F6.2 (frente C), classe "nome de seção": a seção entrava crua em
  // `new RegExp`. O writer (A9) grava a seção escapada por `yamlKey`; o leitor
  // tem que achar exatamente a mesma chave.
  it("REGRESSÃO: readChecklistState acha a seção pelo texto da chave, como o writer grava ('.' não é curinga, '(' não lança)", () => {
    const repo = new YamlStateRepository();
    const ds = "phases:\n  business:\n    status: in-progress\n    checkxlist:\n      a: true\n    check.list:\n      b: true\n";
    const root = makeWorkspace("secao-regex", { "ds.yaml": ds });
    expect(repo.readChecklistState(path.join(root, "ds.yaml"), "business", "check.list")).toEqual({ b: true });

    for (const section of ["lista(1", "testes: ok"]) {
      const written = upsertChecklistItemInYaml("phases:\n  business:\n    status: in-progress\n", "business", "x", true, section);
      const file = path.join(makeWorkspace("secao-escapada", { "ds.yaml": written }), "ds.yaml");
      expect(repo.readChecklistState(file, "business", section), section).toEqual({ x: true });
    }
  });

  // BUG-27: o leitor do gate HITL também assumia 2 espaços — num arquivo com
  // 4, a aprovação travava em "itens pendentes" mesmo com tudo marcado.
  it("REGRESSÃO: readChecklistState lê o checklist de um delivery-state indentado com 4 espaços (BUG-27)", () => {
    const ds4 = "phases:\n    business:\n        status: in-progress\n        human_checklist:\n            problem-section: true\n            human-ok: false\n";
    const root = makeWorkspace("bug27-checklist", { "ds.yaml": ds4 });
    expect(new YamlStateRepository().readChecklistState(path.join(root, "ds.yaml"), "business", "human_checklist")).toEqual({ "problem-section": true, "human-ok": false });
  });

  // H-BUG-62, corrigido na F6.3: o `agent` explícito (CLI `--agent`, HTTP e
  // MCP chegam por `upsertDeliveryPhaseAtomic`) era ignorado quando a fase já
  // existia. O SQLite do Parallel Run já gravava; o YAML divergia.
  it("REGRESSÃO: upsertDeliveryPhaseAtomic com agent troca o agent da fase existente; só agent e status mudam (H-BUG-62)", async () => {
    const root = makeWorkspace("bug62", { "ds.yaml": raw });
    const file = path.join(root, "ds.yaml");
    expect(await new YamlStateRepository().upsertDeliveryPhaseAtomic(file, "product", { status: "done", agent: "@outro-agente" })).toEqual({ changed: true });
    const expected = structuredClone(parsed!);
    expected.phases.product = { ...expected.phases.product!, status: "done", agent: "@outro-agente" };
    expect(parseDeliveryState(fs.readFileSync(file, "utf-8"))).toEqual(expected);
  });

  it("aprovar uma fase não troca o agent já gravado na fase seguinte (o agent do catálogo só entra num bloco novo)", async () => {
    const content = "phases:\n  business:\n    status: in-progress\n  product:\n    status: pending\n    agent: \"@product-custom\"\n";
    const root = makeWorkspace("bug62-advance", { "ds.yaml": content });
    const file = path.join(root, "ds.yaml");
    await new YamlStateRepository().advanceDeliveryPhaseInPlace(file, "business", "2026-11-15T10:00:00Z", { id: "product", agent: "@product" });
    expect(parseDeliveryState(fs.readFileSync(file, "utf-8"))!.phases.product).toMatchObject({ status: "in-progress", agent: "@product-custom" });
  });

  // Corrigido na F3.1 — A9 / H-BUG-15: antes os valores eram interpolados sem
  // escape (`      item: quebrado: true`) e o parser devolvia null.
  it("item de checklist com ': ' e agente com aspas são escapados: o YAML continua válido e o valor volta intacto (A9 / H-BUG-15)", () => {
    const content = upsertChecklistItemInYaml(raw, "product", "item: quebrado", true, "human_checklist");
    expect(content).toContain('      "item: quebrado": true');
    expect(parseDeliveryState(content)!.phases.product!.human_checklist).toEqual({ "prd-references-brief": true, "item: quebrado": true });
    // segunda escrita do mesmo item acha a chave escapada (não duplica)
    expect(upsertChecklistItemInYaml(content, "product", "item: quebrado", false, "human_checklist").match(/item: quebrado/g)).toHaveLength(1);
    const withAgent = upsertPhaseStatusInYaml("", "qa", "done", 'qa "lead"');
    expect(parseDeliveryState(withAgent)!.phases.qa!.agent).toBe('qa "lead"');
  });

  it("writer que deixaria inválido um delivery-state.yaml válido lança erro e não grava nada (A9 / H-BUG-15)", async () => {
    const root = makeWorkspace("a9-guard", { "ds.yaml": raw });
    const file = path.join(root, "ds.yaml");
    const repo = new YamlStateRepository();
    // `--section status` cria uma chave `status:` duplicada no bloco da fase
    await expect(repo.upsertDeliveryChecklistItemAtomic(file, "product", "x", true, "status")).rejects.toThrow(/YAML inválido/);
    await expect(repo.toggleDeliveryChecklistInPlace(root, file, "product", "x", true, "status")).rejects.toThrow(/YAML inválido/);
    expect(fs.readFileSync(file, "utf-8")).toBe(raw);
    // arquivo que já chegou inválido não é bloqueado pela guarda (ela só recusa o que a escrita quebra)
    const broken = makeWorkspace("a9-guard-broken", { "ds.yaml": "phases:\n  qa:\n    status: done\n    status: done\n" });
    await expect(repo.upsertDeliveryPhaseAtomic(path.join(broken, "ds.yaml"), "qa", { status: "in-progress" })).resolves.toBeDefined();
  });

  // H-GAP-07, corrigido na F6.5 (ADR-0022 §5): antes o status fora do enum virava "pending" em silêncio.
  it("REGRESSÃO: status fora do vocabulário é lido como 'unknown', com o texto original preservado (H-GAP-07)", () => {
    expect(parsed!.phases.domain).toMatchObject({ status: "unknown", human_checklist: {} });
    expect(typeof parsed!.phases.domain!.status_text).toBe("string");
  });

  // M5 / H-BUG-34, corrigido na F3.3.
  it("REGRESSÃO: completed_at sem aspas é preservado como texto (M5 / H-BUG-34)", () => {
    const after = parseDeliveryState("phases:\n  business:\n    status: done\n    completed_at: 2025-04-11\n")!;
    expect(after.phases.business).toEqual({ status: "done", completed_at: "2025-04-11", human_checklist: {} });
  });
});

describe("round-trip — assessment/foundation-state.yaml", () => {
  const raw = read("foundation-state.yaml");
  const parsed = parseFoundationState(raw);

  it("modelo lido da fixture (snapshot): v2 multi-repo, alias design-system → design", () => {
    expect(parsed).toMatchSnapshot();
  });

  it("ponto fixo: o modelo re-serializado é lido igual", () => {
    expect(parseFoundationState(quotedYaml(parsed))).toEqual(parsed);
  });

  it("writer upsertGateD1InYaml: só o gate do repo alvo muda; fases e findings intactos", () => {
    const after = parseFoundationState(upsertGateD1InYaml(raw, "pedidos-api", "approved", "2025-02-05T00:00:00Z"));
    const expected = structuredClone(parsed!);
    expected.repos["pedidos-api"]!.gate_d1 = { status: "approved", approved_at: "2025-02-05T00:00:00Z" };
    expect(after).toEqual(expected);
  });

  it("writer do checklist humano do Foundation (caminho do toggleFoundationGuardRail): só o item muda", () => {
    const after = parseFoundationState(upsertChecklistItemInYaml(raw, "domain", "contexts-reviewed", true, "human_checklist"));
    const expected = structuredClone(parsed!);
    expected.phases.domain!.human_checklist["contexts-reviewed"] = true;
    expect(after).toEqual(expected);
  });
});

describe("round-trip — repos.yaml", () => {
  const raw = read("repos.yaml");
  const parsed = parseReposYaml(raw);

  it("modelo + erros lidos da fixture (snapshot): id não-kebab e git sem url são descartados", () => {
    expect(parsed).toMatchSnapshot();
  });

  it("ponto fixo: o inventário re-serializado é lido igual e sem erros", () => {
    const again = parseReposYaml(quotedYaml(parsed.inventory));
    expect(again.errors).toEqual([]);
    expect(again.inventory).toEqual(parsed.inventory);
  });

  it("writers cirúrgicos do syncRepos (pinned_sha, content_sha, has_history): só os campos alvo mudam, comentário sobrevive", () => {
    let content = upsertPinnedSha(raw, "pedidos-api", "fedcba9");
    content = upsertRepoField(content, "catalogo-web", "content_sha", "sha256-sintetico");
    content = upsertRepoField(content, "catalogo-web", "has_history", false);
    expect(content).toContain("# Fixture SINTÉTICA");
    const expected = structuredClone(parsed.inventory);
    expected.repos[0]!.pinned_sha = "fedcba9";
    expected.repos[1]!.content_sha = "sha256-sintetico";
    expected.repos[1]!.has_history = false;
    expect(parseReposYaml(content).inventory).toEqual(expected);
  });

  it("writer em repo inexistente devolve o conteúdo intacto", () => {
    expect(upsertPinnedSha(raw, "nao-existe", "abc")).toBe(raw);
  });

  // Behavior pinned on 2026-11-14 — H-BUG-57: sha gravado sem aspas vira número.
  it("@known-bug: pinned_sha só com dígitos é gravado sem aspas, vira number e o parser o descarta (H-BUG-57)", () => {
    const content = upsertPinnedSha(raw, "pedidos-api", "123456789012");
    expect(content).toContain("    pinned_sha: 123456789012");
    expect(parseReposYaml(content).inventory.repos[0]!.pinned_sha).toBeUndefined();
  });
});

describe("round-trip — context-repos.yaml", () => {
  const raw = read("context-repos.yaml");
  const parsed = parseContextReposYaml(raw);

  it("modelo + erros lidos da fixture (snapshot): paths default ['**'], status default 'candidate'", () => {
    expect(parsed).toMatchSnapshot();
  });

  it("ponto fixo (o código não tem writer — agentes escrevem): o mapa re-serializado é lido igual", () => {
    const again = parseContextReposYaml(quotedYaml(parsed.map));
    expect(again.errors).toEqual([]);
    expect(again.map).toEqual(parsed.map);
  });
});

describe("round-trip — assessment/repo-graph.yaml", () => {
  const raw = read("repo-graph.yaml");
  const parsed = parseRepoGraph(raw);

  it("modelo + erros lidos da fixture (snapshot): self-loop, kind inválido e aresta sem evidence descartados; confidence default 'medium'", () => {
    expect(parsed).toMatchSnapshot();
  });

  it("ponto fixo (sem writer no código): o grafo re-serializado é lido igual", () => {
    const again = parseRepoGraph(quotedYaml(parsed.graph));
    expect(again.errors).toEqual([]);
    expect(again.graph).toEqual(parsed.graph);
  });
});

describe("round-trip — sprint-backlog.yaml (3 formatos aceitos)", () => {
  const formats = [
    ["canônico (sprints[].items[])", "sprint-backlog.canonico.yaml", "LD-1"],
    ["plano por milestone", "sprint-backlog.milestones.yaml", "MS-2"],
    ["plano de stories", "sprint-backlog.stories.yaml", "ST-2"],
  ] as const;

  it.each(formats)("modelo lido do formato %s (snapshot)", (_label, file) => {
    expect(parseSprintBacklog(read(file))).toMatchSnapshot();
  });

  it.each(formats)("writer upsertSprintItemStatus no formato %s: só o status do item alvo muda, comentário sobrevive", (_label, file, itemId) => {
    const raw = read(file);
    const { content, found } = upsertSprintItemStatus(raw, itemId, "done");
    expect(found).toBe(true);
    expect(content).toContain("# Fixture SINTÉTICA");
    const expected = structuredClone(parseSprintBacklog(raw)!);
    for (const it of [...expected.items, ...expected.sprints.flatMap((s) => s.items)]) if (it.id === itemId) it.status = "done";
    expect(parseSprintBacklog(content)).toEqual(expected);
  });

  it("writer em item inexistente: found:false e conteúdo intacto", () => {
    const raw = read("sprint-backlog.canonico.yaml");
    expect(upsertSprintItemStatus(raw, "NAO-EXISTE", "done")).toEqual({ content: raw, found: false });
  });
});

describe("round-trip — operations/*.yaml (4 artefatos de Operation)", () => {
  const cases = [
    ["devops-status.yaml", (r: string) => { const p = parseDevopsStatus(r); return { model: p.status, errors: p.errors }; }],
    ["observability-status.yaml", (r: string) => { const p = parseObservabilityStatus(r); return { model: p.status, errors: p.errors }; }],
    ["incidents.yaml", (r: string) => { const p = parseIncidentsLog(r); return { model: p.log, errors: p.errors }; }],
    ["sustain-log.yaml", (r: string) => { const p = parseSustainLog(r); return { model: p.log, errors: p.errors }; }],
  ] as const;

  it.each(cases)("modelo + erros de %s (snapshot)", (file, parse) => {
    expect(parse(read(file))).toMatchSnapshot();
  });

  it.each(cases)("ponto fixo de %s (sem writer no código)", (file, parse) => {
    const first = parse(read(file));
    const again = parse(quotedYaml(first.model));
    expect(again.errors).toEqual([]);
    expect(again.model).toEqual(first.model);
  });

  // M5 / H-BUG-34, corrigido na F3.3: um serializador YAML 1.2 padrão (a lib
  // `yaml`, a mesma dos writers do código, sem forçar aspas) escreve datas
  // ISO SEM aspas; o js-yaml dos parsers as lia como `Date` e os campos sumiam.
  it("REGRESSÃO: modelo re-serializado sem aspas (yaml.stringify padrão) mantém os carimbos de tempo (M5 / H-BUG-34)", () => {
    const first = parseDevopsStatus(read("devops-status.yaml")).status;
    expect(stringify(first)).toMatch(/^updated_at: 2025-06-01T08:00:00Z$/m);
    const again = parseDevopsStatus(stringify(first)).status;
    expect(again.updated_at).toBe(first.updated_at);
    expect(again.repos["pedidos-api"]!.last_deploy).toEqual(first.repos["pedidos-api"]!.last_deploy);
    expect(again).toEqual(first);
  });

  // M5 / H-BUG-34 nos artefatos de Operation, corrigido na F3.3.
  it("REGRESSÃO: incidente com started_at sem aspas é aceito, com o texto da data (M5 / H-BUG-34)", () => {
    const { log, errors } = parseIncidentsLog("incidents:\n  - id: INC-9\n    title: x\n    started_at: 2025-05-01T10:00:00Z\n");
    expect(errors).toEqual([]);
    expect(log.incidents).toHaveLength(1);
    expect(log.incidents[0]).toMatchObject({ id: "INC-9", title: "x", started_at: "2025-05-01T10:00:00Z" });
  });
});
