import { describe, it, expect } from "vitest";
import {
  parseRunEvents,
  deriveActivity,
  describeEvent,
  isKnownEventType,
  recentEventsForRepo,
  liveEventForItem,
  recentEventsForStep,
  cursorFromEvents,
  eventsSinceCursor,
  RUNS_REL,
  RUNS_GLOB,
  type RunEvent,
} from "../src/data/run-events-contract";

const ev = (o: Partial<RunEvent> & { event_type: string; timestamp: string }): string =>
  JSON.stringify({ run_id: "r1", ...o });

describe("paths do canal de eventos", () => {
  it("mora em .github/artifacts/runs (host-neutral, como todo artefato)", () => {
    expect(RUNS_REL).toBe(".github/artifacts/runs");
    expect(RUNS_GLOB).toBe(".github/artifacts/runs/**/*.jsonl");
  });
});

describe("parseRunEvents — o arquivo é lido ENQUANTO é escrito", () => {
  it("lê eventos válidos", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", agent_id: "@tech-mapper", repo_id: "billing-api", phase_id: "tech-stack" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", agent_id: "@tech-mapper", repo_id: "billing-api", phase_id: "tech-stack" }),
      ].join("\n")
    );
    expect(events).toHaveLength(2);
    expect(events[0]!.agent_id).toBe("@tech-mapper");
    expect(events[0]!.repo_id).toBe("billing-api");
  });

  it("linha parcial (escrita a meio) não derruba o resto — o agente escreve enquanto lemos", () => {
    const raw = [
      ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z" }),
      '{"event_type":"agent-pro',  // ← truncada no meio da escrita
      ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z" }),
    ].join("\n");
    expect(parseRunEvents(raw)).toHaveLength(2);
  });

  it("ignora linhas em branco e lixo", () => {
    expect(parseRunEvents("\n\n  \nnão é json\n")).toHaveLength(0);
  });

  it("descarta evento sem event_type ou timestamp", () => {
    expect(parseRunEvents('{"run_id":"r1"}\n{"event_type":"x"}')).toHaveLength(0);
  });

  it("arquivo vazio não quebra", () => {
    expect(parseRunEvents("")).toEqual([]);
  });
});

describe("deriveActivity — o que está acontecendo AGORA", () => {
  it("agent-started sem done = rodando", () => {
    const events = parseRunEvents(
      ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", agent_id: "@tech-mapper", repo_id: "billing-api", phase_id: "tech-stack" })
    );
    expect(deriveActivity(events).running?.agent_id).toBe("@tech-mapper");
  });

  it("agent-done encerra o rodando e vira 'aguarda aprovação' (o gate HITL)", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", agent_id: "@tech-mapper", repo_id: "billing-api", phase_id: "tech-stack" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", agent_id: "@tech-mapper", repo_id: "billing-api", phase_id: "tech-stack" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.running).toBeNull();
    expect(a.awaiting).toHaveLength(1);
    expect(a.awaiting[0]!.phase_id).toBe("tech-stack");
  });

  it("gate-approved limpa o 'aguardando'", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "gate-approved", timestamp: "2026-01-01T10:09:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.awaiting).toHaveLength(0);
    expect(a.running).toBeNull();
  });

  it("a MESMA fase em repos diferentes não se confunde", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:06:00Z", phase_id: "tech-stack", repo_id: "claims-svc" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.running?.repo_id).toBe("claims-svc");   // rodando no segundo repo
    expect(a.awaiting[0]!.repo_id).toBe("billing-api"); // aguardando no primeiro
  });

  it("agent-progress atualiza a mensagem sem encerrar o rodando", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "arch", repo_id: "erp", agent_id: "@arch-discoverer" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:02:00Z", phase_id: "arch", repo_id: "erp", message: "lendo 30 módulos…" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.running?.message).toBe("lendo 30 módulos…");
    expect(a.running?.agent_id).toBe("@arch-discoverer");
  });

  it("blocked encerra o rodando (não fica girando para sempre)", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "arch", repo_id: "erp" }),
        ev({ event_type: "blocked", timestamp: "2026-01-01T10:03:00Z", phase_id: "arch", repo_id: "erp", message: "sem acesso ao remote" }),
      ].join("\n")
    );
    expect(deriveActivity(events).running).toBeNull();
  });

  it("várias fases aguardando ao mesmo tempo", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:05:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:06:00Z", phase_id: "arch", repo_id: "billing-api" }),
      ].join("\n")
    );
    expect(deriveActivity(events).awaiting).toHaveLength(2);
  });

  it("sem eventos: nada rodando, nada aguardando", () => {
    expect(deriveActivity([])).toEqual({ running: null, runningByKey: [], awaiting: [], blocked: [], recent: [] });
  });

  it("recent vem do mais novo para o mais antigo", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "a" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T11:00:00Z", phase_id: "b" }),
      ].join("\n")
    );
    expect(deriveActivity(events).recent[0]!.phase_id).toBe("b");
  });
});

describe("describeEvent — o que a timeline mostra", () => {
  it.each([
    ["agent-started", /começou/],
    ["agent-done", /aguarda aprovação/],
    ["gate-approved", /Gate aprovado/],
    ["blocked", /bloqueado/],
  ])("%s → %s", (type, re) => {
    expect(describeEvent({ run_id: "r", event_type: type, timestamp: "t", agent_id: "@x", repo_id: "repo1" })).toMatch(re);
  });

  it("mostra o repositório quando há", () => {
    expect(describeEvent({ run_id: "r", event_type: "agent-started", timestamp: "t", agent_id: "@tech-mapper", repo_id: "billing-api" }))
      .toContain("billing-api");
  });

  it("fase cross-repo não inventa repositório", () => {
    expect(describeEvent({ run_id: "r", event_type: "agent-started", timestamp: "t", agent_id: "@domain-extractor" }))
      .toBe("@domain-extractor começou");
  });

  it("evento desconhecido não quebra a tela", () => {
    expect(describeEvent({ run_id: "r", event_type: "coisa-nova", timestamp: "t" })).toContain("coisa-nova");
  });

  it("item-approved (Onda 2) usa a message do evento, que já vem pronta pra tela", () => {
    expect(describeEvent({ run_id: "r", event_type: "item-approved", timestamp: "t", message: "item-1.2 aprovado" }))
      .toBe("item-1.2 aprovado");
  });

  it("item-approved sem message cai num texto genérico em vez de sumir", () => {
    expect(describeEvent({ run_id: "r", event_type: "item-approved", timestamp: "t", repo_id: "legacy-erp" }))
      .toBe("Item aprovado · legacy-erp");
  });
});

describe("isKnownEventType", () => {
  it.each(["agent-started", "agent-done", "agent-progress", "gate-approved", "artifact-written", "blocked", "item-approved"])(
    "%s é conhecido", (t) => expect(isKnownEventType(t)).toBe(true)
  );
  it("tipo inventado não é conhecido", () => expect(isKnownEventType("xpto")).toBe(false));
});

describe("deriveActivity — runningByKey (múltiplos repos rodando em paralelo)", () => {
  it("dois repos rodando ao mesmo tempo aparecem os DOIS em runningByKey", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "tech-stack", repo_id: "billing-api" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:01:00Z", phase_id: "tech-stack", repo_id: "claims-svc" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.runningByKey).toHaveLength(2);
    expect(a.runningByKey.map((e) => e.repo_id).sort()).toEqual(["billing-api", "claims-svc"]);
    // `running` continua devolvendo só o mais recente, por compatibilidade.
    expect(a.running?.repo_id).toBe("claims-svc");
  });

  it("sem nada rodando, runningByKey é vazio", () => {
    expect(deriveActivity([]).runningByKey).toEqual([]);
  });
});

describe("deriveActivity — blocked (bloqueio de primeira classe)", () => {
  it("evento blocked aparece em blocked[], não só desaparece do running", () => {
    const events = parseRunEvents(
      ev({ event_type: "blocked", timestamp: "2026-01-01T10:03:00Z", phase_id: "arch", repo_id: "erp", message: "sem acesso ao remote" })
    );
    const a = deriveActivity(events);
    expect(a.running).toBeNull();
    expect(a.blocked).toHaveLength(1);
    expect(a.blocked[0]!.message).toBe("sem acesso ao remote");
  });

  it("uma retentativa (agent-started) limpa o bloqueio anterior", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "blocked", timestamp: "2026-01-01T10:03:00Z", phase_id: "arch", repo_id: "erp" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:10:00Z", phase_id: "arch", repo_id: "erp" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(a.blocked).toHaveLength(0);
    expect(a.running?.repo_id).toBe("erp");
  });

  it("gate-approved também limpa o bloqueio (fase seguiu apesar do bloqueio anterior)", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "blocked", timestamp: "2026-01-01T10:03:00Z", phase_id: "arch", repo_id: "erp" }),
        ev({ event_type: "gate-approved", timestamp: "2026-01-01T10:20:00Z", phase_id: "arch", repo_id: "erp" }),
      ].join("\n")
    );
    expect(deriveActivity(events).blocked).toHaveLength(0);
  });
});

describe("recentEventsForRepo — um repo silencioso não perde espaço para um barulhento", () => {
  it("filtra só o repo pedido, mais recente primeiro", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", repo_id: "noisy" }),
        ev({ event_type: "agent-done", timestamp: "2026-01-01T10:01:00Z", repo_id: "noisy" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:02:00Z", repo_id: "quiet" }),
      ].join("\n")
    );
    const quiet = recentEventsForRepo(events, "quiet");
    expect(quiet).toHaveLength(1);
    expect(quiet[0]!.repo_id).toBe("quiet");
  });

  it("respeita o limit e devolve mais recente primeiro", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", repo_id: "r", message: "1" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:01:00Z", repo_id: "r", message: "2" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:02:00Z", repo_id: "r", message: "3" }),
      ].join("\n")
    );
    const recent = recentEventsForRepo(events, "r", 2);
    expect(recent.map((e) => e.message)).toEqual(["3", "2"]);
  });
});

describe("liveEventForItem — o evento ao vivo de UM passo, não do repo inteiro", () => {
  it("acha o evento do item pelo par repo+fase (key com barra)", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "quality", repo_id: "billing-api" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:01:00Z", phase_id: "debt", repo_id: "billing-api" }),
      ].join("\n")
    );
    const a = deriveActivity(events);
    expect(liveEventForItem(a, { key: "billing-api/quality", repoId: "billing-api" })?.phase_id).toBe("quality");
    expect(liveEventForItem(a, { key: "billing-api/debt", repoId: "billing-api" })?.phase_id).toBe("debt");
  });

  it("cross-repo (key sem barra) casa direto com a fase, sem repoId", () => {
    const events = parseRunEvents(
      ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "domain" })
    );
    const a = deriveActivity(events);
    expect(liveEventForItem(a, { key: "domain" })?.phase_id).toBe("domain");
  });

  it("sem correspondência devolve undefined, não quebra", () => {
    const a = deriveActivity([]);
    expect(liveEventForItem(a, { key: "billing-api/quality", repoId: "billing-api" })).toBeUndefined();
  });

  it("activity nula devolve undefined", () => {
    expect(liveEventForItem(null, { key: "x" })).toBeUndefined();
  });
});

describe("recentEventsForStep — histórico de UM passo, não do repo inteiro nem só a última mensagem", () => {
  it("filtra por repo+fase e devolve mais recente primeiro", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "debt", repo_id: "billing-api", message: "começou" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:01:00Z", phase_id: "debt", repo_id: "billing-api", message: "18 pacotes atrasados" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:30Z", phase_id: "quality", repo_id: "billing-api", message: "outra fase" }),
      ].join("\n")
    );
    const lines = recentEventsForStep(events, "billing-api", "debt");
    expect(lines.map((e) => e.message)).toEqual(["18 pacotes atrasados", "começou"]);
  });

  it("respeita o limit", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "debt", repo_id: "r", message: "1" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:01:00Z", phase_id: "debt", repo_id: "r", message: "2" }),
        ev({ event_type: "agent-progress", timestamp: "2026-01-01T10:02:00Z", phase_id: "debt", repo_id: "r", message: "3" }),
      ].join("\n")
    );
    expect(recentEventsForStep(events, "r", "debt", 2).map((e) => e.message)).toEqual(["3", "2"]);
  });

  it("sem correspondência devolve lista vazia", () => {
    expect(recentEventsForStep([], "r", "debt")).toEqual([]);
  });

  it("fase cross-repo (repoId undefined) não confunde com fase de repo", () => {
    const events = parseRunEvents(
      [
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "domain", message: "cross-repo" }),
        ev({ event_type: "agent-started", timestamp: "2026-01-01T10:01:00Z", phase_id: "domain", repo_id: "billing-api", message: "do repo" }),
      ].join("\n")
    );
    expect(recentEventsForStep(events, undefined, "domain").map((e) => e.message)).toEqual(["cross-repo"]);
  });
});

describe("cursor de run events — best-effort, nunca adivinha", () => {
  const events = parseRunEvents(
    [
      ev({ event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", phase_id: "a", repo_id: "r1" }),
      ev({ event_type: "agent-done", timestamp: "2026-01-01T10:01:00Z", phase_id: "a", repo_id: "r1" }),
      ev({ event_type: "gate-approved", timestamp: "2026-01-01T10:02:00Z", phase_id: "a", repo_id: "r1" }),
    ].join("\n")
  );

  it("cursorFromEvents pega a identidade do último evento e, desde o M4, a de cada evento entregue", () => {
    const cursor = cursorFromEvents(events);
    expect(cursor).toEqual({
      timestamp: "2026-01-01T10:02:00Z",
      event_type: "gate-approved",
      phase_id: "a",
      repo_id: "r1",
      delivered: events.map((e) => JSON.stringify(e)),
    });
  });

  it("REGRESSÃO: evento atrasado (horário anterior ao último entregue) é novo; o já entregue não volta (M4)", () => {
    const cursor = cursorFromEvents(events);
    const late = parseRunEvents(ev({ event_type: "blocked", timestamp: "2026-01-01T10:00:30Z", phase_id: "b" }))[0]!;
    const window = [...events.slice(0, 1), late, ...events.slice(1)];
    expect(eventsSinceCursor(window, cursor)).toEqual([late]);
    expect(eventsSinceCursor(window, cursorFromEvents(window))).toEqual([]);
  });

  it("dois eventos idênticos contam duas vezes: o segundo, quando chega, é novo", () => {
    const one = events.slice(0, 1);
    const twice = [...one, ...one];
    expect(eventsSinceCursor(twice, cursorFromEvents(one))).toEqual(one);
  });

  it("com delivered, evento que saiu da janela não força resync: só o que não foi entregue volta", () => {
    const cursor = cursorFromEvents(events);
    const newer = parseRunEvents(ev({ event_type: "agent-started", timestamp: "2026-01-01T10:03:00Z", phase_id: "c" }))[0]!;
    expect(eventsSinceCursor([...events.slice(1), newer], cursor)).toEqual([newer]);
  });

  it("lista vazia não tem cursor", () => {
    expect(cursorFromEvents([])).toBeNull();
  });

  it("eventsSinceCursor devolve só o que veio depois", () => {
    const cursor = cursorFromEvents(events.slice(0, 1)); // cursor = primeiro evento
    expect(eventsSinceCursor(events, cursor)).toHaveLength(2);
  });

  it("sem cursor (primeira conexão), devolve tudo", () => {
    expect(eventsSinceCursor(events, null)).toHaveLength(3);
  });

  it("cursor não encontrado (saiu da janela de 200) resincroniza tudo, nunca adivinha uma posição", () => {
    const staleCursor = { timestamp: "2025-01-01T00:00:00Z", event_type: "agent-started" };
    expect(eventsSinceCursor(events, staleCursor)).toEqual(events);
  });
});
