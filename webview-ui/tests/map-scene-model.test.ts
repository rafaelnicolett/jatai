import { describe, it, expect } from "vitest";
import { MAX_BEES_PER_ISLAND, MAX_PROCESS_TRAIL } from "../src/apps/cockpit/map/sceneModel";
import { MAX_COMB_CELLS, hexSpiral } from "../src/apps/cockpit/map/islandArt";
import { agentStatusView, beeCondition, countsOf, islandAriaLabel, islandBlurb, islandEyebrow, islandMeta, plural } from "../src/apps/cockpit/map/copy";
import { dist, inDiamond, pt } from "../src/apps/cockpit/map/projection";
import { HOTFIX_ID, MISSAO_ID, colmeiaEvent, hotfixInitiative, missaoInitiative } from "../src/mock/colmeiaScenarios";
import { finished, started, world } from "./support/colmeiaWorld";

/**
 * O modelo da cena (F5.3): do `ColmeiaVM` ao que a vista desenha. Pura, sem
 * DOM. Toda regra de apresentação (quantas abelhas por ilha, o cacho do favo,
 * o texto de cada rótulo) está aqui e é conferida aqui.
 */

const island = (w: ReturnType<typeof world>, id: string) => w.scene.islands.find((i) => i.id === id)!;

describe("buildScene — as ilhas e as pontes", () => {
  it("quatro ilhas na ordem do fluxo, a de Execução atual e a maior; as pontes D1 e D2 aprovadas e a D3 por construir", () => {
    const w = world();
    expect(w.scene.islands.map((i) => [i.id, i.state])).toEqual([["discovery", "done"], ["planning", "done"], ["execution", "current"], ["operation", "sleeping"]]);
    expect(Math.max(...w.scene.islands.map((i) => i.placement.w))).toBe(island(w, "execution").placement.w);
    expect(w.scene.bridges.map((b) => [b.gate, b.state])).toEqual([["D1", "approved"], ["D2", "approved"], ["D3", "unbuilt"]]);
    expect(w.scene.bridges.map((b) => b.chip?.text)).toEqual(["D1 ✓", "D2 ✓", "D3"]);
    expect(w.scene.bridges.map((b) => b.guard?.posture)).toEqual(["rest", "rest", "asleep"]);
  });

  it("cada stream tem o seu ipê: roxo, rosa, amarelo e branco", () => {
    expect(world().scene.islands.map((i) => i.tree)).toEqual(["roxo", "rosa", "amarelo", "branco"]);
  });

  it("o rótulo diz o estado de cada ilha: concluída, agentes trabalhando e 'depois do D3'", () => {
    const w = world({ events: [started("@migration-agent", "epic-0/task-0.2"), started("@test-backfill-agent", "epic-0/task-0.3")] });
    expect(w.scene.islands.map((i) => i.meta)).toEqual([
      { text: "concluída", tone: "done" },
      { text: "concluída", tone: "done" },
      { text: "2 agentes trabalhando", tone: "working" },
      { text: "depois do D3", tone: "future" },
    ]);
  });

  it("o nome acessível da ilha segue o do DS v2: estado, quem trabalha e o que espera a pessoa", () => {
    const events = [
      started("@migration-agent", "epic-0/task-0.2"),
      started("@test-backfill-agent", "epic-0/task-0.3"),
      colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" }),
    ];
    const w = world({ events });
    expect(island(w, "execution").ariaLabel).toBe("Ilha Execução: Epic 0 · Fundação em andamento, 2 agentes trabalhando, uma guarda espera você");
    expect(island(w, "operation").ariaLabel).toBe("Ilha Operação: ainda não começou, acorda depois do gate D3");
    expect(island(w, "planning").ariaLabel).toBe("Ilha Planejamento: concluída, 3 agentes, gate D2 aprovado");
    expect(island(w, "discovery").ariaLabel).toMatch(/^Ilha Descoberta: concluída, \d+ agentes, gate D1 aprovado$/);
  });

  it("o hotfix tem as três ondas, ligadas por pontes sem gate: construída até a onda que já começou e tracejada depois", () => {
    const w = world({ initiatives: [hotfixInitiative()], active: HOTFIX_ID, events: [] });
    expect(w.scene.islands.map((i) => i.label)).toEqual(["Diagnóstico", "Correção", "Validação"]);
    expect(w.scene.bridges).toHaveLength(2);
    expect(w.scene.bridges.every((b) => b.gate === undefined && b.chip === null && b.guard === null)).toBe(true);
    expect(w.scene.bridges.map((b) => b.state)).toEqual(["unbuilt", "unbuilt"]);
    expect(w.scene.islands.map((i) => i.tree)).toEqual(["roxo", "rosa", "amarelo"]);
  });

  it("sem iniciativa ativa não há ilha nem ponte, e a cena leva o que falta e como resolver", () => {
    const w = world({ active: null, foundation: null, reposInventory: null });
    expect(w.scene.islands).toEqual([]);
    expect(w.scene.bridges).toEqual([]);
    expect(w.scene.empty?.reason).toMatch(/não há iniciativa ativa/i);
    expect(w.scene.empty?.hint).toContain("@jatai");
  });

  it("sem iniciativa, mas com o Foundation em andamento, a cena mostra a descoberta e o D1", () => {
    const w = world({
      active: null,
      foundation: { phases: {}, repos: { jatai: { phases: { "tech-stack": { status: "in-progress", human_checklist: {} } }, gate_d1: { status: "pending" } } } },
    });
    expect(w.scene.empty).toBeNull();
    expect(w.scene.islands.map((i) => i.label)).toEqual(["Descoberta", "Planejamento"]);
    expect(w.scene.bridges[0]).toMatchObject({ gate: "D1", state: "unbuilt" });
    expect(w.scene.islands[0]!.progress).toMatchObject({ total: expect.any(Number) });
  });

  it("é puro: o mesmo mapa dá exatamente a mesma cena", () => {
    const events = [started("@migration-agent", "epic-0/task-0.2")];
    expect(JSON.stringify(world({ events }).scene)).toBe(JSON.stringify(world({ events }).scene));
  });
});

describe("buildScene — as abelhas", () => {
  it("o agente que começa vira uma abelha que voa na ilha do stream; ao terminar, a abelha sai da cena", () => {
    const events = [started("@migration-agent", "epic-0/task-0.2", "semeando repos/jatai")];
    const w = world({ events });
    expect(w.scene.bees).toEqual([expect.objectContaining({ agentId: "@migration-agent", islandId: "execution", condition: "working", tag: null })]);
    expect(w.scene.bees[0]!.route).not.toBeNull();
    expect(w.scene.flying).toBe(1);
    const after = world({ events: [...events, finished("@migration-agent", "epic-0/task-0.2")] });
    expect(after.scene.bees.filter((b) => b.agentId === "@migration-agent")).toEqual([]);
    expect(after.scene.flying).toBe(0);
  });

  it("a persona dá a cor do colar, e a ilha desenha a trilha de processos no chão", () => {
    const events = [
      started("@migration-agent", "epic-0/task-0.2"),
      colmeiaEvent({ event_type: "agent-started", agent_id: "@arch-discoverer", phase_id: "arch", repo_id: "jatai" }),
    ];
    const w = world({ events });
    expect(w.scene.bees.find((b) => b.agentId === "@migration-agent")?.accent).toBe("honey");
    expect(w.scene.bees.find((b) => b.agentId === "@arch-discoverer")?.accent).toBe("lavender");
    const discovery = island(w, "discovery");
    expect(discovery.processTrail?.nodes.length).toBeGreaterThan(0);
    expect(discovery.processTrail!.nodes.length).toBeLessThanOrEqual(MAX_PROCESS_TRAIL);
    expect(discovery.processTrail!.nodes.every((n) => n.at.y > discovery.placement.c.y)).toBe(true);
    expect(island(w, "execution").processTrail?.nodes.some((n) => n.status === "working")).toBe(true);
  });

  it("sem ninguém trabalhando nada voa: zero abelhas e zero voltas", () => {
    const w = world({ initiatives: [missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" } } } } })] });
    expect(w.scene.bees).toEqual([]);
    expect(w.scene.flying).toBe(0);
  });

  it.each([
    ["blocked", "bloqueada por T0.1", "blocked", "Bloqueado: bloqueada por T0.1"],
    ["failed", "suíte de testes caiu", "failed", "Falhou: suíte de testes caiu"],
  ] as const)("a abelha %s fica parada, no ponto de pouso, com o motivo em texto", (status, reason, condition, text) => {
    const initiative = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status, reason } } } } });
    const w = world({ initiatives: [initiative], events: [started("@migration-agent", "epic-0/task-0.2")] });
    const bee = w.scene.bees.find((b) => b.agentId === "@migration-agent")!;
    expect(bee).toMatchObject({ condition, route: null, tag: { glyph: condition, text } });
    expect(inDiamond(bee.perch, island(w, "execution").placement.c, island(w, "execution").placement.w)).toBe(true);
    expect(island(w, "execution").chips.map((c) => [c.glyph, c.text])).toContainEqual([condition, condition === "blocked" ? "1 bloqueada" : "1 falhou"]);
    expect(w.scene.flying).toBe(0);
  });

  it("mais de seis abelhas numa ilha viram seis e um chip '+N'; as paradas têm prioridade para aparecer", () => {
    const agents = Array.from({ length: 9 }, (_, i) => `@agente-${i}`);
    const blockedTask = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-9": { status: "blocked", reason: "esperando" } } } } });
    // A abelha parada é a última a chegar, e mesmo assim aparece: as paradas têm prioridade.
    const events = [...agents.map((a, i) => started(a, `epic-0/task-${i}`)), started("@agente-parado", "epic-0/task-9")];
    const w = world({ initiatives: [blockedTask], events });
    expect(MAX_BEES_PER_ISLAND).toBe(6);
    expect(w.scene.bees).toHaveLength(6);
    expect(w.scene.overflow).toEqual([expect.objectContaining({ islandId: "execution", count: 4 })]);
    expect(w.scene.bees[0]).toMatchObject({ agentId: "@agente-parado", condition: "blocked" });
    expect(world({ initiatives: [blockedTask], events }, { maxBeesPerIsland: 30 }).scene.bees).toHaveLength(10);
  });

  it("30 agentes em tela: a cena de 30 abelhas se monta, com um tamanho e uma volta para cada, e nenhuma além de 32 px", () => {
    const agents = Array.from({ length: 30 }, (_, i) => `@agente-${i}`);
    const w = world({ events: agents.map((a, i) => started(a, `epic-0/task-${i}`)) }, { maxBeesPerIsland: 30 });
    expect(w.scene.bees).toHaveLength(30);
    expect(w.scene.flying).toBe(30);
    expect(Math.max(...w.scene.bees.map((b) => b.size))).toBeLessThanOrEqual(32);
    expect(new Set(w.scene.bees.map((b) => b.key)).size).toBe(30);
  });

  it("a chave da abelha não muda entre uma derivação e a seguinte: a vista não recria a abelha a cada evento", () => {
    const first = world({ events: [started("@migration-agent", "epic-0/task-0.2")] });
    const second = world({ events: [started("@migration-agent", "epic-0/task-0.2"), colmeiaEvent({ event_type: "agent-progress", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", message: "avançando" })] });
    expect(second.scene.bees.map((b) => b.key)).toEqual(first.scene.bees.map((b) => b.key));
  });
});

describe("buildScene — guardas e favos", () => {
  it("a decisão pedida acende a guarda da ilha com o motivo, e o rótulo ganha o chip em texto", () => {
    const w = world({ events: [colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" })] });
    expect(island(w, "execution").lit).toMatchObject({ count: 1, reasons: ["titularidade do código"] });
    expect(island(w, "execution").chips).toEqual([{ tone: "you", glyph: "you", text: "1 espera você" }]);
    expect(island(w, "planning").lit).toBeNull();
  });

  it("os favos: as entregas primeiro, cheias, e os vazios das entregas por vir logo depois, até doze células", () => {
    const report = ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md";
    const w = world({ events: [colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: report })] });
    const exe = island(w, "execution");
    expect(exe.combs.filter((c) => c.filled).map((c) => c.path)).toEqual([report]);
    // Quatro tarefas por fazer no Epic 0: quatro favos vazios.
    expect(exe.combs.filter((c) => !c.filled)).toHaveLength(4);
    expect(exe.combs[0]!.filled).toBe(true);
    expect(exe.combs.length).toBeLessThanOrEqual(MAX_COMB_CELLS);
    // O Planejamento concluído mostra as três entregas do estado e nenhum favo vazio.
    expect(island(w, "planning").combs.every((c) => c.filled)).toBe(true);
    expect(island(w, "planning").combs.map((c) => c.path?.split("/").pop())).toEqual(["roadmap.md", "risk-matrix.md", "0012-repositorio-isolado.md"]);
  });

  it("entregas além das células do favo viram o '+N'", () => {
    const many = Array.from({ length: 15 }, (_, i) => colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: `.github/artifacts/execution/relatorio-${i}.md` }));
    const exe = island(world({ events: many }), "execution");
    expect(exe.combs).toHaveLength(MAX_COMB_CELLS);
    expect(exe.combOverflow).toBe(3);
  });

  it("o cacho de favos é hexagonal: o centro primeiro, seis vizinhos à mesma distância, sem células sobrepostas", () => {
    const cells = hexSpiral(MAX_COMB_CELLS, 15, pt(100, 100));
    expect(cells[0]).toEqual(pt(100, 100));
    for (const c of cells.slice(1, 7)) expect(dist(cells[0]!, c)).toBeCloseTo(15, 6);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(dist(cells[i]!, cells[j]!)).toBeGreaterThanOrEqual(14.99);
  });

  it("as células do favo ficam sobre a grama da ilha", () => {
    const w = world({ events: Array.from({ length: 12 }, (_, i) => colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: `.github/artifacts/execution/r-${i}.md` })) });
    for (const i of w.scene.islands) for (const c of i.art.combSlots) expect(inDiamond(c, i.placement.c, i.placement.w * 1.05), `${i.id} (${c.x}, ${c.y})`).toBe(true);
  });
});

describe("copy — os textos do mapa", () => {
  it("plural e o texto de cada estado de agente na ilha (ADR-0022: falha e bloqueio com o motivo)", () => {
    expect(plural(1, "agente", "agentes")).toBe("1 agente");
    expect(plural(2, "agente", "agentes")).toBe("2 agentes");
    expect(agentStatusView("working")).toEqual({ status: "working", text: "trabalhando agora" });
    expect(agentStatusView("queued")).toEqual({ status: "queue", text: "na fila" });
    expect(agentStatusView("sleeping")).toEqual({ status: "future", text: "adormecido" });
    expect(agentStatusView("done")).toEqual({ status: "done", text: "concluído" });
    expect(agentStatusView("blocked", "bloqueada por T0.2")).toEqual({ status: "blocked", text: "Bloqueado: bloqueada por T0.2" });
    expect(agentStatusView("blocked", "falhou: suíte caiu")).toEqual({ status: "failed", text: "Falhou: suíte caiu" });
    expect(beeCondition("working")).toBe("working");
    expect(beeCondition("blocked", "falhou: x")).toBe("failed");
    expect(beeCondition("blocked", "esperando")).toBe("blocked");
  });

  it("o eyebrow do painel e a descrição da ilha, para os 4 streams e as ondas do hotfix", () => {
    const w = world();
    const eyebrow = (id: string) => islandEyebrow(w.details.find((d) => d.islandId === id)!, w.vm.bridges.find((b) => b.from === id));
    expect(eyebrow("discovery")).toEqual({ status: "done", text: "Concluída · D1 aprovado" });
    expect(eyebrow("execution")).toEqual({ status: "working", text: "Em andamento · Epic 0 · Fundação" });
    expect(eyebrow("operation")).toEqual({ status: "future", text: "Ainda não começou" });
    expect(islandBlurb({ id: "execution", label: "Execução" })).toMatch(/colônia constrói/);
    expect(islandBlurb({ id: "wave-1", label: "Diagnóstico" })).toMatch(/causa raiz/);
    expect(islandBlurb({ id: "wave-9", label: "Lançamento" })).toBe("Etapa Lançamento da iniciativa.");
  });

  it("islandMeta e o nome acessível cobrem a ilha atual sem ninguém trabalhando, e várias guardas", () => {
    const w = world();
    const exe = w.details.find((d) => d.islandId === "execution")!;
    expect(islandMeta("current", countsOf(exe))).toEqual({ text: "em andamento", tone: "queue" });
    expect(islandAriaLabel(exe, countsOf(exe))).toBe("Ilha Execução: Epic 0 · Fundação em andamento, ninguém trabalhando agora");
    const guarded = { ...exe, guards: [{ islandId: "execution", kind: "decision" as const, reason: "a" }, { islandId: "execution", kind: "approval" as const, reason: "b" }] };
    expect(islandAriaLabel(guarded, countsOf(guarded))).toMatch(/2 guardas esperam você$/);
    void MISSAO_ID;
  });
});
