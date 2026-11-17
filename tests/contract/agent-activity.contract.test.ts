import { describe, it, expect } from "vitest";
import {
  RUN_EVENT_TYPES,
  RUN_EVENT_MESSAGE_MAX,
  describeEvent,
  deriveActivity,
  isKnownEventType,
  parseRunEvents,
  type RunEvent,
} from "../../src/core/contracts/run-events-contract.pure";
import { validateRunEvent, isWorkspaceRelativePath } from "../../src/core/contracts/agent-activity.pure";

/**
 * Contrato agent-activity (F5.2, ADR-0020) — `mapa/contrato-agent-activity.md`
 * §7: round-trip de cada tipo, validador descartando campos fora da lista,
 * mensagem cortada em 140 caracteres e evento ilegível ignorado.
 *
 * Expand-Contract: os tipos e campos de antes continuam valendo; os testes de
 * `tests/run-events-contract.test.ts` (leitura, derivação e frases) não mudam.
 */

const FULL: Omit<RunEvent, "event_type"> = {
  run_id: "r-20261114-0042",
  timestamp: "2026-11-14T20:26:00Z",
  initiative_id: "mod-missao-open-source",
  task_id: "epic-0/task-0.2",
  phase_id: "execution",
  agent_id: "migration-agent",
  repo_id: "jatai",
  artifact_path: ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md",
  actor: "agent",
  harness: "claude-code",
  message: "semeando repos/jatai",
  metadata: { reason: "titularidade", task: "epic-0/task-0.1", path: "execution/x.md", count: 3 },
};

describe("contrato agent-activity — tipos e campos (Expand)", () => {
  it("os 7 tipos de antes continuam e entram decision-requested e decision-made", () => {
    expect(RUN_EVENT_TYPES).toEqual([
      "agent-started", "agent-done", "agent-progress", "gate-approved", "artifact-written", "blocked", "item-approved",
      "decision-requested", "decision-made",
    ]);
    for (const t of RUN_EVENT_TYPES) expect(isKnownEventType(t)).toBe(true);
  });

  it.each(RUN_EVENT_TYPES.map((t) => [t]))("round-trip de %s: validado, gravado como uma linha e lido de volta igual", (type) => {
    const by = ["decision-made", "gate-approved", "item-approved"].includes(type) ? { by: "Pessoa Fictícia", actor: "human" as const } : {};
    const result = validateRunEvent({ ...FULL, ...by, event_type: type });
    expect(result.ok).toBe(true);
    const event = (result as { value: RunEvent }).value;
    expect(parseRunEvents(`${JSON.stringify(event)}\n`)).toEqual([event]);
    expect(event).toMatchObject({ ...FULL, ...by, event_type: type });
  });

  it("os exemplos do contrato (§3) passam pelo validador sem perder nada", () => {
    const lines = [
      '{"run_id":"r-20261114-0042","event_type":"agent-started","timestamp":"2026-11-14T20:26:00Z","initiative_id":"mod-missao-open-source","task_id":"epic-0/task-0.2","phase_id":"execution","agent_id":"migration-agent","repo_id":"jatai","actor":"agent","harness":"claude-code","message":"semeando repos/jatai"}',
      '{"run_id":"r-20261114-0042","event_type":"artifact-written","timestamp":"2026-11-14T20:41:12Z","initiative_id":"mod-missao-open-source","agent_id":"migration-agent","artifact_path":".github/artifacts/execution/feature-report-jatai-f0.2-seed.md","actor":"agent","harness":"claude-code"}',
      '{"run_id":"r-20261114-0050","event_type":"decision-requested","timestamp":"2026-11-14T20:45:00Z","initiative_id":"mod-missao-open-source","task_id":"epic-0/task-0.1","actor":"human","message":"titularidade do código","metadata":{"reason":"titularidade"}}',
    ];
    for (const line of lines) {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const result = validateRunEvent(raw);
      expect(result.ok).toBe(true);
      expect((result as { value: RunEvent }).value).toEqual(raw);
    }
  });
});

describe("contrato agent-activity — o validador da escrita (R8)", () => {
  it("descarta campo fora do contrato e chave de metadata fora da lista fechada", () => {
    const result = validateRunEvent({
      ...FULL,
      event_type: "artifact-written",
      content: "conteúdo do arquivo",
      prompt: "texto do prompt",
      metadata: { reason: "r", diff: "+ linha", output: "saída da ferramenta", count: 1 },
    });
    expect(result.ok).toBe(true);
    const event = (result as { value: RunEvent }).value as unknown as Record<string, unknown>;
    expect(event.content).toBeUndefined();
    expect(event.prompt).toBeUndefined();
    expect(event.metadata).toEqual({ reason: "r", count: 1 });
  });

  it(`corta a mensagem e o motivo em ${RUN_EVENT_MESSAGE_MAX} caracteres`, () => {
    const long = "x".repeat(200);
    const result = validateRunEvent({ run_id: "r", event_type: "blocked", timestamp: "t", message: long, metadata: { reason: long } });
    expect(result.ok).toBe(true);
    const event = (result as { value: RunEvent }).value;
    expect(event.message).toHaveLength(RUN_EVENT_MESSAGE_MAX);
    expect((event.metadata as { reason: string }).reason).toHaveLength(RUN_EVENT_MESSAGE_MAX);
  });

  it("by só fica em decision-made, gate-approved e item-approved", () => {
    const started = validateRunEvent({ run_id: "r", event_type: "agent-started", timestamp: "t", by: "Pessoa Fictícia" });
    const decided = validateRunEvent({ run_id: "r", event_type: "decision-made", timestamp: "t", by: "Pessoa Fictícia" });
    expect((started as { value: RunEvent }).value.by).toBeUndefined();
    expect((decided as { value: RunEvent }).value.by).toBe("Pessoa Fictícia");
  });

  it.each([
    [{ run_id: "r", timestamp: "t" }, "MISSING_FLAG", "event_type"],
    [{ run_id: "r", event_type: "agent.exploded", timestamp: "t" }, "INVALID_ENUM", "event_type"],
    [{ run_id: "r", event_type: "agent-started", timestamp: "t", harness: "cursor" }, "INVALID_ENUM", "harness"],
    [{ run_id: "r", event_type: "agent-started", timestamp: "t", actor: "robot" }, "INVALID_ENUM", "actor"],
    [{ event_type: "agent-started", timestamp: "t" }, "MISSING_FLAG", "run_id"],
    [{ run_id: "r", event_type: "artifact-written", timestamp: "t", artifact_path: "../fora/segredo.txt" }, "USAGE", "artifact_path"],
    [{ run_id: "r", event_type: "artifact-written", timestamp: "t", artifact_path: "/etc/passwd" }, "USAGE", "artifact_path"],
    [{ run_id: "r", event_type: "agent-started", timestamp: "t", agent_id: "a".repeat(201) }, "USAGE", "agent_id"],
  ])("recusa %j com %s em %s", (input, code, field) => {
    const result = validateRunEvent(input);
    expect(result.ok).toBe(false);
    expect((result as { error: { code: string; field: string } }).error).toMatchObject({ code, field });
  });

  it("caminho de artefato: relativo e dentro do workspace", () => {
    expect(isWorkspaceRelativePath(".github/artifacts/execution/x.md")).toBe(true);
    expect(isWorkspaceRelativePath("repos/jatai/README.md")).toBe(true);
    expect(isWorkspaceRelativePath("a/../../b")).toBe(false);
    expect(isWorkspaceRelativePath("C:\\Users\\x")).toBe(false);
    expect(isWorkspaceRelativePath("\\\\servidor\\x")).toBe(false);
  });
});

describe("contrato agent-activity — leitores antigos e novos", () => {
  it("evento ilegível (sem tipo, tipo desconhecido, JSON quebrado) não derruba a leitura nem a derivação", () => {
    const raw = [
      JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", agent_id: "@a", phase_id: "execution" }),
      '{"run_id":"r","timestamp":"2026-01-01T10:01:00Z"}',
      JSON.stringify({ run_id: "r", event_type: "agent.exploded", timestamp: "2026-01-01T10:02:00Z" }),
      '{"event_type":"decision-req',
    ].join("\n");
    const events = parseRunEvents(raw);
    expect(events.map((e) => e.event_type)).toEqual(["agent-started", "agent.exploded"]);
    expect(isKnownEventType("agent.exploded")).toBe(false);
    expect(deriveActivity(events).running?.agent_id).toBe("@a");
  });

  it("a leitura descarta actor e harness fora do vocabulário, e campo novo que não é texto", () => {
    const [e] = parseRunEvents(JSON.stringify({ run_id: "r", event_type: "agent-started", timestamp: "t", actor: "robot", harness: "cursor", task_id: 7, initiative_id: "mod-x" }));
    expect(e).toEqual({ run_id: "r", event_type: "agent-started", timestamp: "t", initiative_id: "mod-x" });
  });

  it("os tipos novos não mudam a derivação de antes (o Cockpit atual ignora)", () => {
    const base = [{ run_id: "r", event_type: "agent-started", timestamp: "2026-01-01T10:00:00Z", agent_id: "@a", phase_id: "p" }];
    const withNew = [...base, { run_id: "r", event_type: "decision-requested", timestamp: "2026-01-01T10:01:00Z", phase_id: "p" }, { run_id: "r", event_type: "decision-made", timestamp: "2026-01-01T10:02:00Z", phase_id: "p", by: "X" }];
    const a = deriveActivity(base);
    const b = deriveActivity(withNew);
    expect({ running: b.running, runningByKey: b.runningByKey, awaiting: b.awaiting, blocked: b.blocked }).toEqual({ running: a.running, runningByKey: a.runningByKey, awaiting: a.awaiting, blocked: a.blocked });
  });

  it("describeEvent: frases dos tipos novos, sem mudar as de antes", () => {
    expect(describeEvent({ run_id: "r", event_type: "decision-requested", timestamp: "t", message: "titularidade do código" })).toBe("Decisão pedida — titularidade do código");
    expect(describeEvent({ run_id: "r", event_type: "decision-requested", timestamp: "t" })).toBe("Decisão pedida — aguarda você");
    expect(describeEvent({ run_id: "r", event_type: "decision-made", timestamp: "t", by: "Pessoa Fictícia", message: "MIT" })).toBe("Decisão tomada por Pessoa Fictícia — MIT");
    expect(describeEvent({ run_id: "r", event_type: "agent-started", timestamp: "t", agent_id: "@x", repo_id: "r1" })).toBe("@x começou · r1");
  });
});
