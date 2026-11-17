---
id: task-manager
name: task-manager
type: skill
description: >
  Gerenciamento de tarefas de sprint. Define o schema canônico do
  sprint-backlog.yaml, ciclo de vida de status, DoR/DoD, sizing e o protocolo
  de dispatch do sprint-runner. Resolve o problema de backlog malformado e
  execução sem rastreabilidade.
applicable_to:
  - "@sprint-planner — para estruturar e validar o sprint-backlog.yaml"
  - "@sprint-runner  — para despachar, rastrear e encerrar tarefas da sprint"
inputs:
  - .github/artifacts/feature-list.md
  - .github/artifacts/prd.md
  - features/**/*.feature
  - api/openapi.yaml
outputs:
  - .github/artifacts/sprint-backlog.yaml     (sprint-planner)
  - .github/artifacts/sprint-status.md        (sprint-runner)
---

# Skill: task-manager

> Backlog sem DoR é débito técnico de planejamento.
> Sprint sem status tracking é caixa preta para o time.

---

## 1. Schema canônico do `sprint-backlog.yaml`

```yaml
# Cabeçalho obrigatório
meta:
  product: <nome do produto>          # sem branding corporativo
  code_name: <slug>                   # usado em IDs de items
  total_sprints: <n>
  sprint_duration_weeks: <n>
  team_composition:
    - role: <stack>                   # backend-python | backend-java | backend-dotnet | frontend-react | ...
      count: <n>
  gate_before_downstream: G1
  gate_before_operation: G2

sprints:
  - id: S<n>                          # S1, S2, S3…
    name: "<nome descritivo>"
    goal: >                           # 2-3 frases: quem faz o quê e qual valor entrega
      <persona> consegue: <ação> → <ação> → <valor percebido>.
    priority: P0 | P1 | P2
    items:

      - id: <S<n>-BKD-<nn> | S<n>-FE-<nn>>    # BKD = backend, FE = frontend
        title: "<ação + contexto>"
        status: backlog                          # ver seção 2
        component: backend | frontend
        feature: <ID da feature no feature-list.md | null>
        size: XS | S | M | L | XL               # ver seção 4
        story_points: <n>                        # ver seção 4 — obrigatório
        depends_on: [<id>, ...]                  # IDs de itens que devem ser done antes
        dor:                                     # ver seção 3
          - <condição objetiva verificável>
        dod:                                     # ver seção 3
          - <entregável concreto ou comportamento verificável>
        openapi_endpoints:                       # endpoints REST criados/modificados
          - METHOD /path
        tags: [<domínio>, <tipo>]                # para filtro e rastreabilidade
```

> ⚠️ **Nomes de campo não-negociáveis** — já vistos divergindo em produção,
> cada variação força quem lê (o Cockpit, outro agente) a adivinhar em vez
> de confiar no schema:
> - `size` — nunca `sizing`
> - `story_points` — nunca `estimate`
> - `feature` — nunca `feature_ref`
> - `sprints:` (array) com `items:` DENTRO de cada sprint — nunca `stories:`
>   ou `items:` soltos no topo do arquivo, sem o wrapper `sprints:`

### Campos obrigatórios vs opcionais

| Campo | sprint-planner | sprint-runner |
|---|---|---|
| `id`, `title`, `status`, `component` | obrigatório | obrigatório |
| `feature`, `size`, `story_points` | obrigatório | leitura |
| `dor`, `dod` | obrigatório | leitura |
| `depends_on` | obrigatório se houver dependência | impõe sequência |
| `openapi_endpoints` | obrigatório para backend | leitura |
| `tags` | recomendado | opcional |

---

## 2. Ciclo de vida de status

```
backlog ──► in-progress ──► review ──► done
                │                        ↑
                └──► blocked ────────────┘  (após desbloqueio)
                │
                └──► descoped
```

| Status | Quem seta | Significado |
|---|---|---|
| `backlog` | `@sprint-planner` | Planejado, aguardando DoR satisfeita |
| `in-progress` | `@sprint-runner` | Despachado para um agente de build |
| `review` | `@backend-*` / `@frontend-*` | Implementado, aguardando `@reviewer` |
| `done` | `@reviewer` / `@sprint-runner` | PR mergeado, todos os DoD cumpridos |
| `blocked` | `@sprint-runner` | Impedimento identificado, escalado ao `@maestro` |
| `descoped` | `@sprint-runner` / `@maestro` | Removido do escopo da sprint com justificativa |

### Estado terminal
Um item está em estado terminal quando `status` é um de: `done | blocked | descoped`.
A sprint só encerra quando **todos os itens** estão em estado terminal.

---

## 3. DoR — Definition of Ready

Um item está pronto para ser despachado quando **todas** as condições do campo `dor` são verificáveis:

### Checklist mínimo de DoR por tipo

**Backend:**
- Dependências declaradas em `depends_on` estão `done`
- Endpoint OpenAPI correspondente existe em `api/openapi.yaml`
- Bounded Context ou Aggregate relevante definido em `docs/domain/`
- ADRs relevantes lidos (IDs referenciados no `dor`)

**Frontend:**
- Dependências de backend em `depends_on` estão `done` (ou mock disponível)
- Contrato OpenAPI para consumo do endpoint disponível
- BDD scenarios cobertos em `features/`
- Componentes do Design System identificados

**Genérico (qualquer tipo):**
- `title` é uma frase de ação verificável, não um substantivo vago
- `dod` tem pelo menos 3 itens concretos e verificáveis
- `story_points` atribuído e justificado

### Falha de DoR
Se um item tem `depends_on` com itens não-`done`, `@sprint-runner` **não deve despachar**.
Deve registrar como `blocked` com motivo: `"depends_on: [<id>] ainda não done"`.

---

## 4. DoD — Definition of Done

Um item está `done` quando **todos** os critérios do campo `dod` são atendidos E:

- Código commitado em branch de feature
- PR aberto e passando em CI (lint + type check + tests)
- `@reviewer` aprovou (sem comentários bloqueantes)
- `@security` green (se item tem tag `security` ou envolve auth/crypto/pii)
- `@qa-tester` green para cenários BDD cobertos pelo item
- PR mergeado para o branch principal

### Critérios mínimos de DoD por tipo

**Backend:**
- Endpoint(s) em `openapi_endpoints` implementados e documentados
- Testes unitários com ≥80% de cobertura das linhas novas
- Teste integrado com Testcontainers (se envolve DB/cache/queue)
- Sem SQL raw fora de repositórios
- Sem segredos hardcoded

**Frontend:**
- Componente renderiza sem erros de console
- Responsivo para os breakpoints declarados no Design System
- Acessibilidade básica (aria-labels, tab order)
- Vitest passando para unit + snapshot

---

## 5. Sizing guide

### T-shirt → Story Points (Fibonacci)

| T-shirt | Story Points | Referência de complexidade |
|---|---|---|
| `XS` | 1 | Mudança trivial, sem nova lógica de negócio |
| `S` | 2–3 | Um endpoint simples ou componente standalone |
| `M` | 5 | Lógica de domínio, integração com 1 serviço externo |
| `L` | 8 | Aggregate complexo, múltiplos endpoints coordenados |
| `XL` | 13 | Feature completa, múltiplos BCs, integração end-to-end |

### Regra de corte
Items com `story_points >= 13` devem ser divididos antes de entrar na sprint.
Sprint com total > `velocity * 1.2` deve ser fatiada (remover itens P2 primeiro).

---

## 6. Protocolo de dispatch (sprint-runner)

### Algoritmo de despacho

```
Para cada sprint ativa:
  1. Ordenar items por: depends_on satisfeitos → priority → story_points ASC
  2. Para cada item com status == backlog:
     a. Verificar DoR: todos os depends_on estão done?
        - Não → marcar blocked, motivo "depends_on pendente"
        - Sim → continuar
     b. Verificar DoR checklist do próprio item
        - Falhou → marcar blocked, motivo "DoR não satisfeita: <campo>"
     c. Roteamento por component:
        - backend → @backend-{stack conforme helyx.config.yaml}
        - frontend → @frontend-{stack conforme helyx.config.yaml}
     d. Marcar status: in-progress, dispatched_at: <ISO timestamp>
  3. Após retorno do agente:
     - Sucesso → marcar status: review, pr_url: <url>
     - Falhou → marcar status: blocked, motivo: <output do agente>
  4. Após @reviewer aprovar e PR mergear:
     - Marcar status: done, done_at: <ISO timestamp>
```

### Exemplo de entrada no sprint-backlog.yaml após dispatch

```yaml
- id: S1-BKD-03
  title: "Auth: JWT + API Key"
  status: done
  component: backend
  dispatched_at: "2026-01-10T09:00:00Z"
  pr_url: "https://github.com/org/repo/pull/42"
  done_at: "2026-01-11T14:30:00Z"
```

---

## 7. `sprint-status.md` — estrutura canônica

O `@sprint-runner` produz e mantém este arquivo atualizado a cada transição de status.

```markdown
# Sprint Status — <sprint_name>

**Iniciativa:** <initiative_id>  
**Sprint:** S<n> — <nome>  
**Objetivo:** <goal do sprint>  
**Atualizado em:** <ISO timestamp>

## Resumo

| Métrica | Valor |
|---|---|
| Total de items | <n> |
| Done | <n> |
| In-Progress | <n> |
| Blocked | <n> |
| Descoped | <n> |
| Story Points entregues | <n> / <total> |
| Velocidade estimada | <sp/sprint> |

## Items Bloqueados

| ID | Título | Motivo | Escalado em |
|---|---|---|---|
| <id> | <title> | <motivo> | <ISO> |

## Items Descoped

| ID | Título | Justificativa |
|---|---|---|
| <id> | <title> | <justificativa> |

## Log de Transições

| Timestamp | ID | De | Para | Agente |
|---|---|---|---|---|
| <ISO> | <id> | backlog | in-progress | @backend-python-api |
```

---

## 8. Escalação de bloqueios

Quando um item fica `blocked`, `@sprint-runner` deve:

1. Registrar `motivo` no sprint-backlog.yaml (campo `blocked_reason`)
2. Atualizar `sprint-status.md` na seção "Items Bloqueados"
3. Escalar ao `@maestro` com:
   ```
   BLOQUEIO — <initiative_id>/<sprint_id>/<item_id>
   Motivo: <descrição clara>
   Ação necessária: [aguardar depends_on | decisão arquitetural | recurso externo | outro]
   Impacto: <quantos itens dependem deste>
   ```
4. Não despachar items que dependem do item bloqueado

### Critério de encerramento da sprint com bloqueios
Se ≥30% dos story points estão `blocked` após 60% do tempo de sprint, escalar ao `@maestro`
para decisão: re-escopo, carry-over ou sprint extension.
