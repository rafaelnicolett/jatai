import { describe, it, expect } from "vitest";
import { buildViewContext } from "../src/apps/cockpit/view/viewTarget";
import { deriveTrack, epicProgress, shortTitle } from "../src/apps/cockpit/view/deriveTrack";
import { bridgeModel } from "../src/apps/cockpit/view/flows";
import { buildSnapshot } from "../src/mock/snapshotBuilder";
import { REPOS_YAML, foundationYaml, initiativeYaml, initiativesYaml, modernizationSnapshot } from "./support/cockpitFixtures";

const view = (snapshot: ReturnType<typeof modernizationSnapshot>, id = "mod-x") => buildViewContext(snapshot, { kind: "initiative", id });

describe("deriveTrack — modernização (4 streams)", () => {
  it("D1 e D2 aprovados e o epic-0 em andamento: a Execução é o ponto atual, com as pontes aprovadas", () => {
    const track = deriveTrack(view(modernizationSnapshot()), null);
    expect(track.kind).toBe("streams");
    expect(track.segments.map((s) => [s.label, s.status])).toEqual([
      ["Descoberta", "done"],
      ["Planejamento", "done"],
      ["Execução", "current"],
      ["Operação", "future"],
    ]);
    expect(track.segments[2]!.eyebrow).toBe("Você está aqui · Epic 0");
    expect(track.segments[0]!.eyebrow).toBe("Concluído");
    expect(track.segments[3]!.eyebrow).toBe("Depois");
    expect(track.bridges.map((b) => [b.gate, b.status])).toEqual([
      ["D1", "approved"],
      ["D2", "approved"],
      ["D3", "future"],
    ]);
    expect(track.currentSegmentId).toBe("execution");
  });

  it("as paradas são os épicos, com o progresso das tarefas fechadas e a missão no primeiro aberto", () => {
    const track = deriveTrack(view(modernizationSnapshot()), null);
    expect(track.unit).toBe("Epic");
    expect(track.stopsLabel).toBe("Épicos da Execução");
    expect(track.stops.map((s) => [s.key, s.label, s.status, s.here])).toEqual([
      ["epic-0", "Fundação", "working", true],
      ["epic-1", "Marca", "future", false],
    ]);
    expect(track.selectedStopKey).toBe("epic-0");
  });

  it("a escolha do operador vale enquanto a parada existe; uma escolha velha volta para onde a missão está", () => {
    const ctx = view(modernizationSnapshot());
    expect(deriveTrack(ctx, "epic-1").selectedStopKey).toBe("epic-1");
    expect(deriveTrack(ctx, "epic-9").selectedStopKey).toBe("epic-0");
  });

  it("D3 com todas as tarefas fechadas espera você; com uma bloqueada, aparece bloqueado com o motivo em texto", () => {
    const done = modernizationSnapshot({ epicStatus: "epic-0:\n  status: done\n  items:\n    task-1: { status: done }\n    task-2: { status: done }" });
    expect(bridgeModel("D3", view(done))).toMatchObject({ gate: "D3", status: "waiting" });

    const blocked = modernizationSnapshot({
      epicStatus: 'epic-0:\n  items:\n    task-1: { status: done }\n    task-2: { status: blocked, reason: "bloqueada por task-1" }',
    });
    const d3 = bridgeModel("D3", view(blocked));
    expect(d3.status).toBe("blocked");
    expect(d3.reason).toBe("epic-0/task-2 bloqueada: bloqueada por task-1");
  });

  it("D3 aprovado é ponte aprovada; D2 com a matriz de risco faltando espera o que falta", () => {
    const approved = modernizationSnapshot({ d3: true, epicStatus: "epic-0:\n  items:\n    task-1: { status: done }" });
    expect(bridgeModel("D3", view(approved)).status).toBe("approved");

    const partial = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ roadmapOnly: true, scope: ["api"] })]),
    });
    expect(bridgeModel("D2", view(partial))).toMatchObject({ status: "future", reason: "falta risk_matrix_gate" });
  });

  it("D1 com as fases do repositório fechadas e a decisão por tomar espera você; com fase aberta, fica para depois com o que falta", () => {
    const ready = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "pending" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"] })]),
    });
    expect(bridgeModel("D1", view(ready)).status).toBe("waiting");

    const open = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "pending", open: ["quality", "debt"] }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"] })]),
    });
    const d1 = bridgeModel("D1", view(open));
    expect(d1.status).toBe("future");
    expect(d1.reason).toBe("api: falta quality, debt");
    // E a Descoberta passa a ser o ponto atual, com os repositórios como paradas.
    const track = deriveTrack(view(open), null);
    expect(track.currentSegmentId).toBe("discovery");
    expect(track.unit).toBe("Repositório");
    // Um repositório por parada, e as fases entre repositórios (domínio, skills) fecham a lista.
    expect(track.stops.map((s) => s.key)).toEqual(["repo:api", "repo:workspace"]);
  });

  it("sem épicos no Planejamento, a trilha explica quando eles aparecem", () => {
    const snapshot = buildSnapshot({
      reposYaml: REPOS_YAML,
      foundationYaml: foundationYaml({ d1: "approved" }),
      initiativesYaml: initiativesYaml("mod-x", [initiativeYaml({ scope: ["api"], epics: [] })]),
    });
    const track = deriveTrack(view(snapshot), null);
    expect(track.currentSegmentId).toBe("planning");
    expect(track.stops).toEqual([]);
    expect(track.stopsEmpty).toBe("Os épicos aparecem quando o Planejamento terminar.");
  });
});

describe("deriveTrack — Descoberta do workspace e hotfix", () => {
  it("a Descoberta do workspace é o ponto atual, com um repositório por parada", () => {
    const snapshot = buildSnapshot({ reposYaml: REPOS_YAML, foundationYaml: foundationYaml({ d1: "pending", open: ["debt"] }) });
    const track = deriveTrack(buildViewContext(snapshot, { kind: "discovery" }), null);
    expect(track.kind).toBe("discovery");
    expect(track.segments[0]).toMatchObject({ id: "discovery", status: "current", eyebrow: "Você está aqui · Descoberta" });
    expect(track.stops.map((s) => s.key)).toEqual(["repo:api", "repo:workspace"]);
    expect(track.stops[0]).toMatchObject({ key: "repo:api", label: "api", unit: "Repositório", progress: 80, here: true });
    expect(track.stops[1]).toMatchObject({ label: "Workspace", progress: 0 });
    expect(track.bridges.map((b) => b.gate)).toEqual(["D1", "D2", "D3"]);
  });

  it("no hotfix os segmentos são as ondas e cada uma abre o quadro", () => {
    const snapshot = buildSnapshot({
      initiativesYaml: initiativesYaml("hotfix-y", [
        initiativeYaml({
          id: "hotfix-y",
          type: "hotfix",
          epics: ["wave-1: Diagnóstico", "wave-2: Correção", "wave-3: Validação"],
          epicStatus: "wave-1:\n  status: done\nwave-2:\n  status: in-progress",
        }),
      ]),
    });
    const track = deriveTrack(buildViewContext(snapshot, { kind: "initiative", id: "hotfix-y" }), null);
    expect(track.kind).toBe("waves");
    expect(track.bridges).toEqual([]);
    expect(track.segments.map((s) => [s.label, s.status])).toEqual([
      ["Diagnóstico", "done"],
      ["Correção", "current"],
      ["Validação", "future"],
    ]);
    expect(track.selectedStopKey).toBe("wave-2");
  });

  it("sem iniciativa vista, a trilha é vazia", () => {
    const snapshot = buildSnapshot({ reposYaml: REPOS_YAML });
    expect(deriveTrack(buildViewContext(snapshot, { kind: "initiative", id: "nao-existe" }), null).kind).toBe("empty");
  });
});

describe("progresso do épico (nunca inventado)", () => {
  const raw = "epic-0: Fundação (item-a, item-b, item-c) — nota";

  it("é a fração das tarefas fechadas sobre as relatadas mais as prometidas no rótulo", () => {
    const entry = { status: "in-progress", items: { "item-a": { status: "done" }, "item-b": { status: "in-progress" } } };
    expect(epicProgress(entry, raw)).toBe(33);
  });

  it("épico sem tarefas relatadas e sem promessa no rótulo não tem progresso, a menos que esteja fechado", () => {
    expect(epicProgress(undefined, "epic-0: Fundação")).toBeNull();
    expect(epicProgress({ status: "done" }, "epic-0: Fundação")).toBe(100);
  });

  it("cancelado e pulado contam como fechados", () => {
    const entry = { status: "in-progress", items: { a: { status: "cancelled" }, b: { status: "skipped" }, c: { status: "pending" }, d: { status: "done" } } };
    expect(epicProgress(entry, "epic-0: X")).toBe(75);
  });
});

describe("rótulos curtos", () => {
  it("o título da parada é o texto antes do travessão e dos parênteses", () => {
    expect(shortTitle("Fundação — provisionar o repo (CI, build)")).toBe("Fundação");
    expect(shortTitle("Marca (kit, brand.json)")).toBe("Marca");
  });
});
