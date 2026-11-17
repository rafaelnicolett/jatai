/**
 * mockData.ts — SÓ para o harness de sanity check visual (`mock-main.tsx`).
 * Nunca importado por `main.tsx` (produção) — não entra no bundle real.
 *
 * Constrói o `CockpitSnapshot` a partir de STRINGS YAML/JSONL realistas,
 * passadas pelos mesmos parsers puros que o host de verdade usa
 * (`parseReposYaml`, `parseFoundationState`, `parseRunEvents`), e deriva o
 * resto com as MESMAS funções de produção (`buildFoundationPlan`,
 * `deriveActivity`) — não é um objeto inventado à mão, é o pipeline real
 * alimentado com dado de mentira.
 */

import {
  parseReposYaml,
  parseFoundationState,
  parseRunEvents,
  buildFoundationPlan,
  deriveActivity,
  parseDeliveryState,
  parseSprintBacklog,
  buildDeliveryPlan,
  describeEvent,
  NOTIFICATION_HISTORY_EVENT_TYPES,
} from "@data";
import type { CockpitSnapshot, CockpitNotification, NotificationKind } from "@shared/cockpit-protocol";

const REPOS_YAML = `
version: 1
repos:
  - id: billing-api
    source: git
    url: git@github.com:acme/billing-api.git
    scan_profile: deep
    pinned_sha: a3f9c21
    stack: java-spring
    arch_current: layered-mvc
    arch_confidence: 82
    has_history: true
    has_frontend: false
  - id: claims-svc
    source: git
    url: git@github.com:acme/claims-svc.git
    scan_profile: deep
    pinned_sha: c88e410
    stack: python-fastapi
    has_history: true
    has_frontend: false
  - id: legacy-erp
    source: local-path
    path: /repos/legacy-erp
    scan_profile: shallow
    stack: dotnet-webforms
    arch_current: big-ball-of-mud
    arch_confidence: 55
    has_history: false
    has_frontend: true
`;

const FOUNDATION_STATE_YAML = `
version: 2
repos:
  billing-api:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", completed_at: "2026-07-19T10:00:00Z", human_checklist: { stack-identified: true } }
      arch: { status: done, agent: "@arch-discoverer", completed_at: "2026-07-19T10:30:00Z", human_checklist: {} }
      coding-archaeology: { status: done, completed_at: "2026-07-19T11:00:00Z", human_checklist: {} }
      quality: { status: done, completed_at: "2026-07-19T11:30:00Z", human_checklist: {} }
      debt: { status: done, completed_at: "2026-07-20T12:00:00Z", human_checklist: {} }
    findings_summary: { critical: 2, high: 5, medium: 11, low: 8 }
    gate_d1: { status: approved, approved_at: "2026-07-20T12:30:00Z" }
  claims-svc:
    phases:
      tech-stack: { status: done, agent: "@tech-mapper", completed_at: "2026-07-20T09:00:00Z", human_checklist: {} }
      arch: { status: in-progress, agent: "@arch-discoverer", human_checklist: {} }
      coding-archaeology: { status: pending, human_checklist: {} }
      quality: { status: pending, human_checklist: {} }
      debt: { status: pending, human_checklist: {} }
    findings_summary: { critical: 0, high: 1, medium: 3, low: 2 }
    gate_d1: { status: pending }
  legacy-erp:
    phases:
      tech-stack: { status: done, completed_at: "2026-07-20T08:00:00Z", human_checklist: {} }
      arch: { status: done, agent: "@arch-discoverer", completed_at: "2026-07-20T09:00:00Z", human_checklist: {} }
      coding-archaeology: { status: done, completed_at: "2026-07-20T10:00:00Z", human_checklist: {} }
      design: { status: done, agent: "@design-archaeologist", completed_at: "2026-07-20T10:30:00Z", human_checklist: {} }
      quality: { status: done, completed_at: "2026-07-20T11:00:00Z", human_checklist: {} }
      debt: { status: done, completed_at: "2026-07-20T12:00:00Z", human_checklist: {} }
    findings_summary: { critical: 6, high: 14, medium: 20, low: 9 }
    gate_d1: { status: pending }
phases: {}
`;

// Lente de Delivery — iniciativa "modernize-billing" já graduada do Discovery.
// Formato intencionalmente "sujo" numa fase (agent-name em vez de phaseId
// canônico) — o mesmo tipo de divergência já visto em produção.
const DELIVERY_STATE_YAML = `
phases:
  business: { status: done, agent: "@business", completed_at: "2026-07-15T10:00:00Z", human_checklist: {} }
  product: { status: done, agent: "@product", completed_at: "2026-07-16T10:00:00Z", human_checklist: {} }
  ux-design: { status: done, agent: "@ux-designer", completed_at: "2026-07-16T14:00:00Z", human_checklist: {} }
  domain-modeler: { status: done, agent: "@domain-modeler", completed_at: "2026-07-17T09:00:00Z", human_checklist: {} }
  bdd: { status: done, agent: "@bdd", completed_at: "2026-07-17T15:00:00Z", human_checklist: {} }
  architecture: { status: done, agent: "@architecture", completed_at: "2026-07-18T11:00:00Z", human_checklist: {} }
  sprint-plan: { status: done, agent: "@sprint-planner", completed_at: "2026-07-19T09:00:00Z", human_checklist: {} }
  sprint-run: { status: in-progress, agent: "@sprint-runner", human_checklist: {} }
`;

const SPRINT_BACKLOG_YAML = `
meta:
  product: Acme Billing
  total_sprints: 2
  sprint_duration_weeks: 2
sprints:
  - id: S1
    name: "Modernização do billing"
    goal: "Migrar cobrança recorrente para o novo modelo de assinatura"
    priority: P0
    items:
      - id: S1-BKD-01
        title: "Endpoint de criação de assinatura"
        status: done
        component: backend
        story_points: 5
      - id: S1-BKD-02
        title: "Migração de dados de clientes legados"
        status: in-progress
        component: backend
        feature: "Assinaturas"
        size: M
        story_points: 8
        tags: ["migration", "risco-alto"]
      - id: S1-FE-01
        title: "Tela de gestão de assinatura"
        status: review
        component: frontend
        story_points: 3
        depends_on: ["S1-BKD-01"]
      - id: S1-BKD-03
        title: "Webhook de cobrança recusada"
        status: blocked
        component: backend
        story_points: 3
        blocked_reason: "Aguardando credenciais do gateway de pagamento"
      - id: S1-FE-02
        title: "Notificação de cobrança recusada"
        status: backlog
        component: frontend
        story_points: 2
`;

const RUN_EVENTS_JSONL = [
  { run_id: "r1", event_type: "agent-started", timestamp: "2026-07-21T01:25:00Z", phase_id: "arch", agent_id: "@arch-discoverer", repo_id: "claims-svc", message: "Lendo 42 módulos…" },
  { run_id: "r1", event_type: "agent-progress", timestamp: "2026-07-21T01:27:00Z", phase_id: "arch", agent_id: "@arch-discoverer", repo_id: "claims-svc", message: "Mapeando camadas e dependências…" },
  { run_id: "r2", event_type: "agent-done", timestamp: "2026-07-21T00:48:00Z", phase_id: "arch", agent_id: "@arch-discoverer", repo_id: "legacy-erp", message: "Arquitetura mapeada — confiança baixa, revisar" },
  { run_id: "r3", event_type: "blocked", timestamp: "2026-07-21T00:23:00Z", phase_id: "coding-archaeology", agent_id: "@archaeologist", repo_id: "legacy-erp", message: "Sem acesso ao histórico git — repo é snapshot sem .git" },
  { run_id: "r4", event_type: "artifact-written", timestamp: "2026-07-20T12:00:00Z", phase_id: "debt", repo_id: "billing-api", message: "tech-debt.md gravado" },
  { run_id: "r4", event_type: "gate-approved", timestamp: "2026-07-20T12:30:00Z", phase_id: "debt", agent_id: "@assessor", repo_id: "billing-api", message: "Gate D1 aprovado" },
  // Garfo real do Delivery — backend e frontend rodando ao mesmo tempo (exercita o agrupamento paralelo do VerticalFlow, não só a ordem sequencial).
  { run_id: "r5", event_type: "agent-started", timestamp: "2026-07-21T09:12:00Z", phase_id: "backend", agent_id: "@backend-python-api", message: "Gerando endpoints a partir de api/openapi.yaml…" },
  { run_id: "r5", event_type: "agent-progress", timestamp: "2026-07-21T09:16:00Z", phase_id: "backend", agent_id: "@backend-python-api", message: "8/11 endpoints com testes passando" },
  { run_id: "r6", event_type: "agent-started", timestamp: "2026-07-21T09:12:05Z", phase_id: "frontend", agent_id: "@frontend-react", message: "Consumindo o contrato gerado pelo backend…" },
  // Onda 2 — espelha a aprovação humana do item-1.1 (ver `wave_status` acima) na central de notificações.
  { run_id: "human", event_type: "item-approved", timestamp: "2026-07-28T14:00:00Z", phase_id: "wave-1", agent_id: "você", repo_id: "legacy-erp", message: "item-1.1 aprovado" },
].map((e) => JSON.stringify(e)).join("\n");

export function buildMockSnapshot(): CockpitSnapshot {
  const { inventory: reposInventory } = parseReposYaml(REPOS_YAML);
  const foundationState = parseFoundationState(FOUNDATION_STATE_YAML);
  const runEvents = parseRunEvents(RUN_EVENTS_JSONL);
  const liveActivity = deriveActivity(runEvents);
  const foundationPlan = buildFoundationPlan(reposInventory, foundationState, liveActivity);

  const deliveryState = parseDeliveryState(DELIVERY_STATE_YAML);
  const sprintBacklog = parseSprintBacklog(SPRINT_BACKLOG_YAML);
  const deliveryPlan = buildDeliveryPlan(deliveryState, sprintBacklog, liveActivity);

  // Mesma classificação que `CockpitNextController` usa em produção (Onda 2)
  // — não um filtro inventado só pro mock.
  const notifications: CockpitNotification[] = runEvents
    .filter((e) => NOTIFICATION_HISTORY_EVENT_TYPES.has(e.event_type))
    .map((e) => ({
      id: `${e.timestamp}-${e.event_type}-${e.repo_id ?? ""}-${e.phase_id ?? ""}`,
      kind: e.event_type as NotificationKind,
      text: describeEvent(e),
      timestamp: e.timestamp,
    }))
    .reverse();

  return {
    config: {
      version: "1",
      project: { name: "Acme", slug: "acme", mode: "brownfield" },
      host_adapter: "claude",
    },
    configured: true,
    operations: { devops: null, observability: null, incidents: null, sustain: null },
    reposInventory,
    foundationState,
    foundationPlan,
    liveActivity,
    runEvents,
    contextRepos: null,
    repoGraph: null,
    initiatives: {
      active: "mod-legacy-erp-modularize",
      initiatives: [
        { id: "modernize-billing", name: "Modernizar Billing", status: "in-progress", mode: "brownfield", depends_on: [] },
        { id: "new-loyalty-app", name: "App de Fidelidade (novo)", status: "planned", mode: "greenfield" },
        {
          id: "mod-legacy-erp-modularize",
          name: "legacy-erp → módulos hexagonais",
          status: "in-progress",
          mode: "brownfield",
          type: "modernization",
          scope: ["legacy-erp"],
          arch_target: "hexagonal",
          driven_by: ["debt-legacy-erp-01", "debt-legacy-erp-02"],
          waves: [
            "wave-1: fundação (characterization tests, CI verde, cobertura mínima 60% no módulo de faturamento)",
            "wave-2: quebra de ciclo (Anti-Corruption Layer, contrato versionado com legacy-erp, testes de contrato) — bloqueia todo o resto até o ciclo ser quebrado",
            "wave-3: extração de domínio (Branch by Abstraction, interface de faturamento, dual-run, remoção do código legado)",
          ],
          // Exemplo de execution real — cobre os 3 estados do botão "Aprovar" (Onda 1):
          // item-1.1 já aprovado, item-1.2 concluído mas arriscado (aguarda você),
          // item-1.3 concluído sem risco (aprova em 1 clique, sem checkbox).
          wave_status: {
            "wave-1": {
              status: "in-progress",
              items: {
                "item-1.1": {
                  status: "done",
                  repo: "legacy-erp",
                  completed_at: "2026-07-28T10:00:00Z",
                  summary: "Characterization tests do módulo de faturamento — 42 casos, suite verde.",
                  commit: "4a2cf26",
                  human_approved_at: "2026-07-28T14:00:00Z",
                  // Onda 4 (Mecanismo M) — "promessa cumprida": o chip mostra o artefato, o botão de diff pede o git real ao host.
                  artifacts: ["code/services/legacy-erp/tests/billing.characterization.spec.ts"],
                },
                "item-1.2": {
                  status: "done",
                  repo: "legacy-erp",
                  completed_at: "2026-07-29T09:00:00Z",
                  summary: "CI verde no pipeline principal.",
                  commit: "9bd31aa",
                  known_bugs_pinned: ["Timeout intermitente no job de integração — não bloqueia merge, monitorar"],
                  merge_block: "aguarda confirmação de rollback testado em staging",
                },
                "item-1.3": {
                  status: "done",
                  repo: "legacy-erp",
                  completed_at: "2026-07-29T16:00:00Z",
                  summary: "Cobertura do módulo de faturamento em 63% — acima da meta de 60%.",
                  commit: "1e77c40",
                },
              },
            },
          },
        },
      ],
    },
    deliveryState,
    deliveryPlan,
    sprintBacklog,
    kitStatus: { installed: "0.6.4", current: "0.6.5", legacyConfigName: false, outdated: true },
    warnings: [],
    approvalFrictionFields: ["merge_block", "known_bugs_pinned"],
    deliveryHierarchy: "legacy",
    notifications,
    // Anterior à aprovação do item-1.1 (28/07) — só ela conta como não-lida, pra exercitar o badge sem zerar tudo.
    notificationsLastSeenAt: "2026-07-25T00:00:00Z",
  };
}
