import { describe, it, expect } from "vitest";
import * as contract from "../src/core/contracts/run-events-contract.pure";
import {
  RUN_EVENT_ACTORS,
  RUN_EVENT_FIELD_ORDER,
  RUN_EVENT_HARNESSES,
  RUN_EVENT_MESSAGE_MAX,
  RUN_EVENT_METADATA_KEYS,
  RUN_EVENT_TYPES,
  RUN_EVENT_TYPES_WITH_AUTHOR,
  isWorkspaceRelativePath,
  serializeRunEvent,
  validateRunEvent,
  validateRunsFile,
} from "../scripts/lib/agent-activity.mjs";

/**
 * `scripts/lib/agent-activity.mjs` (F7.4) é o validador estrito que o demo usa
 * para conferir o histórico de `runs/*.jsonl` e para não gravar linha inválida
 * na reprodução ao vivo. A fonte do formato é o contrato agent-activity
 * (`.github/artifacts/planning/mod-missao-open-source/mapa/contrato-agent-activity.md`).
 *
 * Aqui só há dados inventados: nenhum evento de verdade entra neste arquivo.
 */

const CONTRATO = {
  agentStarted: '{"run_id":"r-20261114-0042","event_type":"agent-started","timestamp":"2026-11-14T20:26:00Z","initiative_id":"mod-missao-open-source","task_id":"epic-0/task-0.2","phase_id":"execution","agent_id":"migration-agent","repo_id":"jatai","actor":"agent","harness":"claude-code","message":"semeando repos/jatai"}',
  artifactWritten: '{"run_id":"r-20261114-0042","event_type":"artifact-written","timestamp":"2026-11-14T20:41:12Z","initiative_id":"mod-missao-open-source","agent_id":"migration-agent","artifact_path":".github/artifacts/execution/feature-report-jatai-f0.2-seed.md","actor":"agent","harness":"claude-code"}',
  decisionRequested: '{"run_id":"r-20261114-0050","event_type":"decision-requested","timestamp":"2026-11-14T20:45:00Z","initiative_id":"mod-missao-open-source","task_id":"epic-0/task-0.1","actor":"human","message":"titularidade do código","metadata":{"reason":"titularidade"}}',
};

const base = {
  run_id: "r-20261005-0001",
  event_type: "agent-started",
  timestamp: "2026-10-05T12:00:00Z",
  agent_id: "tech-mapper",
  actor: "agent",
  harness: "claude-code",
};

describe("agent-activity (demo) — os exemplos do contrato", () => {
  for (const [nome, linha] of Object.entries(CONTRATO)) {
    it(`o exemplo do contrato (${nome}) é válido, na ordem dos campos do contrato`, () => {
      expect(validateRunEvent(JSON.parse(linha), { strictOrder: true })).toEqual([]);
    });
  }

  it("serializar um evento põe os campos na ordem do contrato, sem inventar nenhum", () => {
    const fora: Record<string, unknown> = { message: "x", harness: "cli", timestamp: "2026-10-05T12:00:00Z", event_type: "agent-progress", run_id: "r-1", actor: "agent" };
    const line = serializeRunEvent(fora);
    expect(Object.keys(JSON.parse(line) as object)).toEqual(["run_id", "event_type", "timestamp", "actor", "harness", "message"]);
    expect(line).not.toContain("\n");
  });

  it("os exemplos do contrato sobrevivem ao ciclo ler → serializar → ler, byte a byte", () => {
    for (const linha of Object.values(CONTRATO)) expect(serializeRunEvent(JSON.parse(linha))).toBe(linha);
  });
});

describe("agent-activity (demo) — o que o contrato reprova", () => {
  it("evento mínimo válido: run_id, tipo e horário", () => {
    expect(validateRunEvent({ run_id: "r-1", event_type: "agent-done", timestamp: "2026-10-05T12:00:00Z" })).toEqual([]);
  });

  it.each([
    ["sem run_id", { ...base, run_id: undefined }, "falta run_id"],
    ["sem event_type", { ...base, event_type: undefined }, "falta event_type"],
    ["sem timestamp", { ...base, timestamp: undefined }, "falta timestamp"],
    ["tipo fora do vocabulário", { ...base, event_type: "agent-exploded" }, "event_type"],
    ["actor fora do vocabulário", { ...base, actor: "robot" }, "actor"],
    ["harness fora do vocabulário", { ...base, harness: "vim" }, "harness"],
    ["campo fora do contrato", { ...base, prompt: "texto" }, "campo fora do contrato: prompt"],
    ["horário sem fuso", { ...base, timestamp: "2026-10-05T12:00:00" }, "timestamp"],
    ["horário que não existe", { ...base, timestamp: "2026-13-45T12:00:00Z" }, "timestamp"],
  ])("recusa evento %s", (_nome, evento, trecho) => {
    const problemas = validateRunEvent(evento as Record<string, unknown>);
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.join(" | ")).toContain(trecho);
  });

  it("`by` só existe em decisão, aprovação de gate e aprovação de item", () => {
    for (const type of RUN_EVENT_TYPES) {
      const problemas = validateRunEvent({ ...base, event_type: type, actor: "human", by: "Pessoa Exemplo" });
      const comAutor = (RUN_EVENT_TYPES_WITH_AUTHOR as readonly string[]).includes(type);
      expect(problemas.some((p: string) => p.includes("by")), type).toBe(!comAutor);
    }
  });

  it("artifact_path é relativo à raiz do workspace, com barra normal e sem subir de pasta", () => {
    for (const ruim of ["/etc/passwd", "C:\\Users\\x", "..\\fora", "a/../../b", "a\\b", "a\u0000b"]) {
      expect(validateRunEvent({ ...base, event_type: "artifact-written", artifact_path: ruim }).join(" | "), JSON.stringify(ruim)).toContain("artifact_path");
    }
    expect(validateRunEvent({ ...base, event_type: "artifact-written", artifact_path: ".github/artifacts/planning/x/roadmap.md" })).toEqual([]);
    expect(isWorkspaceRelativePath("repos/biblioteca-api/app/")).toBe(true);
    expect(isWorkspaceRelativePath("repos//app")).toBe(false);
  });

  it(`a mensagem tem no máximo ${RUN_EVENT_MESSAGE_MAX} caracteres (conta caractere, não byte)`, () => {
    expect(validateRunEvent({ ...base, message: "á".repeat(RUN_EVENT_MESSAGE_MAX) })).toEqual([]);
    expect(validateRunEvent({ ...base, message: "á".repeat(RUN_EVENT_MESSAGE_MAX + 1) }).join(" | ")).toContain("message");
  });

  it("metadata aceita só a lista fechada: reason, task, path e count", () => {
    expect([...RUN_EVENT_METADATA_KEYS].sort()).toEqual(["count", "path", "reason", "task"]);
    expect(validateRunEvent({ ...base, metadata: { reason: "r", task: "epic-1/task-1.1", path: "app/main.py", count: 12 } })).toEqual([]);
    for (const chave of ["content", "diff", "prompt", "output", "file"]) {
      expect(validateRunEvent({ ...base, metadata: { [chave]: "x" } }).join(" | "), chave).toContain(`metadata.${chave}`);
    }
  });

  it("metadata não pode vir vazio, nem com count negativo ou fracionário, nem com reason maior que a mensagem", () => {
    expect(validateRunEvent({ ...base, metadata: {} }).join(" | ")).toContain("metadata vazio");
    expect(validateRunEvent({ ...base, metadata: { count: -1 } }).join(" | ")).toContain("metadata.count");
    expect(validateRunEvent({ ...base, metadata: { count: 1.5 } }).join(" | ")).toContain("metadata.count");
    expect(validateRunEvent({ ...base, metadata: { reason: "x".repeat(RUN_EVENT_MESSAGE_MAX + 1) } }).join(" | ")).toContain("metadata.reason");
  });

  it("o evento fora da ordem de campos do contrato só reprova no modo estrito", () => {
    const fora = { event_type: "agent-done", run_id: "r-1", timestamp: "2026-10-05T12:00:00Z" };
    expect(validateRunEvent(fora)).toEqual([]);
    expect(validateRunEvent(fora, { strictOrder: true }).join(" | ")).toContain("ordem");
  });

  it("não aceita o que não é um objeto", () => {
    for (const v of [null, [], "texto", 42]) expect(validateRunEvent(v as never).length).toBeGreaterThan(0);
  });
});

describe("agent-activity (demo) — o arquivo .jsonl", () => {
  const linha = (extra: Record<string, unknown> = {}): string => serializeRunEvent({ run_id: "r-1", event_type: "agent-done", timestamp: "2026-10-05T12:00:00Z", ...extra });

  it("um arquivo bem formado tem uma linha JSON por evento e termina em quebra de linha", () => {
    const r = validateRunsFile(`${linha()}\n${linha({ timestamp: "2026-10-05T12:01:00Z" })}\n`);
    expect(r.problems).toEqual([]);
    expect(r.events).toHaveLength(2);
  });

  it("aponta a linha de cada problema: JSON inválido, linha em branco, evento inválido e falta da quebra final", () => {
    const r = validateRunsFile(`${linha()}\n\n{nao e json}\n${linha({ event_type: "x" })}`);
    const texto = r.problems.join("\n");
    expect(texto).toContain("linha 2: linha em branco");
    expect(texto).toContain("linha 3: JSON inválido");
    expect(texto).toContain("linha 4: event_type");
    expect(texto).toContain("sem quebra de linha no fim");
  });

  it("arquivo vazio não é histórico", () => {
    expect(validateRunsFile("").problems.join(" ")).toContain("vazio");
  });
});

describe("agent-activity (demo) — as constantes batem com o núcleo", () => {
  const nucleo = contract as unknown as Record<string, readonly string[] | number | undefined>;

  // Os tipos novos, `actor`, `harness` e a lista fechada de metadata chegam ao núcleo com a F5.2
  // (frente G). Enquanto não chegaram, o validador do demo é a única cópia; depois da integração,
  // este teste passa a reprovar qualquer divergência entre as duas.
  it.skipIf(!("RUN_EVENT_ACTORS" in contract))("tipos, actor, harness, chaves de metadata e tamanho da mensagem são os do núcleo", () => {
    expect([...RUN_EVENT_TYPES]).toEqual([...(nucleo.RUN_EVENT_TYPES as readonly string[])]);
    expect([...RUN_EVENT_ACTORS]).toEqual([...(nucleo.RUN_EVENT_ACTORS as readonly string[])]);
    expect([...RUN_EVENT_HARNESSES]).toEqual([...(nucleo.RUN_EVENT_HARNESSES as readonly string[])]);
    expect([...RUN_EVENT_METADATA_KEYS]).toEqual([...(nucleo.RUN_EVENT_METADATA_KEYS as readonly string[])]);
    expect([...RUN_EVENT_TYPES_WITH_AUTHOR]).toEqual([...(nucleo.RUN_EVENT_TYPES_WITH_AUTHOR as readonly string[])]);
    expect(RUN_EVENT_MESSAGE_MAX).toBe(nucleo.RUN_EVENT_MESSAGE_MAX);
  });

  it("os sete tipos que já existiam no núcleo continuam todos no validador do demo", () => {
    for (const antigo of contract.RUN_EVENT_TYPES) expect((RUN_EVENT_TYPES as readonly string[]).includes(antigo), antigo).toBe(true);
  });

  it("a ordem dos campos tem os 14 campos do contrato, sem repetição", () => {
    expect(RUN_EVENT_FIELD_ORDER).toHaveLength(14);
    expect(new Set(RUN_EVENT_FIELD_ORDER).size).toBe(14);
  });
});
