/**
 * mergeEvents.ts — os eventos que o mapa deriva (F5.3): a janela do snapshot
 * mais os que chegaram depois pela mensagem `shell/runEvents-append`.
 *
 * O host manda o snapshot (com a janela de 200 eventos) e, logo em seguida, o
 * `runEvents-append` com os eventos novos, que JÁ estão na janela do snapshot
 * que acabou de sair. Por isso as duas listas se repetem; juntar sem conferir
 * contaria cada evento duas vezes (duas abelhas, dois itens no feed). A
 * identidade de um evento é a linha inteira (`runEventIdentity`), com
 * multiplicidade: dois eventos idênticos de verdade contam duas vezes.
 *
 * O resultado fica em ordem de horário, estável: o `deriveColmeia` pareia
 * início e fim lendo na ordem, e um evento atrasado (relógio de outro
 * processo) precisa entrar no lugar certo, não no fim.
 */
import { runEventIdentity, type RunEvent } from "@data";

const timeOf = (e: RunEvent): number => {
  const t = Date.parse(e.timestamp);
  return Number.isNaN(t) ? 0 : t;
};

/** A janela do snapshot mais os eventos novos, sem repetir o que a janela já tem, em ordem de horário. */
export function mergeRunEvents(window: readonly RunEvent[], recent: readonly RunEvent[]): RunEvent[] {
  if (recent.length === 0) return window as RunEvent[];

  const inWindow = new Map<string, number>();
  for (const e of window) {
    const id = runEventIdentity(e);
    inWindow.set(id, (inWindow.get(id) ?? 0) + 1);
  }
  const extra = recent.filter((e) => {
    const id = runEventIdentity(e);
    const left = inWindow.get(id) ?? 0;
    if (left === 0) return true;
    inWindow.set(id, left - 1);
    return false;
  });
  if (extra.length === 0) return window as RunEvent[];

  return [...window, ...extra]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => timeOf(a.event) - timeOf(b.event) || a.index - b.index)
    .map((x) => x.event);
}
