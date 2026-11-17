/**
 * feedLines.ts — as linhas do "Na colmeia agora" (F5.3), em função pura: a
 * hora relativa, quem fez (em destaque) e o que fez, com o glifo e o tom do
 * tipo de evento. Só metadados (R8): o texto já vem cortado em 140 caracteres
 * do `deriveColmeia`.
 */
import type { ColmeiaFeedItem } from "@data";
import type { WorkStatus } from "../../../design-system/status/workStatus";
import { formatRelativeTime } from "../shell/NotificationCenter/formatRelativeTime";

export interface FeedLine {
  key: string;
  when: string;
  /** O agente, quando a frase começa por ele. */
  who: string | null;
  rest: string;
  status: WorkStatus;
}

/** O glifo e o tom de cada tipo de evento: ● quem trabalha, ■ o que espera você, ✓ o que foi aprovado, ⊘ o que travou. */
export function feedStatus(eventType: string): WorkStatus {
  switch (eventType) {
    case "agent-started":
    case "agent-progress":
    case "artifact-written":
      return "working";
    case "agent-done":
    case "decision-requested":
      return "you";
    case "gate-approved":
    case "item-approved":
    case "decision-made":
      return "done";
    case "blocked":
      return "blocked";
    default:
      return "queue";
  }
}

/** A frase que o `describeEvent` põe em todo `agent-done` (o protocolo do Foundation: terminou e espera a aprovação humana). */
const AWAITING_SUFFIX = / — aguarda aprovação$/;

/**
 * `awaiting` diz se aquele fim de trabalho realmente espera a pessoa (há uma
 * guarda acesa para ele). Sem guarda, "aguarda aprovação" seria falso: uma
 * tarefa que não pede aprovação só terminou, e a frase sai.
 */
export function feedLines(feed: readonly ColmeiaFeedItem[], now: number, limit = 4, awaiting: (item: ColmeiaFeedItem) => boolean = () => true): FeedLine[] {
  return feed.slice(0, limit).map((item, i): FeedLine => {
    const who = item.agentId && item.text.startsWith(item.agentId) ? item.agentId : null;
    const body = who ? item.text.slice(who.length).trimStart() : item.text;
    const text = item.eventType === "agent-done" && !awaiting(item) ? body.replace(AWAITING_SUFFIX, "") : body;
    return {
      key: `${item.timestamp}|${item.eventType}|${item.agentId ?? ""}|${item.artifactPath ?? ""}|${i}`,
      when: formatRelativeTime(item.timestamp, now),
      who,
      // A tarefa do evento fecha a frase: "começou · epic-0/task-0.2".
      rest: item.taskId && !text.includes(item.taskId) ? `${text} · ${item.taskId}` : text,
      status: feedStatus(item.eventType),
    };
  });
}
