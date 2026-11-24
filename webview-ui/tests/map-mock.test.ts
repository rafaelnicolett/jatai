import { describe, it, expect } from "vitest";
import { deriveView } from "../src/apps/cockpit/map/useColmeia";
import { readMockParams } from "../src/mock/colmeiaParams";
import { HOTFIX_ID, MISSAO_ID, createColmeiaSimulator, type SimMessage } from "../src/mock/colmeiaScenarios";
import type { RunEvent } from "@data";

/**
 * O mock do mapa para o navegador (F5.3): a página `mapa.html` e a história
 * simulada que é a base dos GIFs do README. Como o simulador entrega as mesmas
 * mensagens do host, o teste liga o simulador à derivação de verdade (`deriveView`)
 * e confere o que o mapa mostraria, sem montar nada.
 */

const BASE = Date.parse("2026-11-16T12:00:00Z");

/** Um simulador com relógio de mentira (um segundo por passo) que guarda tudo que entregou. */
function simulate() {
  const delivered: SimMessage[] = [];
  let tick = 0;
  const sim = createColmeiaSimulator({ deliver: (m) => void delivered.push(m), now: () => BASE + tick * 1000 });
  return {
    sim,
    delivered,
    /** Anda um passo e devolve só as mensagens que ele entregou. */
    step(): SimMessage[] {
      const before = delivered.length;
      tick += 1;
      sim.step();
      return delivered.slice(before);
    },
  };
}

const snapshotOf = (m: SimMessage) => (m.type === "shell/snapshot" ? m.payload : null);

/** O que o mapa mostra para o snapshot que acabou de chegar. */
const viewOf = (m: SimMessage) => {
  const snapshot = snapshotOf(m);
  if (!snapshot) throw new Error("não é um snapshot");
  return deriveView({ status: "ready", snapshot, recentRunEvents: [] });
};

/** Quantos passos tem o laço: anda até o contador de passos voltar a zero. */
function loopLength(): number {
  const { sim, step } = simulate();
  for (let i = 1; i <= 100; i++) {
    step();
    if (sim.beat === 0) return i;
  }
  throw new Error("a história não recomeça");
}

describe("o simulador da história do mapa", () => {
  it("cada passo entrega o snapshot e, havendo evento novo, o runEvents-append logo depois, com a sequência sempre crescendo", () => {
    const { step, delivered } = simulate();
    const total = loopLength();
    for (let i = 0; i < total; i++) {
      const messages = step();
      expect(messages[0]!.type).toBe("shell/snapshot");
      expect(messages.length).toBeLessThanOrEqual(2);
      if (messages.length === 2) expect(messages[1]!.type).toBe("shell/runEvents-append");
    }
    const seqs = delivered.map((m) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("os eventos do append já estão na janela do snapshot que veio antes (a mesma ordem do host)", () => {
    const { step } = simulate();
    for (let i = 0; i < loopLength() - 1; i++) {
      const [snap, append] = step();
      if (!append || append.type !== "shell/runEvents-append") continue;
      const window = new Set(snapshotOf(snap!)!.runEvents.map((e: RunEvent) => `${e.timestamp}|${e.event_type}|${e.agent_id ?? ""}|${e.task_id ?? ""}`));
      for (const e of append.payload) expect(window.has(`${e.timestamp}|${e.event_type}|${e.agent_id ?? ""}|${e.task_id ?? ""}`)).toBe(true);
    }
  });

  it("a história mostra trabalho, decisão pedida, bloqueio, falha, retomada e conclusão, e a decisão fecha antes do fim", () => {
    const { step } = simulate();
    const conditions = new Set<string>();
    const guardsByStep: number[] = [];
    let lastView = null as ReturnType<typeof viewOf> | null;
    for (let i = 0; i < loopLength() - 1; i++) {
      const view = viewOf(step()[0]!);
      for (const bee of view.scene.bees) conditions.add(bee.condition);
      guardsByStep.push(view.vm.guards.length);
      lastView = view;
    }
    // Abelhas trabalhando, uma bloqueada com motivo e uma que falhou, em algum ponto da história.
    expect([...conditions].sort()).toEqual(["blocked", "failed", "working"]);
    // Um gate espera a pessoa e depois é resolvido: há passo com guarda acesa e o último passo útil não tem.
    expect(Math.max(...guardsByStep)).toBeGreaterThan(0);
    expect(guardsByStep.at(-1)).toBe(0);
    // No fim da história ninguém está trabalhando.
    expect(lastView!.scene.bees).toEqual([]);
  });

  it("ao fim do laço a história recomeça do zero: o contador volta a 0 e a janela de eventos esvazia", () => {
    const { sim, step } = simulate();
    const total = loopLength();
    for (let i = 0; i < total - 1; i++) step();
    expect(sim.beat).toBeGreaterThan(0);
    const [snap] = step();
    expect(sim.beat).toBe(0);
    expect(snapshotOf(snap!)!.runEvents).toEqual([]);
    expect(viewOf(snap!).scene.bees).toEqual([]);
  });

  it("`advance(n)` aplica os n passos e entrega só o resultado (o snapshot e um append), para a captura de telas", () => {
    const { sim, delivered } = simulate();
    sim.advance(9);
    expect(delivered.map((m) => m.type)).toEqual(["shell/snapshot", "shell/runEvents-append"]);
    expect(sim.beat).toBe(9);
    const view = viewOf(delivered[0]!);
    expect(view.scene.bees.length).toBeGreaterThan(0);
  });

  it("`snapshot()` reentrega o mundo como está (o `shell/ready`), sem andar a história nem repetir eventos", () => {
    const { sim, delivered, step } = simulate();
    step();
    step();
    const beat = sim.beat;
    const before = delivered.length;
    sim.snapshot();
    expect(delivered.length - before).toBe(1);
    expect(delivered.at(-1)!.type).toBe("shell/snapshot");
    expect(sim.beat).toBe(beat);
  });

  it("`switchTo` troca a iniciativa ativa como o host: o snapshot do hotfix traz as ilhas do hotfix e nenhum evento da Missão", () => {
    const { sim, delivered, step } = simulate();
    step();
    step();
    const snapshots = (): SimMessage[] => delivered.filter((m) => m.type === "shell/snapshot");
    expect(snapshotOf(snapshots().at(-1)!)!.initiatives?.active).toBe(MISSAO_ID);
    sim.switchTo(HOTFIX_ID);
    const last = snapshots().at(-1)!;
    expect(snapshotOf(last)!.initiatives?.active).toBe(HOTFIX_ID);
    expect(snapshotOf(last)!.runEvents).toEqual([]);
    expect(viewOf(last).scene.islands.map((i) => i.id)).toEqual(["wave-1", "wave-2", "wave-3"]);
  });
});

describe("os parâmetros da página do mapa", () => {
  it("sem parâmetros, a página abre o Cockpit com a história da Missão rodando, em tema escuro e com movimento", () => {
    expect(readMockParams("")).toEqual({
      scenario: "vivo",
      view: "cockpit",
      scene: null,
      mode: null,
      reducedMotion: false,
      theme: "escuro",
      highContrast: false,
      screenReader: false,
      steps: 0,
      frozen: false,
      tickMs: 1600,
    });
  });

  it("cada parâmetro liga a sua opção (cenário, vista, cena, modo, movimento, tema, contraste, leitor, passos, parado e ritmo)", () => {
    const p = readMockParams("?cenario=hotfix&vista=mapa&cena=dia&modo=lista&movimento=reduzido&tema=claro&contraste=alto&leitor=1&passos=9&parado=1&ritmo=900");
    expect(p).toEqual({
      scenario: "hotfix",
      view: "mapa",
      scene: "dia",
      mode: "lista",
      reducedMotion: true,
      theme: "claro",
      highContrast: true,
      screenReader: true,
      steps: 9,
      frozen: true,
      tickMs: 900,
    });
    expect(readMockParams("?cenario=estresse").scenario).toBe("estresse");
    expect(readMockParams("?cenario=descoberta").scenario).toBe("descoberta");
    expect(readMockParams("?cenario=vazio").scenario).toBe("vazio");
  });

  it("valor que não existe cai no padrão, e números inválidos ou fora da faixa não quebram a página", () => {
    const p = readMockParams("?cenario=marte&vista=3d&cena=tarde&modo=grade&tema=sepia&passos=abc&ritmo=10");
    expect(p).toMatchObject({ scenario: "vivo", view: "cockpit", scene: null, mode: null, theme: "escuro", steps: 0 });
    // O ritmo tem piso: abaixo de 200 ms a página não tenta redesenhar mais rápido que o mapa aceita.
    expect(p.tickMs).toBe(200);
    expect(readMockParams("?passos=-4").steps).toBe(0);
    expect(readMockParams("?passos=2.9").steps).toBe(2);
    expect(readMockParams("?ritmo=").tickMs).toBe(1600);
  });
});
