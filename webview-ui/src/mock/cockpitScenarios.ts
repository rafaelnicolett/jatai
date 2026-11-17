/**
 * cockpitScenarios.ts — cenários do Cockpit para o sanity check visual (mock),
 * um por estado que a tela precisa mostrar: bloqueado, falhou, cancelado,
 * decisões esperando, os vazios, o erro e a Descoberta. Escolhidos por
 * `mock.html?scenario=<id>`; sem o parâmetro, o mock segue o comportamento de
 * sempre (`buildMockSnapshot()` + um toast).
 *
 * Todo dado passa pelos MESMOS parsers do host (`buildSnapshot`): nenhum objeto
 * de estado é inventado à mão, e os nomes e dados são fictícios. O único
 * cenário que foge disso é `erro`, que corrompe de propósito um item já
 * parseado, para mostrar a tela de falha (G9).
 *
 * Nunca importado pelo `main.tsx` de produção (só `mock-main.tsx` e testes).
 */
import type { CockpitSnapshot, DataSourceIssue } from "@shared/cockpit-protocol";
import type { PersistedUIState } from "../store/PersistedUIState";
import { buildMockSnapshot } from "./mockData";
import { buildSnapshot } from "./snapshotBuilder";

export interface CockpitScenario {
  id: string;
  title: string;
  /** O que a captura deve mostrar, em uma frase. */
  about: string;
  /** `null`: o host nunca responde (o Cockpit fica conectando e, passado o prazo, explica a espera). */
  snapshot: (() => CockpitSnapshot) | null;
  /** Aviso que o host manda antes (ou no lugar) do snapshot: "nenhuma pasta aberta". */
  degraded?: DataSourceIssue;
  /** O que o webview já tinha salvo: a visão escolhida. */
  persisted?: PersistedUIState;
}

const REPOS = `version: 1
repos:
  - id: api
    source: local-path
    path: repos/api
    has_frontend: false
`;

/** O repositório "api" com as cinco fases do Foundation prontas e o D1 aprovado. */
const FOUNDATION_D1_APPROVED = `version: 2
repos:
  api:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", human_checklist: {} }
      arch: { status: done, agent: "@arch-discoverer", human_checklist: {} }
      coding-archaeology: { status: done, agent: "@coding-archaeologist", human_checklist: {} }
      quality: { status: done, agent: "@quality-auditor", human_checklist: {} }
      debt: { status: done, agent: "@debt-analyst", human_checklist: {} }
    gate_d1:
      status: approved
phases: {}
`;

const EPICS = ["epic-0: Isolar o módulo de pagamentos", "epic-1: Contrato da API"];

interface ModernizationInit {
  id: string;
  name: string;
  epicStatus?: string;
  d3?: boolean;
}

/** Uma modernização com D1 e D2 aprovados (e o roadmap e a matriz de risco também). */
function modernizationYaml({ id, name, epicStatus, d3 }: ModernizationInit): string {
  const lines = [
    `- id: ${id}`,
    `  name: ${JSON.stringify(name)}`,
    `  status: in-progress`,
    `  type: modernization`,
    `  mode: brownfield`,
    `  scope: [api]`,
    `  epics:`,
    ...EPICS.map((e) => `    - ${JSON.stringify(e)}`),
    `  roadmap_gate: { status: approved }`,
    `  risk_matrix_gate: { status: approved }`,
    `  gate_d2: { status: approved, human_approved_at: "2026-11-10T12:00:00Z", by: "Pessoa Fictícia" }`,
  ];
  if (d3) lines.push(`  gate_d3: { status: approved, human_approved_at: "2026-11-16T12:00:00Z", by: "Pessoa Fictícia" }`);
  if (epicStatus) {
    lines.push("  epic_status:");
    for (const l of epicStatus.split("\n")) lines.push(`    ${l}`);
  }
  return lines.join("\n");
}

const HOTFIX_YAML = [
  "- id: hotfix-juros",
  `  name: "Corrigir o cálculo de juros"`,
  "  status: in-progress",
  "  type: hotfix",
  "  mode: brownfield",
  "  waves:",
  `    - "wave-1: Reproduzir o erro"`,
  `    - "wave-2: Corrigir e cobrir com teste"`,
].join("\n");

const FEATURE_YAML = [
  "- id: feat-extrato",
  `  name: "Extrato em PDF"`,
  "  status: in-progress",
  "  type: feature",
  "  mode: greenfield",
  "  epics:",
].join("\n");

const initiativesYaml = (active: string, blocks: string[]): string =>
  `active: ${active}\ninitiatives:\n${blocks.map((b) => b.split("\n").map((l) => `  ${l}`).join("\n")).join("\n")}\n`;

const ago = (seconds: number): string => new Date(Date.now() - seconds * 1000).toISOString();

const agentWorking = () => ({
  run_id: "r1",
  event_type: "agent-started",
  timestamp: ago(25),
  initiative_id: "mod-pagamentos",
  agent_id: "migration-agent",
  task_id: "epic-0/task-2",
  message: "escrevendo os testes de caracterização",
});

const decisionRequested = () => ({
  run_id: "r5",
  event_type: "decision-requested",
  timestamp: ago(90),
  initiative_id: "mod-pagamentos",
  task_id: "epic-0/task-9",
  message: "titularidade do código",
  metadata: { reason: "antes de licenciar como MIT" },
});

/** Todas as condições de uma tarefa num só épico: feita, trabalhando, na fila, bloqueada, falhou, cancelada e a que espera aprovação. */
const EPIC_WITH_EVERY_CONDITION = `epic-0:
  status: in-progress
  items:
    task-1: { status: done, summary: "Isolar o módulo em um pacote", commit: "a1b2c3d", completed_at: "2026-11-12T15:30:00Z", artifacts: ["docs/pagamentos/isolamento.md"] }
    task-2: { status: in-progress, summary: "Cobrir o cálculo de juros com testes de caracterização" }
    task-3: { status: pending, summary: "Extrair a regra de arredondamento" }
    task-4: { status: blocked, summary: "Trocar o gateway pelo adaptador", reason: "bloqueada por task-3" }
    task-5: { status: failed, summary: "Validar o contrato com o cliente da API", reason: "o teste de contrato caiu" }
    task-6: { status: cancelled, summary: "Migrar o relatório legado", reason: "escopo cortado pelo dono" }
    task-7: { status: done, requires_approval: true, summary: "Remover a duplicação do cálculo de taxas" }`;

/** Todas as tarefas fechadas: o D3 espera, e há uma tarefa para aprovar. */
const EPIC_CLOSED = `epic-0:
  status: done
  items:
    task-1: { status: done, summary: "Isolar o módulo em um pacote", commit: "a1b2c3d", completed_at: "2026-11-12T15:30:00Z" }
    task-2: { status: done, summary: "Cobrir o cálculo de juros com testes de caracterização" }
    task-3: { status: done, requires_approval: true, summary: "Remover a duplicação do cálculo de taxas" }`;

function modernization(options: { epicStatus: string; events?: Array<Record<string, unknown>>; extra?: string[]; active?: string }): CockpitSnapshot {
  return buildSnapshot({
    reposYaml: REPOS,
    foundationYaml: FOUNDATION_D1_APPROVED,
    initiativesYaml: initiativesYaml(options.active ?? "mod-pagamentos", [modernizationYaml({ id: "mod-pagamentos", name: "Modernização de pagamentos", epicStatus: options.epicStatus }), ...(options.extra ?? [])]),
    events: options.events ?? [],
  });
}

/** A modernização completa com um item de épico corrompido: a derivação do quadro lança, e a tela mostra o erro (G9). */
function corrupted(): CockpitSnapshot {
  const snapshot = modernization({ epicStatus: EPIC_WITH_EVERY_CONDITION });
  const initiative = snapshot.initiatives!.initiatives[0]!;
  // Um item nulo: nenhum parser real o produz, e a derivação do quadro lança ao lê-lo.
  initiative.epic_status = { "epic-0": { status: "in-progress", items: { "task-1": null as never } } };
  return snapshot;
}

export const COCKPIT_SCENARIOS: Record<string, CockpitScenario> = {
  execucao: {
    id: "execucao",
    title: "Execução com todas as condições",
    about: "Uma modernização em execução: tarefa feita, trabalhando, na fila, bloqueada, falhou, cancelada e uma que espera aprovação; um agente trabalhando e uma decisão pedida.",
    snapshot: () => modernization({ epicStatus: EPIC_WITH_EVERY_CONDITION, events: [agentWorking(), decisionRequested()] }),
  },
  decisoes: {
    id: "decisoes",
    title: "Três decisões esperando, o gate primeiro",
    about: "Todas as tarefas fechadas: o D3 espera, há uma tarefa para aprovar e um agente pediu uma decisão.",
    snapshot: () => modernization({ epicStatus: EPIC_CLOSED, events: [decisionRequested()] }),
  },
  "em-dia": {
    id: "em-dia",
    title: "Nada espera você",
    about: "Uma modernização em andamento sem nenhuma decisão pendente.",
    snapshot: () => modernization({ epicStatus: "epic-0:\n  status: in-progress\n  items:\n    task-1: { status: in-progress, summary: \"Isolar o módulo em um pacote\" }\n    task-2: { status: pending, summary: \"Extrair a regra de arredondamento\" }", events: [agentWorking()] }),
  },
  descoberta: {
    id: "descoberta",
    title: "Descoberta do workspace",
    about: "A Foundation de vários repositórios: um D1 por repositório, fases em revisão e uma fase bloqueada.",
    snapshot: buildMockSnapshot,
  },
  "outra-iniciativa": {
    id: "outra-iniciativa",
    title: "Vendo uma iniciativa que não é a ativa",
    about: "A ativa é a modernização; a tela mostra o hotfix. A nota diz isso e oferece \"Tornar ativa\".",
    snapshot: () => modernization({ epicStatus: EPIC_WITH_EVERY_CONDITION, extra: [HOTFIX_YAML] }),
    persisted: { activeTab: "live-progress", collapsedSections: {}, viewTarget: { kind: "initiative", id: "hotfix-juros" } },
  },
  "sem-detalhe": {
    id: "sem-detalhe",
    title: "Iniciativa sem detalhe carregado",
    about: "Uma feature que não é a ativa: o registro só sabe o nome e o tipo, e a nota avisa que o detalhe das fases só carrega para a ativa.",
    snapshot: () => modernization({ epicStatus: EPIC_WITH_EVERY_CONDITION, extra: [FEATURE_YAML] }),
    persisted: { activeTab: "live-progress", collapsedSections: {}, viewTarget: { kind: "initiative", id: "feat-extrato" } },
  },
  "sem-iniciativa": {
    id: "sem-iniciativa",
    title: "Sem nenhuma iniciativa",
    about: "Projeto novo: o Cockpit explica e oferece \"Nova iniciativa\".",
    snapshot: () => buildSnapshot({ mode: "greenfield" }),
  },
  "sem-foundation": {
    id: "sem-foundation",
    title: "Sem Foundation",
    about: "Workspace brownfield sem nenhum repositório mapeado: a Descoberta ainda não começou.",
    snapshot: () => buildSnapshot({ mode: "brownfield" }),
  },
  "sem-pasta": {
    id: "sem-pasta",
    title: "Sem pasta aberta",
    about: "O host avisa que o editor não tem pasta aberta.",
    snapshot: null,
    degraded: { source: "workspace", message: "Nenhuma pasta aberta no editor." },
  },
  conectando: {
    id: "conectando",
    title: "Conectando",
    about: "Antes do primeiro snapshot (o host ainda não respondeu).",
    snapshot: null,
  },
  espera: {
    id: "espera",
    title: "Sem resposta do State Service",
    about: "Passado o prazo sem snapshot, a tela explica e oferece \"Tentar de novo\". Capturar depois de 9 segundos.",
    snapshot: null,
  },
  erro: {
    id: "erro",
    title: "Falha ao montar a tela",
    about: "Um snapshot corrompido de propósito: a falha fica na tela, com o motivo e \"Tentar de novo\", e a barra segue viva.",
    snapshot: corrupted,
  },
};

/** O cenário escolhido por `?scenario=<id>`; `null` quando não há parâmetro (o mock segue como sempre) ou o id não existe. */
export function scenarioFromSearch(search: string): CockpitScenario | null {
  const id = new URLSearchParams(search).get("scenario");
  return id ? (COCKPIT_SCENARIOS[id] ?? null) : null;
}
