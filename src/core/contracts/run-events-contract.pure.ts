/**
 * run-events-contract.pure.ts
 *
 * A metade pura de `run-events-contract.ts` — zero `fs`/`path`, seguro para
 * bundle de webview (browser). Tipos, parsing e derivação de atividade vivem
 * aqui; `loadRunEvents` (que toca disco) fica no arquivo original, que
 * re-exporta este módulo por inteiro para não quebrar nenhum consumidor
 * existente.
 *
 * **Por que existe (o canal):** o `foundation-state.yaml` só é escrito **nos
 * gates**. Entre um gate e outro — que pode levar 10+ minutos de sub-agente
 * trabalhando — o dashboard fica literalmente cego: o chat sabe tudo, a tela
 * não sabe nada. `runs/*.jsonl` é o canal de progresso contínuo, append-only e
 * efêmero: se sumir, o estado durável do delivery continua íntegro.
 */

import { BRAND } from "../brand/brand.pure";

export const RUNS_DIR = [".github", "artifacts", "runs"] as const;
export const RUNS_REL = RUNS_DIR.join("/");
/** Glob para o FileSystemWatcher — é o que dispara o refresh do dashboard. */
export const RUNS_GLOB = `${RUNS_REL}/**/*.jsonl`;

/**
 * Tipos de evento.
 *
 * Deliberadamente poucos: cada tipo novo é mais uma coisa que o agente precisa
 * lembrar de emitir, e prompt não garante nada. Estes cobrem "o que está
 * rodando", "o que terminou" e "o que espera por mim".
 */
export type RunEventType =
  /** Sub-agente começou a trabalhar. */
  | "agent-started"
  /** Sub-agente terminou e AGUARDA aprovação humana (espelha `agent-done`). */
  | "agent-done"
  /** Progresso dentro de um sub-agente longo (opcional, evita a tela congelar). */
  | "agent-progress"
  /** Humano aprovou o gate da fase. */
  | "gate-approved"
  /** Artefato gravado no disco. */
  | "artifact-written"
  /** Algo travou e precisa de decisão. */
  | "blocked"
  /** Humano aprovou um item de `wave_status` direto no Cockpit (Onda 2 — espelha `gate-approved`, mas fora do gate D1). */
  | "item-approved"
  /** Uma decisão humana foi pedida sem estar ligada ao fim de um agente (contrato agent-activity, F5.2). A guarda da ilha acende com o motivo. */
  | "decision-requested"
  /** A decisão foi tomada, por quem (`by`) e quando (contrato agent-activity, F5.2). A guarda apaga. */
  | "decision-made";

/** Espelho runtime de `RunEventType` — fonte de validação da escrita (o parser de leitura aceita qualquer string; a escrita não). */
export const RUN_EVENT_TYPES = [
  "agent-started", "agent-done", "agent-progress", "gate-approved", "artifact-written", "blocked", "item-approved",
  "decision-requested", "decision-made",
] as const;

/** Quem gerou o evento (contrato agent-activity, §2.2). */
export const RUN_EVENT_ACTORS = ["agent", "human"] as const;
export type RunEventActor = (typeof RUN_EVENT_ACTORS)[number];

/** Por onde o evento foi capturado (contrato agent-activity, §2.2). O mapa não depende disto. */
export const RUN_EVENT_HARNESSES = ["claude-code", "copilot", "opencode", "cli", "mcp", "watcher"] as const;
export type RunEventHarness = (typeof RUN_EVENT_HARNESSES)[number];

/** Únicas chaves aceitas em `metadata` na escrita (R8, privacidade). */
export const RUN_EVENT_METADATA_KEYS = ["reason", "task", "path", "count"] as const;

/** Tamanho máximo de `message`; o excedente é cortado na escrita (R8). */
export const RUN_EVENT_MESSAGE_MAX = 140;

/** Tipos em que `by` (autor humano) faz sentido; nos outros, o campo é descartado na escrita. */
export const RUN_EVENT_TYPES_WITH_AUTHOR = ["decision-made", "gate-approved", "item-approved"] as const;

export interface RunEvent {
  run_id: string;
  /** Documentado em `RunEventType` — aceita qualquer string (logs reais podem trazer tipos futuros). */
  event_type: string;
  timestamp: string;
  /** Fase (`tech-stack`, `arch`, `domain`…). */
  phase_id?: string;
  /** Sub-agente (`@tech-mapper`…). */
  agent_id?: string;
  /** Repositório alvo — ausente em fases `scope: workspace`. */
  repo_id?: string;
  /** Mensagem curta para a tela ("lendo 30 módulos…"). */
  message?: string;
  metadata?: Record<string, unknown>;
  // ── Campos opcionais do contrato agent-activity (F5.2, aditivos) ──
  /** Iniciativa do evento. O mapa filtra pela ativa. */
  initiative_id?: string;
  /** Chave da tarefa no estado, ex.: `epic-0/task-0.2`. */
  task_id?: string;
  /** Caminho relativo à raiz do workspace. **Nunca conteúdo.** */
  artifact_path?: string;
  /** Quem gerou o evento. */
  actor?: RunEventActor;
  /** Autor humano de uma decisão (o `user.name` do git, nunca o e-mail). Só em `decision-made`, `gate-approved` e `item-approved`. */
  by?: string;
  /** Por onde o evento foi capturado. */
  harness?: RunEventHarness;
}

const KNOWN_TYPES = new Set<string>(RUN_EVENT_TYPES);

export function isKnownEventType(t: string): boolean {
  return KNOWN_TYPES.has(t);
}

/**
 * Subconjunto de `RunEventType` relevante o bastante pra central de
 * notificações (Onda 2) — exportado (não só interno de um consumidor) porque
 * TANTO `CockpitNextController` (produção) QUANTO `mockData.ts` (harness
 * visual) precisam classificar `runEvents` do MESMO jeito; sem isto, o mock
 * podia mostrar uma central com filtro diferente do que o Cockpit real usa.
 * `item-approved` nunca vira toast (ver `CockpitNextController`) mas entra
 * aqui — a central é o registro completo, o toast é só o "aconteceu agora".
 */
export const NOTIFICATION_HISTORY_EVENT_TYPES = new Set(["agent-done", "blocked", "gate-approved", "item-approved"]);

/**
 * Parseia JSONL tolerando lixo.
 *
 * O arquivo é escrito por um agente **enquanto** o dashboard lê. Linha
 * incompleta (escrita a meio) é normal e não pode derrubar a tela — por isso
 * cada linha é isolada: uma quebrada não invalida as outras.
 */
export function parseRunEvents(raw: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed) as Partial<RunEvent>;
      if (typeof e.event_type !== "string" || typeof e.timestamp !== "string") continue;
      events.push({
        run_id: typeof e.run_id === "string" ? e.run_id : "unknown",
        event_type: e.event_type,
        timestamp: e.timestamp,
        ...(typeof e.phase_id === "string" ? { phase_id: e.phase_id } : {}),
        ...(typeof e.agent_id === "string" ? { agent_id: e.agent_id } : {}),
        ...(typeof e.repo_id === "string" ? { repo_id: e.repo_id } : {}),
        ...(typeof e.message === "string" ? { message: e.message } : {}),
        ...(e.metadata && typeof e.metadata === "object" ? { metadata: e.metadata } : {}),
        ...readAgentActivityFields(e),
      });
    } catch {
      // linha parcial ou corrompida — ignora, o resto do arquivo vale
    }
  }
  return events;
}

/**
 * Os campos opcionais do contrato agent-activity, lidos com a mesma
 * tolerância do resto: só string (e, em `actor`/`harness`, só um valor do
 * vocabulário). Qualquer outra coisa some na leitura, sem derrubar a linha.
 */
function readAgentActivityFields(e: Partial<RunEvent>): Partial<RunEvent> {
  const out: Partial<RunEvent> = {};
  if (typeof e.initiative_id === "string") out.initiative_id = e.initiative_id;
  if (typeof e.task_id === "string") out.task_id = e.task_id;
  if (typeof e.artifact_path === "string") out.artifact_path = e.artifact_path;
  if (typeof e.actor === "string" && (RUN_EVENT_ACTORS as readonly string[]).includes(e.actor)) out.actor = e.actor;
  if (typeof e.by === "string") out.by = e.by;
  if (typeof e.harness === "string" && (RUN_EVENT_HARNESSES as readonly string[]).includes(e.harness)) out.harness = e.harness;
  return out;
}

// ── Consultas que a tela faz ────────────────────────────────────────────────

export interface LiveActivity {
  /** O que está rodando agora — o mais recente, `null` quando nada está. Mantido por compatibilidade. */
  running: RunEvent | null;
  /** Todo repo::fase rodando agora, não só o mais recente — é isto que `foundation-plan.ts`/`delivery-plan.ts` usam pra marcar vários itens "running" ao mesmo tempo (ex.: backend+frontend em paralelo). */
  runningByKey: RunEvent[];
  /** Fases que terminaram e aguardam aprovação humana. */
  awaiting: RunEvent[];
  /** Fases bloqueadas em pleno andamento (evento `blocked` mais recente por chave). */
  blocked: RunEvent[];
  /** Últimos eventos, do mais recente para o mais antigo. */
  recent: RunEvent[];
}

/**
 * Deriva a atividade corrente do fluxo de eventos.
 *
 * "Rodando" = um `agent-started` sem `agent-done`/`blocked` correspondente. O
 * pareamento é por `phase_id` + `repo_id`, porque a mesma fase roda em
 * repositórios diferentes e não pode se confundir.
 */
export function deriveActivity(events: RunEvent[], recentLimit = 8): LiveActivity {
  const key = (e: RunEvent): string => `${e.repo_id ?? "-"}::${e.phase_id ?? "-"}`;

  const started = new Map<string, RunEvent>();
  const awaiting = new Map<string, RunEvent>();
  const blocked = new Map<string, RunEvent>();

  for (const e of events) {
    const k = key(e);
    switch (e.event_type) {
      case "agent-started":
        started.set(k, e);
        awaiting.delete(k);
        blocked.delete(k); // uma retentativa limpa o bloqueio anterior
        break;
      case "agent-progress":
        if (started.has(k)) started.set(k, { ...started.get(k)!, message: e.message ?? started.get(k)!.message });
        break;
      case "agent-done":
        started.delete(k);
        awaiting.set(k, e);
        break;
      case "gate-approved":
        started.delete(k);
        awaiting.delete(k);
        blocked.delete(k);
        break;
      case "blocked":
        started.delete(k);
        blocked.set(k, e);
        break;
    }
  }

  const runningByKey = [...started.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  // O mais recente que ainda está rodando — mantido por compatibilidade com quem só lê `running`.
  const running = runningByKey.at(-1) ?? null;

  return {
    running,
    runningByKey,
    awaiting: [...awaiting.values()],
    blocked: [...blocked.values()],
    recent: [...events].reverse().slice(0, recentLimit),
  };
}

/** Rótulo humano de um evento, para a timeline da tela. */
export function describeEvent(e: RunEvent): string {
  const who = e.agent_id ?? e.phase_id ?? BRAND.displayName;
  const where = e.repo_id ? ` · ${e.repo_id}` : "";
  switch (e.event_type) {
    case "agent-started":     return `${who} começou${where}`;
    case "agent-progress":    return `${who}${where} — ${e.message ?? "trabalhando…"}`;
    case "agent-done":        return `${who} terminou${where} — aguarda aprovação`;
    case "gate-approved":     return `Gate aprovado — ${who}${where}`;
    case "artifact-written":  return `${e.message ?? "artefato gravado"}${where}`;
    case "blocked":           return `${who} bloqueado${where} — ${e.message ?? "precisa de decisão"}`;
    case "item-approved":     return e.message ?? `Item aprovado${where}`;
    case "decision-requested": return `Decisão pedida${where} — ${e.message ?? "aguarda você"}`;
    case "decision-made":     return `Decisão tomada${e.by ? ` por ${e.by}` : ""}${where}${e.message ? ` — ${e.message}` : ""}`;
    default:                  return `${who}${where} — ${e.event_type}`;
  }
}

/**
 * Eventos de um único repositório, mais recente primeiro.
 *
 * `loadRunEvents`/`deriveActivity` só expõem uma janela global (top-8/top-200
 * combinando TODOS os repositórios) — um repositório barulhento pode ocupar
 * essa janela inteira e deixar um repositório silencioso sem nenhum histórico
 * visível. Esta função filtra por `repo_id` antes de fatiar, então cada
 * repositório sempre tem seus próprios últimos eventos disponíveis.
 */
export function recentEventsForRepo(events: RunEvent[], repoId: string, limit = 8): RunEvent[] {
  return events
    .filter((e) => e.repo_id === repoId)
    .slice(-limit)
    .reverse();
}

/**
 * O evento "rodando agora" de UM `PlanItem` específico (repo+fase), não do
 * repositório inteiro — para o fluxo vertical, onde cada passo mostra seu
 * próprio estado ao vivo, não o do repo como um todo.
 */
export function liveEventForItem(
  activity: LiveActivity | null,
  item: { key: string; repoId?: string }
): RunEvent | undefined {
  if (!activity) return undefined;
  const phaseId = item.key.includes("/") ? item.key.split("/").pop() : item.key;
  return activity.runningByKey.find((e) => e.phase_id === phaseId && (e.repo_id ?? undefined) === item.repoId);
}

/**
 * Últimas N linhas de UM passo (repo+fase) — não do repo inteiro
 * (`recentEventsForRepo`). Necessário porque `LiveActivity` só guarda a
 * mensagem mais recente por chave (sobrescrita a cada `agent-progress`), não
 * o histórico — o console inline do passo precisa do `RunEvent[]` bruto.
 */
export function recentEventsForStep(
  events: RunEvent[],
  repoId: string | undefined,
  phaseId: string,
  limit = 5
): RunEvent[] {
  return events
    .filter((e) => e.phase_id === phaseId && (e.repo_id ?? undefined) === repoId)
    .slice(-limit)
    .reverse();
}

/**
 * Cursor de "até onde já enviei" para o `shell/runEvents-append`.
 *
 * Os quatro campos de identidade (timestamp, tipo, fase, repo) são do último
 * evento entregue, como antes. Desde a correção do M4 (F5.2), o cursor também
 * guarda `delivered`: a identidade de cada evento da janela entregue, com
 * multiplicidade. A janela é ordenada por horário, então um evento que chega
 * DEPOIS com horário ANTERIOR ao último entregue (relógio de outro processo,
 * append tardio) entra no meio da lista; com só a posição do último, ele era
 * engolido até o próximo `shell/ready`. Com `delivered`, novo é o que ainda
 * não foi entregue, em qualquer posição.
 */
export interface RunEventCursor {
  timestamp: string;
  event_type: string;
  phase_id?: string;
  repo_id?: string;
  /** Identidade (`runEventIdentity`) de cada evento já entregue, com repetição. Ausente = cursor antigo, só por posição. */
  delivered?: string[];
}

/** Identidade de um evento lido: a linha inteira, campo a campo. Dois eventos idênticos contam duas vezes. */
export function runEventIdentity(e: RunEvent): string {
  return JSON.stringify(e);
}

/** Cursor da janela entregue (que já deve estar ordenada, mais antigo → mais recente). */
export function cursorFromEvents(events: RunEvent[]): RunEventCursor | null {
  const last = events.at(-1);
  if (!last) return null;
  return {
    timestamp: last.timestamp,
    event_type: last.event_type,
    ...(last.phase_id ? { phase_id: last.phase_id } : {}),
    ...(last.repo_id ? { repo_id: last.repo_id } : {}),
    delivered: events.map(runEventIdentity),
  };
}

function sameEvent(e: RunEvent, cursor: RunEventCursor): boolean {
  return e.timestamp === cursor.timestamp
    && e.event_type === cursor.event_type
    && (e.phase_id ?? undefined) === cursor.phase_id
    && (e.repo_id ?? undefined) === cursor.repo_id;
}

/**
 * Eventos genuinamente novos desde o cursor.
 *
 * Com `delivered` (todo cursor de `cursorFromEvents` desde o M4): os eventos
 * da janela que ainda não foram entregues, em qualquer posição e na ordem da
 * janela. Um evento atrasado entra; um já entregue não volta; nada da janela
 * fica de fora.
 *
 * Sem `delivered` (cursor antigo, só por posição): o que vem depois do evento
 * do cursor. Se ele já saiu da janela de 200, não há como saber quantos
 * eventos foram perdidos no meio, então **resincroniza tudo** (devolve a
 * lista inteira) em vez de adivinhar uma posição.
 */
export function eventsSinceCursor(events: RunEvent[], cursor: RunEventCursor | null): RunEvent[] {
  if (!cursor) return events;
  if (cursor.delivered) {
    const pending = new Map<string, number>();
    for (const id of cursor.delivered) pending.set(id, (pending.get(id) ?? 0) + 1);
    return events.filter((e) => {
      const id = runEventIdentity(e);
      const left = pending.get(id) ?? 0;
      if (left === 0) return true;
      pending.set(id, left - 1);
      return false;
    });
  }
  const idx = events.findIndex((e) => sameEvent(e, cursor));
  if (idx === -1) return events;
  return events.slice(idx + 1);
}
