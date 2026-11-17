/**
 * frameThrottle.ts — o que decide QUANDO o mapa redesenha (F5.3): no próximo
 * quadro de animação depois de um evento, no máximo uma vez por
 * `minIntervalMs`, e nunca enquanto estiver segurado (pausa).
 *
 * Um evento isolado chega à tela no quadro seguinte (cerca de 16 ms), o que
 * deixa quase todo o 1 s de orçamento para o host. Uma rajada (um agente que
 * grava 40 arquivos) vira uma atualização a cada `minIntervalMs`, com o
 * estado mais novo: a vista nunca desenha cada evento de uma rajada.
 *
 * O relógio é injetado (`requestAnimationFrame`, `cancelAnimationFrame` e
 * `performance.now`), então o teste anda os quadros um a um, sem esperar tempo
 * de verdade e sem `sleep` cego.
 */

export interface FrameClock {
  raf(callback: () => void): number;
  caf(handle: number): void;
  now(): number;
}

export interface FrameThrottle {
  /** Há estado novo para mostrar. Agenda o redesenho no próximo quadro permitido. */
  request(): void;
  /** Segura: os pedidos ficam guardados e nada é aplicado (o mapa está pausado). */
  hold(): void;
  /** Solta: se chegou algo enquanto segurava, aplica no próximo quadro, sem esperar o intervalo. */
  release(): void;
  /** Aplica já, se houver algo pendente e não estiver segurado. */
  flush(): void;
  /** Quantos pedidos chegaram desde a última aplicação. */
  pendingCount(): number;
  dispose(): void;
}

export function createFrameThrottle(clock: FrameClock, minIntervalMs: number, apply: () => void): FrameThrottle {
  let handle: number | null = null;
  let pending = 0;
  let last = -Infinity;
  let held = false;
  let disposed = false;
  let skipWait = false;

  const applyNow = (): void => {
    pending = 0;
    last = clock.now();
    apply();
  };

  const tick = (): void => {
    handle = null;
    if (disposed || held || pending === 0) return;
    if (!skipWait && clock.now() - last < minIntervalMs) {
      handle = clock.raf(tick);
      return;
    }
    skipWait = false;
    applyNow();
  };

  const schedule = (): void => {
    if (handle === null && !disposed && !held && pending > 0) handle = clock.raf(tick);
  };

  return {
    request() {
      if (disposed) return;
      pending += 1;
      schedule();
    },
    hold() {
      held = true;
      if (handle !== null) {
        clock.caf(handle);
        handle = null;
      }
    },
    release() {
      held = false;
      skipWait = pending > 0;
      schedule();
    },
    flush() {
      if (disposed || held || pending === 0) return;
      if (handle !== null) {
        clock.caf(handle);
        handle = null;
      }
      applyNow();
    },
    pendingCount: () => pending,
    dispose() {
      disposed = true;
      if (handle !== null) clock.caf(handle);
      handle = null;
    },
  };
}
