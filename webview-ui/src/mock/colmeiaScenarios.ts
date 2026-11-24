/**
 * colmeiaScenarios.ts — o mundo de mentira do mapa da colmeia (F5.3). SÓ para
 * o harness visual (`map-main.tsx`) e para os testes; nunca importado pelo
 * `main.tsx` de produção, então não entra no bundle real.
 *
 * Monta o `CockpitSnapshot` da "Missão Open Source" (modernização no Epic 0 da
 * Execução, D1 e D2 aprovados, D3 por construir) pelos mesmos tipos e
 * derivações do host (`buildFoundationPlan`, `deriveActivity`), e um
 * simulador que conta uma história de eventos em laço (o titular roda no Vite
 * e vê o mapa vivo, e é a base dos GIFs do README). Os eventos passam pelo
 * mesmo `parseRunEvents` que lê `runs/*.jsonl`.
 *
 * Nada aqui é dado de cliente: ids de iniciativa e de agente são os da própria
 * metodologia.
 */
import {
  BRAND,
  buildDeliveryPlan,
  buildFoundationPlan,
  deriveActivity,
  parseReposYaml,
  parseRunEvents,
  agentRoleFromDescription,
  type AgentCatalogEntry,
  type FoundationState,
  type Initiative,
  type InitiativesState,
  type ReposInventory,
  type RunEvent,
} from "@data";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";

export const MISSAO_ID = "mod-missao-open-source";
export const HOTFIX_ID = "hotfix-wizard-intro-blank-screen";

/** A "Missão Open Source": D1 e D2 aprovados, no Epic 0 · Fundação da Execução. */
export function missaoInitiative(over: Partial<Initiative> = {}): Initiative {
  return {
    id: MISSAO_ID,
    name: "Missão Open Source",
    status: "in-progress",
    type: "modernization",
    mode: "brownfield",
    scope: [BRAND.name],
    epics: [
      "epic-0: Fundação — repositório isolado e rede de segurança",
      `epic-1: Marca ${BRAND.displayName}`,
      "epic-2: Saneamento",
    ],
    roadmap_gate: { status: "approved" },
    risk_matrix_gate: { status: "approved" },
    gate_d2: { status: "approved", human_approved_at: "2026-11-14T22:10:00Z", by: "Pessoa Fictícia" },
    planning_artifacts: [
      ".github/artifacts/planning/mod-missao-open-source/roadmap.md",
      ".github/artifacts/planning/mod-missao-open-source/risk-matrix.md",
      "docs/adr/0012-repositorio-isolado.md",
    ],
    epic_status: {
      "epic-0": {
        status: "in-progress",
        items: {
          "task-0.1": { status: "pending" },
          "task-0.2": { status: "in-progress" },
          "task-0.3": { status: "pending" },
          "task-0.4": { status: "pending" },
        },
      },
    },
    ...over,
  };
}

/** Um hotfix em três ondas (Diagnóstico, Correção, Validação). */
export function hotfixInitiative(over: Partial<Initiative> = {}): Initiative {
  return {
    id: HOTFIX_ID,
    name: "Hotfix: tela 1 do Wizard em branco",
    status: "in-progress",
    type: "hotfix",
    waves: ["wave-1: Diagnóstico — causa raiz", "wave-2: Correção — com testes", "wave-3: Validação — sem regressão"],
    wave_status: { "wave-1": { status: "in-progress", items: { "item-1.1": { status: "in-progress" } } } },
    ...over,
  };
}

const phase = (status: "done" | "agent-done" | "in-progress" | "pending") => ({ status, human_checklist: {} });

/** O Foundation do repositório da missão (`repos/<marca>`), todo concluído e com o D1 aprovado. */
export function foundationDone(): FoundationState {
  return {
    phases: {},
    repos: {
      [BRAND.name]: {
        phases: {
          "tech-stack": phase("done"),
          arch: phase("done"),
          "coding-archaeology": phase("done"),
          quality: phase("done"),
          debt: phase("done"),
          security: phase("done"),
          "test-coverage": phase("done"),
        },
        gate_d1: { status: "approved" },
      },
    },
  };
}

/** A descoberta do brownfield em andamento, sem iniciativa ativa: o cenário `?cenario=descoberta`. */
export function foundationDiscovery(): FoundationState {
  const phase = (status: "done" | "agent-done" | "in-progress" | "pending", human_checklist: Record<string, boolean> = {}) => ({ status, human_checklist });
  return {
    phases: {
      domain: phase("in-progress"),
      "business-context": phase("pending"),
    },
    repos: {
      [BRAND.name]: {
        phases: {
          "tech-stack": phase("done", { "stack-identified": true }),
          arch: phase("agent-done"),
          "coding-archaeology": phase("in-progress"),
          design: phase("pending"),
          quality: phase("pending"),
          debt: phase("pending"),
          security: phase("in-progress"),
          "test-coverage": phase("pending"),
        },
        gate_d1: { status: "pending" },
      },
    },
  };
}

const REPOS_YAML = `
version: 1
repos:
  - id: ${BRAND.name}
    source: local-path
    path: repos/${BRAND.name}
    scan_profile: deep
    stack: typescript
    has_history: true
    has_frontend: true
`;

/** As responsabilidades dos agentes, no texto que o kit põe no frontmatter (o prefixo de stream sai pelo mesmo caminho do host). */
const KIT_DESCRIPTIONS: Record<string, string> = {
  assessor: "Coordenador do Foundation (Discovery): inventaria os repositórios e conduz os sub-agentes passo a passo, com validação humana após cada um, até o gate D1.",
  "tech-mapper": "Discovery: inventário preciso e versionado da stack em uso (versões do lock, não as declaradas) e radar tecnológico do repositório.",
  "arch-discoverer": "Discovery: infere o padrão arquitetural real de um repositório e produz a análise C4 (L1 a L3).",
  "coding-archaeologist": "Discovery: extrai como o time realmente escreve código e gera as diretrizes de codificação do repositório.",
  "design-archaeologist": "Discovery: extrai o padrão visual real da UI existente e gera o design system do repositório.",
  "quality-auditor": "Discovery: diagnóstico objetivo da saúde do código (complexidade, hotspots, duplicação, código morto), com métricas e não opiniões.",
  "debt-analyst": "Discovery: consolida a dívida técnica num inventário priorizável a partir dos achados dos outros agentes.",
  "security-auditor": "Discovery: mapeia o perfil de risco de segurança do projeto existente sem explorar nada.",
  "test-coverage-mapper": "Discovery: diagnostica o estado dos testes e onde falta cobertura antes de qualquer refactor.",
  "domain-extractor": "Discovery: engenharia reversa de domínio; extrai bounded contexts, aggregates e linguagem ubíqua do código.",
  "dependency-mapper": "Discovery: mapeia como os repositórios se conectam e produz o grafo de dependências entre eles.",
  "business-archeologist": "Discovery: engenharia reversa do negócio implícito no código e nos documentos do cliente.",
  "modernization-planner": "Planning: compara a arquitetura atual com o alvo e monta o roadmap de modernização incremental e reversível.",
  "risk-prioritizer": "Planning: ordena o roadmap pela matriz risco × valor × esforço, incluindo o risco de não fazer.",
  "adr-recorder": "Planning: registra como ADRs as decisões arquiteturais implícitas no projeto e as propostas do roadmap.",
  "test-backfill-agent": "Execution: cria a rede de segurança (characterization tests) que pina o comportamento atual antes de qualquer refactor ou migração.",
  "refactor-agent": "Execution: aplica refactors conhecidos e pequenos, com testes verdes e commits atômicos, sem mudar comportamento.",
  "migration-agent": "Execution: semeia o repositório novo e migra versão de runtime ou framework de forma incremental e reversível, nunca big bang.",
  "feature-adder": "Execution: implementa feature nova em código existente, BDD primeiro e no estilo do projeto, sem refatorar de passagem.",
  reviewer: "Downstream: revisa os PRs e só aprova com segurança e testes de aceitação verdes.",
};

/** O catálogo como o host o monta: id com arroba e a responsabilidade sem o prefixo de stream. Operação não tem agente instalado de propósito (o painel mostra o agente sem a linha de responsabilidade). */
export const MOCK_AGENT_CATALOG: AgentCatalogEntry[] = Object.entries(KIT_DESCRIPTIONS).map(([id, description]) => ({ id: `@${id}`, role: agentRoleFromDescription(description) }));

let clock = 0;
const BASE = Date.parse("2026-11-16T12:00:00Z");

/** Um evento como o mapa o recebe: uma linha de `runs/*.jsonl` lida pelo parser de sempre. `at` (ms desde a base) fixa o horário. */
export function colmeiaEvent(fields: Record<string, unknown>, at?: number): RunEvent {
  clock += 1;
  const when = new Date(BASE + (at ?? clock * 1000)).toISOString();
  const line = JSON.stringify({ run_id: "r-mock", timestamp: when, initiative_id: MISSAO_ID, harness: "claude-code", ...fields });
  return parseRunEvents(line)[0]!;
}

export interface ColmeiaSnapshotOptions {
  initiatives?: Initiative[];
  /** `null` = sem iniciativa ativa. */
  active?: string | null;
  events?: RunEvent[];
  foundation?: FoundationState | null;
  /** `null` = workspace sem repos.yaml (nem descoberta para mostrar). */
  reposInventory?: ReposInventory | null;
  agents?: AgentCatalogEntry[];
}

/** O snapshot completo do Cockpit para a cena pedida. */
export function buildColmeiaSnapshot(options: ColmeiaSnapshotOptions = {}): CockpitSnapshot {
  const initiatives = options.initiatives ?? [missaoInitiative(), hotfixInitiative()];
  const active = options.active === undefined ? initiatives[0]!.id : options.active;
  const state: InitiativesState | null = active === null ? null : { active, initiatives };
  const events = options.events ?? [];
  const foundationState = options.foundation === undefined ? foundationDone() : options.foundation;
  const reposInventory = options.reposInventory === undefined ? parseReposYaml(REPOS_YAML).inventory : options.reposInventory;
  const liveActivity = deriveActivity(events);
  return {
    config: null,
    configured: true,
    reposInventory,
    foundationState,
    foundationPlan: buildFoundationPlan(reposInventory, foundationState, liveActivity),
    liveActivity,
    runEvents: events,
    contextRepos: null,
    repoGraph: null,
    initiatives: state,
    deliveryState: null,
    deliveryPlan: buildDeliveryPlan(null, null, liveActivity),
    sprintBacklog: null,
    operations: { devops: null, observability: null, incidents: null, sustain: null },
    kitStatus: null,
    warnings: [],
    approvalFrictionFields: [],
    deliveryHierarchy: "legacy",
    notifications: [],
    notificationsLastSeenAt: null,
    agents: options.agents ?? MOCK_AGENT_CATALOG,
  };
}

// ── O simulador: uma história de eventos em laço ────────────────────────────

type ItemStatus = "pending" | "in-progress" | "blocked" | "failed" | "done";
interface SimItem {
  status: ItemStatus;
  reason?: string;
  artifacts?: string[];
}

/** O que o simulador entrega ao webview: as mesmas mensagens do host (snapshot e runEvents-append). */
export type SimMessage =
  | { type: "shell/snapshot"; seq: number; generatedAt: string; payload: CockpitSnapshot }
  | { type: "shell/runEvents-append"; seq: number; payload: RunEvent[] };

export interface SimulatorOptions {
  deliver: (message: SimMessage) => void;
  /** O relógio do mundo (ms). Os eventos levam o horário dele. */
  now?: () => number;
}

export interface Simulator {
  /** Anda um passo da história e entrega o resultado. Ao fim do laço, recomeça. */
  step(): void;
  /** Aplica `count` passos de uma vez e entrega só o resultado (para a captura de telas). */
  advance(count: number): void;
  /** Reentrega o mundo atual como um snapshot novo (o `shell/ready` e o "Atualizar"). */
  snapshot(): void;
  /** Troca a iniciativa ativa, como o host faz com `switchInitiative`. */
  switchTo(id: string): void;
  readonly beat: number;
}

const REPORT = (name: string): string => `.github/artifacts/execution/${name}`;
const SEED_REPORT = REPORT(`feature-report-${BRAND.name}-f0.2-seed.md`);
const GOLDEN_REPORT = REPORT(`test-backfill-report-${BRAND.name}-f0.4-golden.md`);
const REVIEW_REPORT = REPORT(`review-report-${BRAND.name}-f0.2.md`);

/** A cena de estresse: `n` agentes trabalhando ao mesmo tempo, espalhados pelas ilhas. */
export function stressEvents(n: number, at: (i: number) => number): RunEvent[] {
  const where = ["execution", "execution", "planning", "discovery", "execution", "discovery"];
  return Array.from({ length: n }, (_, i) => {
    const phase = where[i % where.length]!;
    // Cada agente é uma abelha própria: na Execução pela tarefa; nas outras ilhas, por um repositório só dele (o pareamento é por repo e fase).
    const where2 = phase === "execution" ? { task_id: `epic-0/task-9.${i}` } : { repo_id: `repo-${i}` };
    return colmeiaEvent({ event_type: "agent-started", agent_id: `@agente-${i + 1}`, phase_id: phase, ...where2, message: `passo ${i + 1} de ${n}` }, at(i));
  });
}

export function createColmeiaSimulator(options: SimulatorOptions): Simulator {
  const now = options.now ?? Date.now;
  let seq = 0;
  let beat = 0;
  let active = MISSAO_ID;
  let items: Record<string, SimItem> = {};
  let events: RunEvent[] = [];
  let fresh: RunEvent[] = [];
  const stamp = (): number => now() - BASE;

  const emit = (fields: Record<string, unknown>): RunEvent => {
    const e = colmeiaEvent(fields, stamp());
    events = [...events, e].slice(-200);
    fresh.push(e);
    return e;
  };

  const reset = (): void => {
    items = { "task-0.1": { status: "pending" }, "task-0.2": { status: "pending" }, "task-0.3": { status: "pending" }, "task-0.4": { status: "pending" } };
    events = [];
    fresh = [];
  };
  reset();

  const started = (agent: string, task: string, message: string): RunEvent => emit({ event_type: "agent-started", agent_id: agent, task_id: `epic-0/${task}`, phase_id: "execution", message });
  const progress = (agent: string, task: string, message: string): RunEvent => emit({ event_type: "agent-progress", agent_id: agent, task_id: `epic-0/${task}`, phase_id: "execution", message });
  const finished = (agent: string, task: string): RunEvent => emit({ event_type: "agent-done", agent_id: agent, task_id: `epic-0/${task}`, phase_id: "execution" });
  const wrote = (agent: string, path: string): RunEvent => emit({ event_type: "artifact-written", agent_id: agent, artifact_path: path });
  const set = (task: string, status: ItemStatus, extra: Partial<SimItem> = {}): void => {
    items[task] = { status, ...(extra.reason ? { reason: extra.reason } : {}), ...(extra.artifacts ? { artifacts: extra.artifacts } : {}) };
  };

  /** A história: cada passo mexe no estado e grava eventos, como os agentes e o StateCommands fariam. */
  const BEATS: Array<() => void> = [
    () => undefined,
    () => (set("task-0.2", "in-progress"), started("@migration-agent", "task-0.2", `semeando repos/${BRAND.name}`)),
    () => (set("task-0.4", "in-progress"), started("@test-backfill-agent", "task-0.4", "golden master do gerador")),
    () => progress("@migration-agent", "task-0.2", "trazendo o kit para dentro da colônia nova"),
    () => wrote("@migration-agent", SEED_REPORT),
    () => (set("task-0.3", "in-progress"), started("@reviewer", "task-0.3", "revisando o primeiro PR")),
    () => emit({ event_type: "decision-requested", task_id: "epic-0/task-0.1", actor: "human", message: "titularidade do código", metadata: { reason: "titularidade" } }),
    () => progress("@test-backfill-agent", "task-0.4", "pinando os cenários do CLI"),
    () => wrote("@test-backfill-agent", GOLDEN_REPORT),
    () => (set("task-0.4", "blocked", { reason: "bloqueada por T0.2" }), emit({ event_type: "blocked", agent_id: "@test-backfill-agent", task_id: "epic-0/task-0.4", phase_id: "execution", message: "bloqueada por T0.2" })),
    () => (set("task-0.2", "done", { artifacts: [SEED_REPORT] }), finished("@migration-agent", "task-0.2")),
    () => emit({ event_type: "decision-made", task_id: "epic-0/task-0.1", actor: "human", by: "Pessoa Fictícia", message: "titular definido" }),
    () => (set("task-0.4", "in-progress"), started("@test-backfill-agent", "task-0.4", "retomando o golden master")),
    () => progress("@reviewer", "task-0.3", "conferindo a cobertura"),
    () => set("task-0.3", "failed", { reason: "suíte de testes caiu" }),
    () => (set("task-0.3", "in-progress"), started("@reviewer", "task-0.3", "tentando de novo")),
    () => wrote("@reviewer", REVIEW_REPORT),
    () => (set("task-0.3", "done", { artifacts: [REVIEW_REPORT] }), finished("@reviewer", "task-0.3")),
    () => (set("task-0.4", "done", { artifacts: [GOLDEN_REPORT] }), finished("@test-backfill-agent", "task-0.4")),
    () => undefined,
    () => undefined,
  ];

  const initiatives = (): Initiative[] => [
    missaoInitiative({ epic_status: { "epic-0": { status: "in-progress", items: { ...items } } } }),
    hotfixInitiative(),
  ];

  const deliverSnapshot = (): void => {
    const payload = buildColmeiaSnapshot({ initiatives: initiatives(), active, events: active === MISSAO_ID ? events : [] });
    options.deliver({ type: "shell/snapshot", seq: seq++, generatedAt: new Date(now()).toISOString(), payload });
  };
  /** Como o host: o snapshot primeiro e, logo depois, o `runEvents-append` com os eventos novos (que já estão na janela do snapshot). */
  const deliver = (): void => {
    deliverSnapshot();
    if (fresh.length > 0) options.deliver({ type: "shell/runEvents-append", seq: seq++, payload: fresh });
    fresh = [];
  };

  const run = (): void => {
    if (beat >= BEATS.length) {
      beat = 0;
      reset();
    } else {
      BEATS[beat]!();
      beat += 1;
    }
  };

  return {
    step() {
      run();
      deliver();
    },
    advance(count) {
      for (let i = 0; i < count; i++) run();
      deliver();
    },
    snapshot: deliverSnapshot,
    switchTo(id) {
      active = id;
      deliver();
    },
    get beat() {
      return beat;
    },
  };
}
