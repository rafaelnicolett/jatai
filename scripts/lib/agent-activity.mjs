/**
 * agent-activity.mjs: o formato dos eventos de atividade de agente, em JavaScript puro (F7.4)
 *
 * O workspace demo (`scripts/demo-build.mjs`, `scripts/demo-play.mjs`) escreve e
 * confere linhas de `.github/artifacts/runs/*.jsonl`. Elas seguem o contrato
 * agent-activity (ADR-0020), desenhado em
 * `.github/artifacts/planning/mod-missao-open-source/mapa/contrato-agent-activity.md`:
 *
 *   - tipos: os sete de sempre mais `decision-requested` e `decision-made`;
 *   - campos opcionais: `initiative_id`, `task_id`, `artifact_path`, `actor`, `by`, `harness`;
 *   - privacidade (R8): `message` com no máximo 140 caracteres, `metadata` só com
 *     `reason`, `task`, `path` e `count`, e `artifact_path` sempre relativo à raiz.
 *
 * Este módulo é a conferência de leitura estrita das fixtures e da gravação do
 * demo. Ele não é o validador de escrita do produto: o contrato no código vive
 * em `src/core/contracts/` e `tests/demo-run-events.test.ts` confere que as
 * constantes daqui são as de lá assim que elas existirem no núcleo.
 *
 * Sem dependência e sem I/O, para rodar igual no CI de qualquer sistema.
 */

/** Tipos de evento do contrato (os sete de `RunEventType` e os dois da F5.2). */
export const RUN_EVENT_TYPES = [
  "agent-started",
  "agent-done",
  "agent-progress",
  "gate-approved",
  "artifact-written",
  "blocked",
  "item-approved",
  "decision-requested",
  "decision-made",
];

/** Quem gerou o evento. */
export const RUN_EVENT_ACTORS = ["agent", "human"];

/** Por onde o evento foi capturado. */
export const RUN_EVENT_HARNESSES = ["claude-code", "copilot", "opencode", "cli", "mcp", "watcher"];

/** Únicas chaves aceitas em `metadata` (lista fechada, R8). */
export const RUN_EVENT_METADATA_KEYS = ["reason", "task", "path", "count"];

/** Tamanho máximo de `message` e de `metadata.reason`, em caracteres. */
export const RUN_EVENT_MESSAGE_MAX = 140;

/** Tipos em que `by` (o autor humano) faz sentido. */
export const RUN_EVENT_TYPES_WITH_AUTHOR = ["decision-made", "gate-approved", "item-approved"];

/** Teto dos campos de identificação: o bastante para um id real, pouco para esconder conteúdo. */
export const RUN_EVENT_ID_MAX = 200;

/** Os campos do contrato, na ordem em que o escritor do produto os grava. */
export const RUN_EVENT_FIELD_ORDER = [
  "run_id",
  "event_type",
  "timestamp",
  "initiative_id",
  "task_id",
  "phase_id",
  "agent_id",
  "repo_id",
  "artifact_path",
  "actor",
  "by",
  "harness",
  "message",
  "metadata",
];

const ID_FIELDS = ["run_id", "initiative_id", "task_id", "phase_id", "agent_id", "repo_id", "by"];
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tamanho em caracteres (pontos de código), como o corte de 140 do escritor. */
function length(text) {
  return [...text].length;
}

/**
 * `true` se `p` é caminho relativo à raiz do workspace: com `/`, sem `..`, sem raiz nem
 * unidade e sem caractere de controle. Uma barra no fim (pasta) é aceita.
 */
export function isWorkspaceRelativePath(p) {
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return false;
  if ([...p].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return false;
  if (p.includes("\\")) return false;
  const segments = (p.endsWith("/") ? p.slice(0, -1) : p).split("/");
  return segments.every((segment) => segment !== ".." && segment !== "");
}

function validateMetadata(metadata) {
  const problems = [];
  if (!isPlainObject(metadata)) return ["metadata não é um objeto"];
  const keys = Object.keys(metadata);
  if (keys.length === 0) return ["metadata vazio (o escritor do produto o descarta)"];
  for (const key of keys) {
    if (!RUN_EVENT_METADATA_KEYS.includes(key)) {
      problems.push(`metadata.${key}: chave fora da lista fechada (${RUN_EVENT_METADATA_KEYS.join(", ")})`);
      continue;
    }
    const value = metadata[key];
    if (key === "count") {
      if (!Number.isInteger(value) || value < 0) problems.push("metadata.count: precisa ser um inteiro não negativo");
    } else if (typeof value !== "string" || value.trim() === "") {
      problems.push(`metadata.${key}: precisa ser um texto não vazio`);
    } else if (key === "reason" && length(value) > RUN_EVENT_MESSAGE_MAX) {
      problems.push(`metadata.reason: tem ${length(value)} caracteres, o máximo é ${RUN_EVENT_MESSAGE_MAX}`);
    } else if (key !== "reason" && length(value) > RUN_EVENT_ID_MAX) {
      problems.push(`metadata.${key}: passa de ${RUN_EVENT_ID_MAX} caracteres`);
    }
  }
  return problems;
}

/**
 * Confere um evento contra o contrato e devolve TODOS os problemas (lista vazia
 * = válido). Com `strictOrder`, também exige os campos na ordem do contrato, a
 * mesma em que o escritor do produto os grava.
 */
export function validateRunEvent(event, { strictOrder = false } = {}) {
  if (!isPlainObject(event)) return ["o evento não é um objeto JSON"];
  const problems = [];

  for (const key of Object.keys(event)) {
    if (!RUN_EVENT_FIELD_ORDER.includes(key)) problems.push(`campo fora do contrato: ${key}`);
  }
  for (const key of ["run_id", "event_type", "timestamp"]) {
    if (event[key] === undefined) problems.push(`falta ${key}`);
  }

  for (const key of ID_FIELDS) {
    const value = event[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim() === "") problems.push(`${key}: precisa ser um texto não vazio`);
    else if (length(value) > RUN_EVENT_ID_MAX) problems.push(`${key}: passa de ${RUN_EVENT_ID_MAX} caracteres`);
  }

  if (event.event_type !== undefined && !RUN_EVENT_TYPES.includes(event.event_type)) {
    problems.push(`event_type: ${JSON.stringify(event.event_type)} fora de ${JSON.stringify(RUN_EVENT_TYPES)}`);
  }
  if (event.actor !== undefined && !RUN_EVENT_ACTORS.includes(event.actor)) {
    problems.push(`actor: ${JSON.stringify(event.actor)} fora de ${JSON.stringify(RUN_EVENT_ACTORS)}`);
  }
  if (event.harness !== undefined && !RUN_EVENT_HARNESSES.includes(event.harness)) {
    problems.push(`harness: ${JSON.stringify(event.harness)} fora de ${JSON.stringify(RUN_EVENT_HARNESSES)}`);
  }

  if (event.timestamp !== undefined) {
    const ts = event.timestamp;
    const valid = typeof ts === "string" && ISO_UTC.test(ts) && !Number.isNaN(Date.parse(ts)) && new Date(ts).toISOString().slice(0, 10) === ts.slice(0, 10);
    if (!valid) problems.push(`timestamp: ${JSON.stringify(ts)} não é um horário ISO 8601 em UTC (AAAA-MM-DDTHH:MM:SSZ)`);
  }

  if (event.artifact_path !== undefined) {
    const p = event.artifact_path;
    if (typeof p !== "string" || p.trim() === "") problems.push("artifact_path: precisa ser um texto não vazio");
    else if (length(p) > RUN_EVENT_ID_MAX) problems.push(`artifact_path: passa de ${RUN_EVENT_ID_MAX} caracteres`);
    else if (!isWorkspaceRelativePath(p)) problems.push(`artifact_path: ${JSON.stringify(p)} precisa ser relativo à raiz do workspace, com "/" e sem ".."`);
  }

  if (event.by !== undefined && !RUN_EVENT_TYPES_WITH_AUTHOR.includes(event.event_type)) {
    problems.push(`by: só existe em ${RUN_EVENT_TYPES_WITH_AUTHOR.join(", ")}`);
  }

  if (event.message !== undefined) {
    if (typeof event.message !== "string" || event.message.trim() === "") problems.push("message: precisa ser um texto não vazio");
    else if (length(event.message) > RUN_EVENT_MESSAGE_MAX) problems.push(`message: tem ${length(event.message)} caracteres, o máximo é ${RUN_EVENT_MESSAGE_MAX}`);
  }

  if (event.metadata !== undefined) problems.push(...validateMetadata(event.metadata));

  if (strictOrder) {
    const present = Object.keys(event).filter((k) => RUN_EVENT_FIELD_ORDER.includes(k));
    const expected = RUN_EVENT_FIELD_ORDER.filter((k) => present.includes(k));
    if (present.join(",") !== expected.join(",")) problems.push(`ordem dos campos fora da do contrato (esperado: ${expected.join(", ")})`);
  }
  return problems;
}

/** O evento como uma linha JSON (sem a quebra de linha): só os campos do contrato, na ordem do contrato. */
export function serializeRunEvent(event) {
  const out = {};
  for (const key of RUN_EVENT_FIELD_ORDER) {
    const value = event[key];
    if (value === undefined) continue;
    if (key === "metadata" && isPlainObject(value)) {
      const metadata = {};
      for (const k of RUN_EVENT_METADATA_KEYS) if (value[k] !== undefined) metadata[k] = value[k];
      out.metadata = metadata;
    } else {
      out[key] = value;
    }
  }
  return JSON.stringify(out);
}

/**
 * Confere o texto de um `.jsonl`: uma linha JSON por evento, sem linha em
 * branco, só LF e com quebra de linha no fim. Devolve os eventos lidos e os
 * problemas, cada um com o número da linha.
 */
export function validateRunsFile(text) {
  const events = [];
  const problems = [];
  if (text.trim() === "") return { events, problems: ["arquivo vazio"] };
  if (text.includes("\r")) problems.push("o arquivo tem CR: o histórico usa só LF");
  if (!text.endsWith("\n")) problems.push("sem quebra de linha no fim do arquivo");

  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, index) => {
    const n = index + 1;
    if (line.trim() === "") {
      problems.push(`linha ${n}: linha em branco`);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      problems.push(`linha ${n}: JSON inválido (${err.message})`);
      return;
    }
    const eventProblems = validateRunEvent(parsed, { strictOrder: true });
    for (const p of eventProblems) problems.push(`linha ${n}: ${p}`);
    events.push(parsed);
  });
  return { events, problems };
}
