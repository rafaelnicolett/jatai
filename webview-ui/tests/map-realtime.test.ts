import { describe, it, expect } from "vitest";
import { mergeRunEvents } from "../src/apps/cockpit/map/mergeEvents";
import { createFrameThrottle, type FrameClock } from "../src/apps/cockpit/map/frameThrottle";
import { announcementsFor, countActivity, createAnnouncer, summarize, type AnnouncerTimers } from "../src/apps/cockpit/map/announcer";
import { feedLines, feedStatus } from "../src/apps/cockpit/map/feedLines";
import { LIST_BELOW_WIDTH, readLightTheme, readReducedMotion, readScreenReader, resolveMapMode, resolveMotion, resolveSceneVariant } from "../src/apps/cockpit/map/mapPrefs";
import { MISSAO_ID, colmeiaEvent, missaoInitiative } from "../src/mock/colmeiaScenarios";
import { started, world } from "./support/colmeiaWorld";

/** A parte de tempo real do mapa (F5.3), sem DOM: mesclar eventos, quando redesenhar, o que o leitor de tela ouve e o que a pessoa escolheu. */

describe("mergeRunEvents", () => {
  const a = colmeiaEvent({ event_type: "agent-started", agent_id: "@a", task_id: "epic-0/task-0.2" }, 1000);
  const b = colmeiaEvent({ event_type: "artifact-written", agent_id: "@a", artifact_path: "x.md" }, 2000);
  const c = colmeiaEvent({ event_type: "agent-done", agent_id: "@a", task_id: "epic-0/task-0.2" }, 3000);

  it("o evento que já está na janela do snapshot não conta duas vezes quando o append o repete", () => {
    expect(mergeRunEvents([a, b], [b])).toEqual([a, b]);
    expect(mergeRunEvents([a, b], [a, b])).toEqual([a, b]);
  });

  it("evento novo entra no fim, e um atrasado (horário anterior) entra no lugar certo da ordem", () => {
    expect(mergeRunEvents([a, c], [b])).toEqual([a, b, c]);
    expect(mergeRunEvents([a, b], [c])).toEqual([a, b, c]);
  });

  it("dois eventos idênticos de verdade contam duas vezes; sem eventos novos devolve a mesma janela", () => {
    const twin = { ...b };
    expect(mergeRunEvents([a, b], [twin])).toEqual([a, b]);
    expect(mergeRunEvents([a, b], [twin, { ...b }])).toHaveLength(3);
    const window = [a, b];
    expect(mergeRunEvents(window, [])).toBe(window);
    expect(mergeRunEvents(window, [b])).toBe(window);
  });
});

/** Relógio de quadros manual: o teste anda um quadro de cada vez. */
function manualClock(frameMs = 16) {
  let t = 0;
  let nextId = 1;
  const queue = new Map<number, () => void>();
  const clock: FrameClock = {
    raf: (cb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => void queue.delete(id),
    now: () => t,
  };
  return {
    clock,
    /** Anda um quadro: o relógio avança e os callbacks agendados rodam. */
    frame(): void {
      t += frameMs;
      const due = [...queue.entries()];
      queue.clear();
      for (const [, cb] of due) cb();
    },
    pending: () => queue.size,
    time: () => t,
  };
}

describe("createFrameThrottle", () => {
  it("um evento isolado é aplicado no quadro seguinte, não depois", () => {
    const m = manualClock();
    let applied = 0;
    const throttle = createFrameThrottle(m.clock, 120, () => applied++);
    throttle.request();
    expect(applied).toBe(0);
    m.frame();
    expect(applied).toBe(1);
    expect(m.time()).toBe(16);
  });

  it("uma rajada vira uma atualização por intervalo, sempre com o estado mais novo", () => {
    const m = manualClock();
    let applied = 0;
    const throttle = createFrameThrottle(m.clock, 120, () => applied++);
    throttle.request();
    m.frame(); // aplica (16 ms)
    for (let i = 0; i < 40; i++) throttle.request();
    expect(throttle.pendingCount()).toBe(40);
    let frames = 0;
    while (applied < 2 && frames < 30) {
      m.frame();
      frames++;
    }
    // A segunda aplicação só vem depois de 120 ms (8 quadros de 16 ms), e leva os 40 pedidos juntos.
    expect(applied).toBe(2);
    expect(frames).toBeGreaterThanOrEqual(7);
    expect(frames).toBeLessThanOrEqual(8);
    expect(throttle.pendingCount()).toBe(0);
    expect(m.pending()).toBe(0);
  });

  it("segurado (pausa), nada é aplicado e os pedidos esperam; ao soltar, aplica no quadro seguinte sem esperar o intervalo", () => {
    const m = manualClock();
    let applied = 0;
    const throttle = createFrameThrottle(m.clock, 120, () => applied++);
    throttle.request();
    m.frame();
    throttle.hold();
    throttle.request();
    throttle.request();
    for (let i = 0; i < 20; i++) m.frame();
    expect(applied).toBe(1);
    expect(throttle.pendingCount()).toBe(2);
    throttle.release();
    m.frame();
    expect(applied).toBe(2);
  });

  it("flush aplica já, dispose cancela o quadro agendado e nada mais é aplicado", () => {
    const m = manualClock();
    let applied = 0;
    const throttle = createFrameThrottle(m.clock, 120, () => applied++);
    throttle.request();
    throttle.flush();
    expect(applied).toBe(1);
    expect(m.pending()).toBe(0);
    throttle.request();
    throttle.dispose();
    expect(m.pending()).toBe(0);
    m.frame();
    throttle.request();
    expect(applied).toBe(1);
  });

  it("sem pedido pendente não agenda quadro nenhum: CPU ociosa quando nada acontece", () => {
    const m = manualClock();
    const throttle = createFrameThrottle(m.clock, 120, () => undefined);
    throttle.release();
    throttle.flush();
    expect(m.pending()).toBe(0);
  });
});

describe("announcementsFor", () => {
  const before = world({ events: [started("@migration-agent", "epic-0/task-0.2")] }).vm;

  it("na primeira leitura, ou ao trocar de iniciativa, não há novidade a anunciar", () => {
    expect(announcementsFor(null, before)).toEqual([]);
    const other = world({ active: "hotfix-wizard-intro-blank-screen" }).vm;
    expect(announcementsFor(before, other)).toEqual([]);
  });

  it("decisão nova: 'Nova decisão espera você: <motivo>', uma vez só", () => {
    const events = [started("@migration-agent", "epic-0/task-0.2"), colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" })];
    const after = world({ events }).vm;
    expect(announcementsFor(before, after)).toEqual(["Nova decisão espera você: titularidade do código"]);
    expect(announcementsFor(after, after)).toEqual([]);
  });

  it("aprovação pendente: avisa a tarefa que espera a pessoa", () => {
    const initiative = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status: "done", requires_approval: true } } } } });
    const after = world({ initiatives: [initiative], events: [started("@migration-agent", "epic-0/task-0.2"), colmeiaEvent({ event_type: "agent-done", agent_id: "@migration-agent", task_id: "epic-0/task-0.2", phase_id: "execution" })] }).vm;
    expect(announcementsFor(before, after)).toEqual(["Nova aprovação espera você: epic-0/task-0.2"]);
  });

  it.each([
    ["blocked", "bloqueada por T0.1", "Bloqueio na Execução: @migration-agent, bloqueada por T0.1"],
    ["failed", "suíte de testes caiu", "Falha na Execução: @migration-agent, suíte de testes caiu"],
  ] as const)("%s: avisa o agente, a ilha e o motivo", (status, reason, text) => {
    const initiative = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status, reason } } } } });
    const after = world({ initiatives: [initiative], events: [started("@migration-agent", "epic-0/task-0.2")] }).vm;
    expect(announcementsFor(before, after)).toEqual([text]);
    expect(announcementsFor(after, after)).toEqual([]);
  });

  it("abelha trabalhando, entrega e fim de tarefa não geram aviso: o que é só atividade vira resumo", () => {
    const after = world({ events: [started("@migration-agent", "epic-0/task-0.2"), started("@test-backfill-agent", "epic-0/task-0.3")] }).vm;
    expect(announcementsFor(before, after)).toEqual([]);
    void MISSAO_ID;
  });
});

describe("countActivity", () => {
  const a = colmeiaEvent({ event_type: "agent-started", agent_id: "@a", task_id: "epic-0/task-0.2" }, 1000);
  const b = colmeiaEvent({ event_type: "artifact-written", agent_id: "@a", artifact_path: "x.md" }, 2000);

  it("conta só o que o mapa mostra: tipo conhecido e iniciativa ativa; ilegível e de outra iniciativa ficam de fora", () => {
    const garbage = colmeiaEvent({ event_type: "agente.explodiu" }, 2500);
    const other = colmeiaEvent({ event_type: "agent-started", agent_id: "@z", initiative_id: "outra" }, 2600);
    expect(countActivity([a], [a, b, garbage, other], MISSAO_ID)).toBe(1);
    expect(countActivity([a], [a], MISSAO_ID)).toBe(0);
    expect(countActivity([], [a, b], MISSAO_ID)).toBe(2);
  });
});

describe("feedLines", () => {
  const done = { timestamp: "2026-11-16T12:00:00Z", eventType: "agent-done", text: "@migration-agent terminou — aguarda aprovação", agentId: "@migration-agent", taskId: "epic-0/task-0.2" };
  const NOW = Date.parse("2026-11-16T12:00:30Z");

  it("a tarefa fecha a frase; 'aguarda aprovação' só fica quando há guarda acesa para aquele fim de trabalho", () => {
    expect(feedLines([done], NOW, 4, () => false)[0]).toMatchObject({ who: "@migration-agent", rest: "terminou · epic-0/task-0.2", status: "you", when: "agora" });
    expect(feedLines([done], NOW, 4, () => true)[0]!.rest).toBe("terminou — aguarda aprovação · epic-0/task-0.2");
  });

  it("o limite corta as linhas, o evento sem agente e sem tarefa fica como veio, e o tipo dá o glifo", () => {
    const write = { timestamp: "2026-11-16T12:00:00Z", eventType: "artifact-written", text: "artefato gravado" };
    const lines = feedLines([done, write, write], NOW, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ who: null, rest: "artefato gravado", status: "working" });
    expect([["agent-started", "working"], ["decision-requested", "you"], ["gate-approved", "done"], ["decision-made", "done"], ["blocked", "blocked"], ["x", "queue"]].map(([t]) => feedStatus(t!))).toEqual(["working", "you", "done", "done", "blocked", "queue"]);
  });
});

describe("createAnnouncer", () => {
  function fakeTimers() {
    let now = 0;
    let nextId = 1;
    const scheduled = new Map<number, { at: number; cb: () => void }>();
    const timers: AnnouncerTimers = {
      now: () => now,
      setTimer: (cb, ms) => {
        const id = nextId++;
        scheduled.set(id, { at: now + ms, cb });
        return id;
      },
      clearTimer: (id) => void scheduled.delete(id),
    };
    return {
      timers,
      advance(ms: number): void {
        const target = now + ms;
        for (;;) {
          const next = [...scheduled.entries()].filter(([, s]) => s.at <= target).sort((x, y) => x[1].at - y[1].at)[0];
          if (!next) break;
          scheduled.delete(next[0]);
          now = next[1].at;
          next[1].cb();
        }
        now = target;
      },
    };
  }

  it("o primeiro aviso sai na hora; os que chegam na janela saem juntos, quando ela fecha", () => {
    const f = fakeTimers();
    const said: string[] = [];
    const announcer = createAnnouncer(f.timers, 5000, (t) => said.push(t));
    announcer.push(["Nova decisão espera você: titularidade do código"]);
    expect(said).toEqual(["Nova decisão espera você: titularidade do código"]);
    f.advance(1000);
    announcer.push(["Bloqueio na Execução: @migration-agent, esperando"]);
    announcer.push([], 3);
    f.advance(1000);
    expect(said).toHaveLength(1);
    f.advance(3000);
    expect(said).toEqual(["Nova decisão espera você: titularidade do código", "Bloqueio na Execução: @migration-agent, esperando. 3 novos eventos"]);
  });

  it("oito eventos em 2 segundos dão no máximo um aviso nesse intervalo", () => {
    const f = fakeTimers();
    const said: string[] = [];
    const announcer = createAnnouncer(f.timers, 5000, (t) => said.push(t));
    for (let i = 0; i < 8; i++) {
      announcer.push([], 1);
      f.advance(250);
    }
    expect(f.timers.now()).toBe(2000);
    expect(said.length).toBeLessThanOrEqual(1);
    f.advance(10_000);
    expect(said.join(" | ")).toBe("1 novo evento | 7 novos eventos");
  });

  it("repetidos viram um só, e clear descarta o que esperava (o mapa foi pausado)", () => {
    const f = fakeTimers();
    const said: string[] = [];
    const announcer = createAnnouncer(f.timers, 5000, (t) => said.push(t));
    announcer.push(["a"]);
    announcer.push(["b", "b"]);
    announcer.push(["b"]);
    announcer.clear();
    f.advance(6000);
    expect(said).toEqual(["a"]);
    announcer.push(["c"]);
    announcer.dispose();
    f.advance(6000);
    expect(said).toEqual(["a", "c"]);
    expect(summarize(1)).toBe("1 novo evento");
    expect(summarize(3)).toBe("3 novos eventos");
  });
});

describe("preferências e movimento", () => {
  it("a escolha lembrada vale sempre; sem escolha, lista com leitor de tela ou painel estreito, cena nos outros casos", () => {
    expect(resolveMapMode({ stored: "scene", screenReader: true, width: 400 })).toBe("scene");
    expect(resolveMapMode({ stored: "list", screenReader: false, width: 1400 })).toBe("list");
    expect(resolveMapMode({ screenReader: true, width: 1400 })).toBe("list");
    expect(resolveMapMode({ screenReader: false, width: LIST_BELOW_WIDTH - 1 })).toBe("list");
    expect(resolveMapMode({ screenReader: false, width: LIST_BELOW_WIDTH })).toBe("scene");
    expect(resolveMapMode({ screenReader: false, width: 0 })).toBe("scene");
  });

  it("a cena abre à noite (o padrão do DS v2); dia só por escolha, ou por decisão do titular de seguir o tema claro", () => {
    expect(resolveSceneVariant({})).toBe("night");
    expect(resolveSceneVariant({ theme: { light: true } })).toBe("night");
    expect(resolveSceneVariant({ stored: "day" })).toBe("day");
    expect(resolveSceneVariant({ stored: "night", followTheme: true, theme: { light: true } })).toBe("night");
    expect(resolveSceneVariant({ followTheme: true, theme: { light: true } })).toBe("day");
    expect(resolveSceneVariant({ followTheme: true, theme: { light: false } })).toBe("night");
  });

  it("movimento: reduzido vence a pausa, e a pausa (da pessoa ou da aba oculta) vence o ao vivo", () => {
    expect(resolveMotion({ reducedMotion: false, userPaused: false, hidden: false })).toBe("live");
    expect(resolveMotion({ reducedMotion: false, userPaused: true, hidden: false })).toBe("paused");
    expect(resolveMotion({ reducedMotion: false, userPaused: false, hidden: true })).toBe("paused");
    expect(resolveMotion({ reducedMotion: true, userPaused: true, hidden: true })).toBe("reduced");
  });

  it("os sinais do documento: prefers-reduced-motion, as classes do VS Code e o atributo da raiz", () => {
    const body = (...names: string[]) => ({ contains: (n: string) => names.includes(n) });
    const media = (...queries: string[]) => (q: string) => ({ matches: queries.includes(q) });
    expect(readReducedMotion({ bodyClasses: body() })).toBe(false);
    expect(readReducedMotion({ bodyClasses: body(), matchMedia: media("(prefers-reduced-motion: reduce)") })).toBe(true);
    expect(readReducedMotion({ bodyClasses: body("vscode-reduce-motion") })).toBe(true);
    expect(readReducedMotion({ bodyClasses: body(), rootMotion: "reduce" })).toBe(true);
    expect(readScreenReader({ bodyClasses: body("vscode-using-screen-reader") })).toBe(true);
    expect(readScreenReader({ bodyClasses: body("vscode-dark") })).toBe(false);
    expect(readLightTheme({ bodyClasses: body("vscode-light") })).toBe(true);
    expect(readLightTheme({ bodyClasses: body("vscode-high-contrast-light") })).toBe(true);
    expect(readLightTheme({ bodyClasses: body("vscode-dark"), matchMedia: media("(prefers-color-scheme: light)") })).toBe(false);
    expect(readLightTheme({ bodyClasses: body(), rootTheme: "light" })).toBe(true);
  });
});
