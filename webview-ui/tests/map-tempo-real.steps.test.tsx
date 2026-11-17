import "./support/recordingVsCodeApi";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarioTitles } from "../../tests/features/gherkin";
import type { FrameClock } from "../src/apps/cockpit/map/frameThrottle";
import { missaoInitiative, stressEvents } from "../src/mock/colmeiaScenarios";
import { FLAP_LIMIT } from "../src/apps/cockpit/map/sceneModel";
import { click, cleanup, source, rulesMatching } from "./support/component";
import { announcement, beeOf, bees, buttonNamed, deliver as deliverRaw, installBrowserStubs, mountMap, nextFrame, panelOf, textOf, untilDom, type BrowserStubs } from "./support/mapDom";
import { resetVsCodeApi, sent } from "./support/recordingVsCodeApi";
import { finished, started } from "./support/colmeiaWorld";
import { colmeiaEvent } from "../src/mock/colmeiaScenarios";

/**
 * Step definitions de `acompanhar-agentes-em-tempo-real.feature` (F5.3). Cada
 * cenário do .feature tem um teste com o mesmo título; cenário sem teste
 * reprova. O atraso entre o evento e o mapa é medido com o DOM (MutationObserver)
 * e o `requestAnimationFrame` do jsdom, sem `sleep` cego.
 */
const FEATURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/features/acompanhar-agentes-em-tempo-real.feature");

let stubs: BrowserStubs;
beforeEach(() => {
  resetVsCodeApi();
  document.body.className = "";
  stubs = installBrowserStubs();
  stubs.resize(1440, 900);
});
afterEach(() => {
  cleanup();
  stubs.restore();
  vi.useRealTimers();
});

/** A Missão com todas as tarefas por fazer: ninguém trabalha até chegar um evento. */
const IDLE = missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.1": { status: "pending" }, "task-0.2": { status: "pending" }, "task-0.3": { status: "pending" }, "task-0.4": { status: "pending" } } } } });

/** O host entregando o estado: por padrão a Missão sem ninguém trabalhando. */
function deliver(options: Parameters<typeof deliverRaw>[0] = {}, fresh: Parameters<typeof deliverRaw>[1] = []): void {
  deliverRaw({ initiatives: [IDLE], ...options }, fresh);
}

const feedText = (root: ParentNode): string => textOf(root.querySelector("[data-feed]"));
const SEED = ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md";

/** Entrega o evento como o host faz (snapshot com a janela e, logo depois, o append) e mede até o mapa refletir. */
async function reflectedIn(events: Parameters<typeof deliver>[1], options: Parameters<typeof deliver>[0], condition: () => boolean): Promise<number> {
  const t0 = performance.now();
  deliver(options, events);
  await untilDom(condition, { within: 5000 });
  return performance.now() - t0;
}

/** Um relógio de quadros manual (como no teste de tempo real): o teste anda os quadros um a um. */
function manualClock(frameMs = 16): { clock: FrameClock; frame: () => void } {
  let t = 0;
  let nextId = 1;
  const queue = new Map<number, () => void>();
  return {
    clock: { raf: (cb) => (queue.set(nextId, cb), nextId++), caf: (id) => void queue.delete(id), now: () => t },
    frame() {
      t += frameMs;
      const due = [...queue.values()];
      queue.clear();
      act(() => due.forEach((cb) => cb()));
    },
  };
}

const withTask = (status: "blocked" | "failed", reason: string) =>
  [missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status, reason } } } } })] as const;

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  "Um agente que começa uma tarefa aparece como abelha na ilha do seu stream": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    expect(bees(root())).toEqual([]);
    const event = started("@migration-agent", "epic-0/task-0.2", "semeando repos/jatai");
    const ms = await reflectedIn([event], { events: [event] }, () => beeOf(root(), "@migration-agent", "execution") !== null);
    // Do evento à tela, em até 1 segundo (aqui só a parte do webview, com o frameThrottle e o React).
    expect(ms).toBeLessThan(1000);
    expect(feedText(root())).toContain("@migration-agent começou · epic-0/task-0.2");
    // E voa: a abelha tem a sua volta.
    expect(stubs.animations.some((a) => a.element === beeOf(root(), "@migration-agent") && a.state === "running")).toBe(true);
  },

  "Um agente que termina uma tarefa pousa": async () => {
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver({ events: [begin] });
    const { root } = mountMap();
    expect(beeOf(root(), "@migration-agent")?.getAttribute("data-flying")).toBe("true");
    const end = finished("@migration-agent", "epic-0/task-0.2");
    deliver({ events: [begin, end] }, [end]);
    await untilDom(() => beeOf(root(), "@migration-agent")?.getAttribute("data-landing") === "true");
    // Pousou: já não aparece como trabalhando (nem a cena nem o chip), e a atividade registra o fim.
    expect(beeOf(root(), "@migration-agent")?.getAttribute("data-flying")).toBe("false");
    expect(beeOf(root(), "@migration-agent")?.querySelector("svg")?.getAttribute("data-posture")).toBe("landed");
    expect(textOf(root().querySelector("[data-live]"))).toContain("ninguém trabalhando agora");
    // A atividade registra o fim da tarefa; sem guarda acesa, "aguarda aprovação" não é dito.
    expect(feedText(root())).toContain("@migration-agent terminou · epic-0/task-0.2");
    expect(feedText(root())).not.toContain("aguarda aprovação");
  },

  "Uma entrega concluída enche um pote": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const write = colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: SEED });
    await reflectedIn([write], { events: [write] }, () => root().querySelector(`g[data-island="execution"] [data-pot="${SEED}"]`) !== null);
    expect(root().querySelector(`g[data-island="execution"] [data-pot="${SEED}"]`)?.getAttribute("data-filled")).toBe("true");
    // O pote leva à evidência: o painel da ilha tem o link, que abre o arquivo.
    click(root().querySelector('button[data-island="execution"]'));
    click(panelOf(root())!.querySelector(`button[data-pot="${SEED}"]`));
    expect(sent).toContainEqual({ type: "openFile", relPath: SEED });
  },

  "A guarda acende quando um agente aguarda aprovação": async () => {
    // A tarefa pede aprovação humana: em andamento não acende nada; ao terminar, a guarda acende.
    const item = (status: "in-progress" | "done") => missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { "task-0.2": { status, requires_approval: true } } } } });
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver({ initiatives: [item("in-progress")], events: [begin] });
    const { root } = mountMap();
    expect(root().querySelector("[data-guard-lit]")).toBeNull();
    const end = finished("@migration-agent", "epic-0/task-0.2");
    const events = [begin, end];
    await reflectedIn([end], { initiatives: [item("done")], events }, () => root().querySelector("[data-guard-lit='execution']") !== null);
    expect(textOf(root().querySelector("[data-label='execution']"))).toContain("1 espera você");
    // O mapa avisa o operador que a tarefa espera por ele.
    await untilDom(() => announcement(root()) !== "");
    expect(announcement(root())).toContain("Nova aprovação espera você: epic-0/task-0.2");
  },

  "A guarda acende quando uma decisão humana é pedida": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const ask = colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" });
    await reflectedIn([ask], { events: [ask] }, () => root().querySelector("[data-guard-lit='execution']") !== null);
    expect(textOf(root().querySelector("[data-label='execution']"))).toContain("1 espera você");
    expect(feedText(root())).toContain("Decisão pedida — titularidade do código");
  },

  "O mapa acompanha a atividade nos dois harnesses [Claude Code · 1 segundo]": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const write = colmeiaEvent({ event_type: "artifact-written", agent_id: "@migration-agent", artifact_path: "repos/jatai/README.md", harness: "claude-code" });
    const ms = await reflectedIn([write], { events: [write] }, () => root().querySelector("g[data-island='execution'] [data-pot='repos/jatai/README.md']") !== null);
    expect(ms).toBeLessThan(1000);
  },

  "O mapa acompanha a atividade nos dois harnesses [GitHub Copilot · 5 segundos]": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    // No Copilot o evento vem do observador de artefatos (harness watcher): só o caminho, sem agente.
    const write = colmeiaEvent({ event_type: "artifact-written", artifact_path: "repos/jatai/README.md", harness: "watcher", run_id: "artifact-watcher" });
    const ms = await reflectedIn([write], { events: [write] }, () => feedText(root()).includes("artefato gravado"));
    expect(ms).toBeLessThan(5000);
    expect(textOf(root().querySelector("[data-label='execution']"))).toContain("Execução");
  },

  "Eventos que chegam com o mapa pausado aparecem na ordem ao retomar": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    click(buttonNamed(root(), "Pausar"));
    const events = [started("@agente-a", "epic-0/task-0.2"), started("@agente-b", "epic-0/task-0.3"), started("@agente-c", "epic-0/task-0.4")];
    deliver({ events }, events);
    // Pausado: nada muda, e o chip diz quantos esperam.
    expect(bees(root())).toEqual([]);
    expect(textOf(root().querySelector("[data-live]"))).toBe("pausado · 3 novos");
    click(buttonNamed(root(), "Retomar"));
    await untilDom(() => bees(root()).length === 3);
    // Na ordem em que aconteceram: o mais novo no alto do feed, e os três presentes.
    const lines = [...root().querySelectorAll("[data-feed-line]")].map((l) => textOf(l));
    expect(lines.map((l) => /@agente-(\w)/.exec(l)?.[1])).toEqual(["c", "b", "a"]);
    // E um resumo só para o leitor de tela.
    await untilDom(() => announcement(root()) !== "");
    expect(announcement(root())).toBe("3 novos eventos");
  },

  "O mapa mostra só metadados da atividade": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const secret = colmeiaEvent({
      event_type: "artifact-written",
      agent_id: "@security-auditor",
      artifact_path: ".github/artifacts/assessment/security/report.md",
      content: "senha=hunter2",
      metadata: { diff: "+ token=abc", reason: "varredura" },
    });
    await reflectedIn([secret], { events: [secret] }, () => feedText(root()).includes("artefato gravado"));
    const everything = textOf(root());
    expect(everything).not.toContain("hunter2");
    expect(everything).not.toContain("token=abc");
    // Só o agente, a ilha (Descoberta, pelo caminho) e o caminho do artefato.
    expect(root().querySelector("g[data-island='discovery'] [data-pot='.github/artifacts/assessment/security/report.md']")).not.toBeNull();
    click(root().querySelector('button[data-island="discovery"]'));
    expect(textOf(panelOf(root()))).toContain(".github/artifacts/assessment/security/report.md");
    expect(textOf(panelOf(root()))).not.toContain("hunter2");
  },

  "Um evento ilegível é ignorado sem derrubar o mapa": async () => {
    const real = started("@migration-agent", "epic-0/task-0.2", "semeando");
    deliver({ events: [real] });
    const { root, container } = mountMap();
    const before = container.innerHTML;
    const garbage = colmeiaEvent({ event_type: "agente.explodiu", message: "boom" });
    deliver({ events: [real, garbage] }, [garbage]);
    await nextFrame();
    // O mapa continua como estava, e o evento ilegível não aparece na atividade recente.
    const after = container.innerHTML;
    const at = [...before].findIndex((ch, k) => ch !== after[k]);
    expect(at === -1 && before.length === after.length ? "igual" : `difere perto de ${at}: «${before.slice(Math.max(0, at - 90), at + 90)}» ≠ «${after.slice(Math.max(0, at - 90), at + 90)}»`).toBe("igual");
    expect(feedText(root())).not.toContain("explodiu");
    expect(beeOf(root(), "@migration-agent")).not.toBeNull();
  },

  "Quando ninguém trabalha, nada se move": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    // Nenhuma abelha, nenhuma volta, e o ponto do chip não pulsa.
    expect(bees(root())).toEqual([]);
    expect(stubs.animations).toEqual([]);
    expect(root().querySelector("[data-flying='true']")).toBeNull();
    expect(root().querySelector("[data-live]")?.getAttribute("data-live")).toBe("idle");
    const css = source("apps/cockpit/map/MapHeader.module.css");
    expect(rulesMatching(css, '.live[data-live="idle"]')).not.toContain("animation");
    // A arte da cena não anima nada sozinha: só o favo que enche e a guarda que acende, e só quando algo acontece.
    expect(root().querySelector("[class*='potFill']")).toBeNull();
  },

  "Com trinta agentes trabalhando o mapa fica dentro do orçamento de animação": () => {
    const css = source("apps/cockpit/map/BeeLayer.module.css");
    const running = (): number => stubs.animations.filter((a) => a.state === "running").length;
    // Com poucas abelhas as asas batem: sem `data-crowd`, a regra de bater vale.
    deliver({ events: [started("@migration-agent", "epic-0/task-0.2"), started("@reviewer", "epic-0/task-0.3")] });
    const few = mountMap();
    expect(bees(few.root())).toHaveLength(2);
    expect(few.root().querySelector("[data-crowd]")).toBeNull();
    expect(few.root().querySelector("[data-posture='fly']")).not.toBeNull();
    expect(rulesMatching(css, '.glyph[data-posture="fly"] .wings')).toContain("animation: flap");
    cleanup();
    stubs.animations.length = 0;
    // Trinta agentes: uma abelha cada, uma animação de voo cada, e o total de nós animados cabe nos 60.
    deliver({ events: stressEvents(30, (i) => i * 900) });
    const { root } = mountMap({ scene: { maxBeesPerIsland: 30 } });
    expect(bees(root())).toHaveLength(30);
    expect(running()).toBe(30);
    // As asas ficam abertas (o navegador anima filho de SVG fora do compositor), e o voo continua.
    expect(root().querySelector("[data-crowd='true']")).not.toBeNull();
    expect(root().querySelectorAll("[data-flying='true']")).toHaveLength(30);
    expect(rulesMatching(css, '.layer[data-crowd="true"] .glyph[data-posture="fly"] .wings')).toContain("animation: none");
    // O teto vale em qualquer quantidade: no pior caso (FLAP_LIMIT abelhas batendo asa) são 2 nós por abelha e o pulso do chip.
    expect(FLAP_LIMIT * 2 + 1).toBeLessThan(60);
    expect(running() + 1).toBeLessThan(60);
  },

  "Uma abelha bloqueada ou que falhou para, com o motivo em texto [bloqueada · bloqueada por T0.1 · Bloqueado: bloqueada por T0.1]": async () => {
    const [initiative] = withTask("blocked", "bloqueada por T0.1");
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver({ initiatives: [initiative!], events: [begin] });
    const { root } = mountMap();
    const bee = beeOf(root(), "@migration-agent", "execution")!;
    // Parada na ilha da Execução: sem volta e sem animação.
    expect(bee.getAttribute("data-condition")).toBe("blocked");
    expect(bee.getAttribute("data-flying")).toBe("false");
    expect(stubs.animations.filter((a) => a.element === bee)).toEqual([]);
    // O motivo escrito, e não só em cor.
    expect(textOf(root().querySelector("[data-tag='@migration-agent']"))).toBe("Bloqueado: bloqueada por T0.1");
    click(root().querySelector('button[data-island="execution"]'));
    expect(textOf(panelOf(root()))).toContain("Bloqueado: bloqueada por T0.1");
  },

  "Uma abelha bloqueada ou que falhou para, com o motivo em texto [falhou · suíte de testes caiu · Falhou: suíte de testes caiu]": () => {
    const [initiative] = withTask("failed", "suíte de testes caiu");
    deliver({ initiatives: [initiative!], events: [started("@migration-agent", "epic-0/task-0.2")] });
    const { root } = mountMap();
    const bee = beeOf(root(), "@migration-agent", "execution")!;
    expect(bee.getAttribute("data-condition")).toBe("failed");
    expect(bee.getAttribute("data-flying")).toBe("false");
    expect(textOf(root().querySelector("[data-tag='@migration-agent']"))).toBe("Falhou: suíte de testes caiu");
    click(root().querySelector('button[data-island="execution"]'));
    expect(textOf(panelOf(root()))).toContain("Falhou: suíte de testes caiu");
  },

  "O mapa pausado informa quantos eventos esperam": () => {
    deliver({ events: [] });
    const { root } = mountMap();
    click(buttonNamed(root(), "Pausar"));
    expect(buttonNamed(root(), "Retomar").getAttribute("aria-pressed")).toBe("true");
    const events = [started("@agente-a", "epic-0/task-0.2"), started("@agente-b", "epic-0/task-0.3"), started("@agente-c", "epic-0/task-0.4")];
    const before = root().querySelector("[data-stage-scale]")!.innerHTML;
    deliver({ events }, events);
    expect(textOf(root().querySelector("[data-live]"))).toBe("pausado · 3 novos");
    // A cena continua como estava (e as animações, se houvesse, ficam pausadas).
    expect(root().querySelector("[data-stage-scale]")!.innerHTML).toBe(before);
    expect(root().getAttribute("data-motion")).toBe("paused");
  },

  "O leitor de tela é avisado de uma decisão nova": async () => {
    deliver({ events: [] });
    const { root } = mountMap();
    const ask = colmeiaEvent({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código" });
    deliver({ events: [ask] }, [ask]);
    await untilDom(() => announcement(root()) !== "");
    expect(announcement(root())).toBe("Nova decisão espera você: titularidade do código");
    expect(root().querySelector("[data-announcer]")?.getAttribute("aria-live")).toBe("polite");
  },

  "O leitor de tela é avisado de bloqueio e de falha [bloqueada · bloqueada por T0.1 · Bloqueio na Execução: @migration-agent, bloqueada por T0.1]": async () => {
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver({ events: [begin] });
    const { root } = mountMap();
    const [initiative] = withTask("blocked", "bloqueada por T0.1");
    deliver({ initiatives: [initiative!], events: [begin] });
    await untilDom(() => announcement(root()) !== "");
    expect(announcement(root())).toBe("Bloqueio na Execução: @migration-agent, bloqueada por T0.1");
  },

  "O leitor de tela é avisado de bloqueio e de falha [falhou · suíte de testes caiu · Falha na Execução: @migration-agent, suíte de testes caiu]": async () => {
    const begin = started("@migration-agent", "epic-0/task-0.2");
    deliver({ events: [begin] });
    const { root } = mountMap();
    const [initiative] = withTask("failed", "suíte de testes caiu");
    deliver({ initiatives: [initiative!], events: [begin] });
    await untilDom(() => announcement(root()) !== "");
    expect(announcement(root())).toBe("Falha na Execução: @migration-agent, suíte de testes caiu");
  },

  "Muitos eventos seguidos viram um aviso só para o leitor de tela": () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    deliver({ events: [] });
    const frames = manualClock();
    const { root } = mountMap({ clock: frames.clock });
    const region = root().querySelector("[data-announcer]")!;
    let changes = 0;
    const observer = new MutationObserver((records) => void (changes += records.length > 0 ? 1 : 0));
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    const all: ReturnType<typeof started>[] = [];
    // Oito eventos em dois segundos.
    for (let i = 0; i < 8; i++) {
      const event = started(`@agente-${i}`, `epic-0/task-0.${i + 2}`);
      all.push(event);
      deliver({ events: [...all] }, [event]);
      for (let f = 0; f < 3; f++) frames.frame();
      act(() => vi.advanceTimersByTime(250));
    }
    // Os registros do observador chegam como microtarefa: entrega os pendentes antes de contar.
    const pending = observer.takeRecords();
    changes += pending.length > 0 ? 1 : 0;
    // No intervalo de 2 s, no máximo um aviso (o primeiro sai na hora, o resto espera a janela de 5 s).
    expect(changes).toBeLessThanOrEqual(1);
    // Quando a janela fecha, o que sobrou vira um resumo só.
    act(() => vi.advanceTimersByTime(6000));
    expect(announcement(root())).toMatch(/^\d+ novos? eventos?$/);
    observer.disconnect();
  },
};

describe("Funcionalidade: Acompanhar os agentes em tempo real no mapa", () => {
  it("todo cenário do .feature tem step definition, e nenhum step sobra", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(scenarioTitles(FEATURE).sort());
  });
  for (const [title, steps] of Object.entries(SCENARIOS)) it(`Cenário: ${title}`, steps);
});
