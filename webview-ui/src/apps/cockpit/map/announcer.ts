/**
 * announcer.ts — o que o leitor de tela ouve do mapa (F5.3): decisão nova,
 * bloqueio e falha, e um resumo da atividade, num intervalo mínimo e sem
 * anúncio a cada tique (DS v2 §4.0, política de anúncios; R10).
 *
 * Duas peças puras: `announcementsFor` compara o mapa de antes com o de agora
 * e diz o que é novidade que importa; `createAnnouncer` agrupa o que chega
 * numa janela e emite no máximo uma vez a cada `intervalMs`, o primeiro aviso
 * na hora e os seguintes juntos quando a janela fecha.
 */
import { cursorFromEvents, eventsSinceCursor, isKnownEventType, type ColmeiaBee, type ColmeiaGuard, type ColmeiaVM, type RunEvent } from "@data";
import { beeCondition } from "./copy";

const guardKey = (g: ColmeiaGuard): string => `${g.islandId}|${g.kind}|${g.taskId ?? ""}|${g.reason}`;
const beeKey = (b: ColmeiaBee): string => `${b.agentId ?? "estado"}|${b.taskId ?? b.phaseId ?? "-"}|${b.islandId}`;

/** O que há de novo e importa para quem não vê a cena: guardas acesas, abelhas paradas e falhas. Na primeira leitura (`prev` nulo) não há novidade. */
export function announcementsFor(prev: ColmeiaVM | null, next: ColmeiaVM): string[] {
  if (!prev || prev.initiativeId !== next.initiativeId) return [];
  const out: string[] = [];

  const knownGuards = new Set(prev.guards.map(guardKey));
  for (const g of next.guards) {
    if (knownGuards.has(guardKey(g))) continue;
    out.push(g.kind === "decision" ? `Nova decisão espera você: ${g.reason}` : `Nova aprovação espera você: ${g.taskId ?? g.reason}`);
  }

  const knownStopped = new Set(prev.bees.filter((b) => b.state === "blocked").map(beeKey));
  const labelOf = new Map(next.islands.map((i) => [i.id, i.label]));
  for (const b of next.bees) {
    if (b.state !== "blocked" || knownStopped.has(beeKey(b))) continue;
    const failed = beeCondition(b.state, b.reason) === "failed";
    const reason = b.reason?.replace(/^falhou:\s*/, "") ?? "sem motivo registrado";
    out.push(`${failed ? "Falha" : "Bloqueio"} na ${labelOf.get(b.islandId) ?? b.islandId}: ${b.agentId ?? b.taskId ?? "tarefa"}, ${reason}`);
  }
  return out;
}

/**
 * Quantos eventos novos de atividade chegaram entre um desenho e o seguinte,
 * para o resumo "3 novos eventos". Só contam os que o mapa de fato mostra: de
 * tipo conhecido e da iniciativa ativa. Evento ilegível ou de outra
 * iniciativa é ignorado em silêncio (R8, cenário `@error`).
 */
export function countActivity(before: readonly RunEvent[], after: readonly RunEvent[], initiativeId: string | null): number {
  return eventsSinceCursor([...after], cursorFromEvents([...before])).filter(
    (e) => isKnownEventType(e.event_type) && (e.initiative_id === undefined || e.initiative_id === initiativeId)
  ).length;
}

export interface AnnouncerTimers {
  now(): number;
  setTimer(callback: () => void, ms: number): number;
  clearTimer(handle: number): void;
}

export interface Announcer {
  /** `important` são avisos que valem por si (decisão, bloqueio, falha); `activity` conta eventos comuns, que viram um resumo. */
  push(important: readonly string[], activity?: number): void;
  /** Descarta o que estava na fila (o mapa entrou em pausa: o resumo sai ao retomar). */
  clear(): void;
  dispose(): void;
}

/** "1 novo evento" ou "3 novos eventos". */
export const summarize = (n: number): string => (n === 1 ? "1 novo evento" : `${n} novos eventos`);

export function createAnnouncer(timers: AnnouncerTimers, intervalMs: number, emit: (text: string) => void): Announcer {
  let important: string[] = [];
  let activity = 0;
  let last = -Infinity;
  let timer: number | null = null;

  const flush = (): void => {
    timer = null;
    const parts = [...new Set(important), ...(activity > 0 ? [summarize(activity)] : [])];
    important = [];
    activity = 0;
    if (parts.length === 0) return;
    last = timers.now();
    emit(parts.join(". "));
  };

  return {
    push(newImportant, newActivity = 0) {
      if (newImportant.length === 0 && newActivity === 0) return;
      important.push(...newImportant);
      activity += newActivity;
      if (timer !== null) return;
      const wait = Math.max(0, last + intervalMs - timers.now());
      if (wait === 0) flush();
      else timer = timers.setTimer(flush, wait);
    },
    clear() {
      important = [];
      activity = 0;
      if (timer !== null) timers.clearTimer(timer);
      timer = null;
    },
    dispose() {
      if (timer !== null) timers.clearTimer(timer);
      timer = null;
    },
  };
}
