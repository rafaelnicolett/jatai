# Agents — {{brand.displayName}} Brownfield

> Este repositório recebeu a estrutura agêntica do **{{brand.displayName}} em modo Brownfield**.
> O projeto **já existe** — agentes operam em **3 streams sequenciais** com
> **3 gates de aprovação**, garantindo que toda mudança seja informada,
> incremental e reversível.

## Fluxo

```
DISCOVERY ──D1──► PLANNING ──D2──► EXECUTION ──D3──► OPERATION
```

- **Discovery** entende o que existe (read-only)
- **Planning** decide o que mudar (roadmap, ADRs, risco)
- **Execution** implementa (test backfill → refactor → migration → feature)
- **Operation** opera (CI/CD, observability, incident, sustain)

## Como usar

Comece sempre pelo agente orquestrador `{{brand.name}}`, nos dois harnesses:

- **Claude Code:** chame `@{{brand.name}}` (`.claude/agents/{{brand.files.orchestratorAgent}}`);
- **GitHub Copilot:** escolha o agente `{{brand.name}}` no seletor de agentes do chat
  (`.github/agents/{{brand.files.orchestratorAgent}}`).

Depois digite a intenção (ex.: _"mapear projeto"_, _"planejar modernização"_,
_"refatorar OrderService"_, _"migrar para Spring Boot 3"_). O `{{brand.name}}`
valida pré-requisitos e roteia para o agente certo.

## Agentes instalados (16)

### L0 — Orquestrador
- `@{{brand.name}}` — agente orquestrador, único ponto de entrada

### Discovery (9)
| Agente | Output |
|---|---|
| `@assessor` | `assessment/report.md` (consolidado) |
| `@tech-mapper` | `tech-radar.md` |
| `@arch-discoverer` | `arch-discovery.md` |
| `@domain-extractor` | `domain-map.md` |
| `@quality-auditor` | `quality-report.md` |
| `@security-auditor` | `security-report.md` |
| `@test-coverage-mapper` | `coverage-gaps.md` |
| `@debt-analyst` | `tech-debt.md` |
| `@maturity-assessor` | `maturity-scorecard.md` + `maturity-<framework>.md` (opt-in via wizard) |

### Planning (3)
| Agente | Output |
|---|---|
| `@modernization-planner` | `modernization-roadmap.md` |
| `@risk-prioritizer` | `risk-matrix.md` |
| `@adr-recorder` | `docs/adr/0000-*.md` |

### Execution (4)
| Agente | Output |
|---|---|
| `@test-backfill-agent` | testes + report |
| `@refactor-agent` | PRs (Fowler recipes) |
| `@migration-agent` | PRs (Expand-Contract) |
| `@feature-adder` | PRs (feature + tests) |

## Skills instaladas

### Brownfield-specific (descoberta, planejamento, execução segura)
- `tech-stack-detection` — heurísticas para detectar stack
- `arch-pattern-detection` — heurísticas para inferir arquitetura
- `domain-extraction-from-code` — engenharia reversa de domínio
- `code-quality-audit` — métricas, hotspots (Adam Tornhill)
- `tech-debt-mapping` — quadrante Fowler + juros
- `legacy-modernization-patterns` — Strangler Fig, BBA, ACL, Parallel Run, Expand-Contract
- `characterization-testing` — Michael Feathers (pin behavior)
- `safe-refactoring-recipes` — Fowler 2nd ed.
- `version-migration-playbook` — Java/Spring/Python/Node/.NET upgrades

### Maturity frameworks (opt-in via wizard, consumidas por `@maturity-assessor`)
- `maturity-dora-4keys` — 4 métricas DORA (lightweight, default)
- `maturity-tech-radar` — ThoughtWorks-style radar (lightweight)
- `maturity-spotify-health` — Squad Health Check (lightweight)
- `maturity-dora-capabilities` — 24 capabilities DORA (mid)
- `maturity-owasp-samm` — OWASP SAMM v2 (mid)
- `maturity-owasp-asvs` — OWASP ASVS L1/L2/L3 (mid)
- `maturity-iso-25010` — ISO/IEC 25010 qualidade (mid)
- `maturity-space-devex` — SPACE framework (mid)
- `maturity-cmmi` — CMMI 5 levels (heavyweight)
- `maturity-bsimm` — BSIMM benchmark (heavyweight)

### Greenfield reutilizadas
- `codebase-enrichment`, `domain-driven-design`, `coding-guidelines`
- `bdd-gherkin`, `qa-strategy`, `integration-testing`
- `security-best-practices`, `security-cve-checker`
- `commit-assistant`, `workflow-memory`, `task-manager`, `docs-writer`
- Arquiteturais: `arch-clean-frontend`, `arch-ddd-tactical`, `arch-feature-based`,
  `arch-hexagonal`, `arch-layered`, `arch-mvc`, `arch-mvvm`, `arch-vertical-slice`

Skills são carregadas **sob demanda** — apenas quando o agente ativo as declara
em `uses_skills`.

## Gates de aprovação

| Gate | Disparado por | Bloqueia | Artefato de aprovação |
|---|---|---|---|
| **D1** | Conclusão de Discovery | Planning sem assessment | `gates/repos/<id>/D1-approved.md` (por repo) + `gates/D1-approved.md` (rollup) |
| **D2** | Conclusão de Planning | Execution sem roadmap | `gates/D2-approved.md` |
| **D3** | Conclusão de Execution | Deploy sem PR mergeado | `gates/D3-approved.md` |

> **D1 é por repositório.** Cada repo fecha o seu assim que termina o Discovery —
> um repo grande nunca trava os outros. O D1 **global** é derivado: fecha sozinho
> quando todo repo `scan_profile ≠ ignore` tem `gate_d1: approved` **e** o domínio
> (cross-repo) está `done`.

## Execução multi-repo

### Conform — a regra que vale para todo agente de execução

> **Escreva no padrão descoberto do repositório.** Se o padrão for inadequado,
> **não refatore** — registre o achado e sugira uma iniciativa `modernization`.

Sem isso escrito, vaza na prática: o modelo tem viés forte de "melhorar" código —
ainda mais com o assessment gritando que aquilo é ruim. O resultado seria uma IA
que documenta a dívida e depois a reproduz, ou pior: metade do repositório
migrado e ninguém sabendo qual regra vale onde.

A composição que faz o agente escrever certo em cada lugar:

```
executor = @<contexto>                    ← a regra de negócio (domínio)
         + coding-guidelines-<repo-alvo>  ← como escrever NAQUELE repo
         + @backend-<stack-do-repo>       ← quem sabe a stack
```

A stack vem do **`repos.yaml`**, por repositório — não existe "a stack do
projeto". `billing-api` pode ser Spring MVC e `claims-svc` hexagonal em Node.

### Uma tarefa, N repositórios

Uma iniciativa pode tocar vários repositórios. Nesse caso:

- **Um PR por repositório** — nunca um PR atravessando repos.
- **Ordem importa**: contrato antes do consumidor (quem publica a API/evento vai primeiro).
- **D3 espera todos** — a iniciativa só fecha quando todos os PRs mergearem.
- A revisão do PR (humana, no gate D3) usa a **rubrica do repositório**:
  não se revisa um Spring MVC legado com rubrica hexagonal.

### Lock de modernização

Enquanto uma iniciativa `type: modernization` estiver ativa, **nenhuma iniciativa
nova pode ser aberta sobre os repositórios do `scope` dela**. Durante a migração o
repositório vive em dois padrões ao mesmo tempo, e uma `feature` entrando no meio
não saberia qual seguir.

O lock é **pelo `scope`**, nunca global — uma modernização em `billing-api` não
trava `claims-svc`.

```yaml
# initiatives.yaml
- id: mod-billing-hexagonal
  type: modernization
  status: in-progress
  scope: [billing-api]          # ← trava SOMENTE estes repos
  arch_target: hexagonal        # ← o alvo mora aqui, nunca em repos.yaml
  driven_by: [debt-042, debt-017]
```

Antes de abrir qualquer iniciativa, o `{{brand.name}}` verifica se algum repo do
`scope` pretendido está travado por uma `modernization` ativa. Se estiver:
bloqueie e explique qual iniciativa está segurando.

## Inventário de repositórios (`repos.yaml`)

Um workspace brownfield aponta para **N repositórios**. **One repo é multi repo
com N=1** — sempre lista, sempre `repos.yaml`, sempre `repos/<id>/`. Nunca
existe caminho especial para um único repo.

`.github/artifacts/repos.yaml` é o inventário e o manifesto de re-hidratação
(a pasta `repos/` é gitignored — só o manifesto sobrevive ao clone do workspace):

```yaml
version: 1
repos:
  - id: billing-api            # kebab-case, único — vira repos/<id>/ e chave dos artefatos
    source: git                # git | local-path
    url: git@github.com:acme/billing-api.git
    ref: main
    scan_profile: deep         # deep | shallow | ignore
    owner: time-financeiro
    # ── preenchidos pelo assessment — NÃO declarar à mão ──
    pinned_sha: a3f9c21        # commit assessado (gravado no clone)
    stack: java-spring         # ← @tech-mapper
    arch_current: layered-mvc  # ← @arch-discoverer (o que o repo É hoje)
    arch_confidence: 82        # ← @arch-discoverer (%)

  - id: legacy-erp
    source: local-path         # já está no disco — não clonar
    path: /repos/erp
    scan_profile: shallow
```

**Regras:**

- `pinned_sha` é obrigatório antes de reportar qualquer finding com `arquivo:linha`
  — sem ele ninguém sabe contra qual versão o achado foi gerado.
- `scan_profile: ignore` exclui o repo do assessment. Use para repos que não
  merecem arqueologia profunda — é o que evita 20 repos custarem 20× em tokens.
- `arch_current` é **fato descoberto, nunca alvo**. O alvo (`arch_target`) só
  existe dentro de uma iniciativa `modernization`, no `initiatives.yaml`.
- Cada repo tem **seu próprio gate D1**. Um repo grande não trava os outros.

## Mapa contexto ↔ repo (`context-repos.yaml`)

O domínio **não respeita a fronteira de repositório**. `Faturamento` pode viver
em dois repos; `legacy-erp` pode conter quatro contextos. A relação é **N:N** —
é isso que impede o modelo de domínio de ficar refém do layout físico.

> ⚠️ **Não confundir com `assessment/domain/context-map.md`**, que é o *Context
> Map do DDD* (ACL, Shared Kernel, Conformist, Partnership — relações **entre**
> contextos). Este arquivo responde a outra pergunta: **onde**, fisicamente,
> cada contexto se materializa.

```yaml
version: 1
contexts:
  - slug: faturamento          # kebab-case — vira <slug>.agent.md
    name: "Faturamento"
    status: accepted           # candidate | accepted | rejected
    lives_in:                  # N:N — nunca vazio
      - repo: billing-api
        paths: ["src/**"]      # globs relativos à raiz do repo; ausente = ["**"]
      - repo: legacy-erp
        paths: ["modules/fat/**"]

  - slug: sinistros
    name: "Sinistros"
    status: candidate          # aguardando o gate humano
    lives_in:
      - repo: claims-svc
```

**Regras:**

- Produzido pelo `@domain-extractor`, que roda **cross-repo** — é o único
  sub-agente que precisa ver todos os repos de uma vez (senão não descobre que
  um contexto atravessa dois).
- `status: candidate` é proposta. **Só `accepted` vira agente de domínio**, e só
  depois do gate humano.
- `rejected` **permanece no arquivo** para auditoria — não apague.
- Todo `repo:` referenciado deve existir em `repos.yaml`.
- Um agente de domínio por **contexto** — nunca um agente por repo.

## Estrutura de artefatos

O layout segue o **escopo da fase**: o que é por repositório mora em
`assessment/repos/<id>/`; o que é cross-repo mora direto em `assessment/`.

```
.github/artifacts/
  repos.yaml                        ← inventário dos N repos (ver acima)
  context-repos.yaml                ← mapa contexto ↔ repo, N:N (ver acima)
  assessment/                       ← Discovery (read-only)

    repos/                          ══ scope: repo — um bloco por repositório ══
      <repo-id>/                    ← ex.: billing-api, legacy-erp
        tech-stack/
          tech-radar.md             ← @tech-mapper
        architecture/
          arch-discovery.md         ← @arch-discoverer (padrão + coupling matrix + anti-padrões)
          c4-context.md             ← @arch-discoverer (L1: atores e sistemas externos)
          c4-container.md           ← @arch-discoverer (L2: serviços, bancos, filas, frontends)
          c4-component.md           ← @arch-discoverer (L3: internos do container principal)
          arch-discovery.drawio     ← @arch-discoverer (3 sheets: L1/L2/L3)
        coding-guidelines/
          project-coding-guide.md   ← @coding-archaeologist (revisão humana)
        quality/
          quality-report.md         ← @quality-auditor
        security/
          security-report.md        ← @security-auditor
        test-coverage/
          coverage-gaps.md          ← @test-coverage-mapper
        debt/
          tech-debt.md              ← @debt-analyst

    domain/                         ══ scope: workspace — cross-repo ══
      context-map.md                ← @domain-extractor (Context Map do DDD: ACL, Shared Kernel…)
      ubiquitous-language.md
      aggregates.md
      business-rules.md
      domain-events.md
      gaps.md
    business/
      business-context.md           ← @business-archeologist
      stakeholder-interview.md
    maturity/
      maturity-scorecard.md         ← @maturity-assessor (se configurado)
      maturity-<framework>.md       ← 1 por framework selecionado

    foundation-state.yaml           ← tracker de progresso (ver acima)
    report.md                       ← rollup dos N repos, consolidado pelo @assessor
    baseline-metrics.json           ← consolidado pelo @assessor
```

## LLM Wiki — o que o Discovery instala

O Discovery não termina em documentos: ele instala **capacidade agêntica** no
repositório do cliente. `<host-dir>` é `.github` (Copilot) ou `.claude` (Claude).

```
<host-dir>/
  agents/domain/
    faturamento.agent.md            ← 1 agente por bounded context ACCEPTED
    sinistros.agent.md              ← declara lives_in (N:N com os repos)
  skills/
    coding-guidelines-billing-api/  ← 1 skill por REPOSITÓRIO (o padrão dele)
      SKILL.md
    coding-guidelines-legacy-erp/
      SKILL.md
registry.yaml                       ← atualizado com os agentes gerados
```

**A composição que faz o agente atuar no padrão certo:**

```
executor = @<contexto>                        ← a regra de negócio (domínio)
         + coding-guidelines-<repo-alvo>      ← como escrever NAQUELE repo
         + @backend-<stack-do-repo>           ← quem sabe a stack
```

- **Agente por contexto, nunca por repositório.** O domínio é a unidade; o
  repositório é só onde ele mora. Um agente por repo duplicaria a regra de
  `Faturamento` em dois lugares — e elas divergiriam.
- **Skill por repositório, nunca uma só.** Cada repo tem seu padrão
  (`billing-api` pode ser Spring MVC e `claims-svc` hexagonal). Uma skill única
  sobrescreveria um padrão com o outro.

```
  planning/
    modernization-roadmap.md
    risk-matrix.md
  execution/
    test-backfill-report.md
    refactor-report.md
    migration-report.md
    feature-report.md
  gates/
    D{1,2,3}-approved.md
<host-dir>/skills/                  ← <host-dir> é .github (Copilot) ou .claude (Claude)
  coding-guidelines-<repo-alvo>/
    SKILL.md                        ← @coding-archaeologist (após HITL)
docs/adr/                           ← ADRs retroativas + novas
```

## Tracker de progresso (`assessment/foundation-state.yaml`)

Path canônico: é onde o `@assessor` grava e onde o Cockpit lê/escreve o
`human_checklist`. **Não mova** — divergir esse path faz agente e Cockpit
perderem um ao outro silenciosamente.

```yaml
version: 2

# ── Fases por repositório (scope: repo) ──
repos:
  billing-api:
    phases:
      tech-stack:
        status: done                    # pending → in-progress → agent-done → done
        agent: "@tech-mapper"
        completed_at: "<ISO-8601>"
        human_checklist:
          stack-identified: true
      arch:
        status: agent-done              # terminou, AGUARDANDO APROVAÇÃO HUMANA
        agent: "@arch-discoverer"
        human_checklist: {}
    findings_summary:                   # evita o Cockpit parsear tech-debt.md
      critical: 3
      high: 11
      medium: 24
      low: 8
    gate_d1:
      status: approved                  # pending | approved — DESTE repo
      approved_at: "<ISO-8601>"

# ── Fases cross-repo (scope: workspace) ──
phases:
  domain:                               # @domain-extractor vê todos os repos
    status: pending
    human_checklist: {}
  business-context:
    status: pending
    human_checklist: {}
```

**Escopo de cada fase:**

| `scope: repo` (uma execução por repositório) | `scope: workspace` (uma vez, cross-repo) |
|---|---|
| `tech-stack` · `arch` · `coding-archaeology` · `quality` · `debt` | `domain` · `business-context` · `interview` · `baseline` · `skill-linking` |

**Regras:**

- **`agent-done` é obrigatório.** Ao terminar um sub-agente, grave `agent-done` —
  **nunca** `done` direto. `done` só depois que o humano confirmar o
  `human_checklist` no `AskUserQuestion`. O Cockpit exibe `agent-done` como
  *review* ("aguardando você").
- **Gate D1 é por repo, sempre.** Aprovar o `billing-api` não aprova o
  `claims-svc`. Um repo grande nunca trava os outros.
- **O D1 global é derivado, não gravado.** Ele fecha sozinho quando todo repo
  scannable tem `gate_d1: approved` **e** `phases.domain` está `done`. Não crie
  campo `blocked_by` — dessincroniza.
- Fases `scope: repo` vão em `repos.<id>.phases`; fases `scope: workspace` vão
  em `phases`. Nunca misture.

## Anti-padrões

- ❌ Pedir implementação antes de Discovery aprovado
- ❌ Refactor sem cobertura (sempre via `@test-backfill-agent`)
- ❌ Big bang / rewrite — sempre incremental (Strangler/Branch by Abstraction)
- ❌ Misturar refactor + feature na mesma PR
- ❌ Modificar código durante Discovery (read-only)
- ❌ Pular Planning indo direto de Discovery para Execution
