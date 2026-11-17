# Regras de Roteamento

Como `@maestro`, agentes-fase, guardians e side-cars conversam entre si.

## 1. Maestro → Stream (entrada do usuário)

`@maestro` identifica a intenção e roteia para o **primeiro agente do stream**:

| Intenção do usuário | Stream | Primeira fase |
|---|---|---|
| "tenho uma ideia / oportunidade de negócio" | Upstream | `@business` |
| "preciso fazer discovery / inception / PRD" | Upstream | `@product` |
| "preciso modelar domínio / DDD" | Upstream | `@domain-modeler` |
| "preciso escrever feature / cenário Gherkin" | Upstream | `@bdd` |
| "preciso decidir tecnologia / desenhar API" | Upstream | `@architecture` |
| "preciso planejar / refinar sprint" | Upstream | `@sprint-planner` |
| "preciso executar a sprint atual" | Downstream | `@sprint-runner` |
| "vou implementar back" | Downstream | `@backend-{stack}` (via sprint-runner) |
| "vou implementar front" | Downstream | `@frontend-{stack}` (via sprint-runner) |
| "preciso revisar PR" | Downstream | `@reviewer` |
| "preciso configurar pipeline / CI" | Operation | `@devops` |
| "vou fazer release / tag" | Operation | `@release` |
| "preciso configurar observabilidade / SLO" | Operation | `@observability` |
| "tenho incidente em produção" | Operation | `@incident` |
| "vou fazer patch / upgrade de dependência" | Operation | `@sustain` |

Se a intenção for ambígua, `@maestro` faz **uma única pergunta** de
desambiguação. Nunca tenta resolver direto. Nunca chama Guardian sem ser em gate.

## 2. Sequência interna de cada stream (handoff feliz)

```
UPSTREAM:    business → product → domain-modeler → bdd → architecture → sprint-planner ─┐
                                                                                        │ GATE
DOWNSTREAM:  sprint-runner → (backend-* ∥ frontend-*) → reviewer → merge ───────────────┤
                                                                                        │ GATE
OPERATION:   devops → release → observability → incident → sustain ─────────────────────┘
                                                                                        │
                                                          loop ↺ feedback p/ Upstream
```

Cada agente-fase tem `delivers_to` no frontmatter e só passa adiante depois de
cumprir o `exit_contract`.

## 3. Gates entre streams (Guardians obrigatórios)

| Gate | Validadores | Disparo |
|---|---|---|
| Upstream → Downstream | `@stream-align` + `@arch-cross` | Após `@sprint-planner` declarar exit_contract |
| Downstream → Operation | `@stream-align` + `@arch-cross` | Após `@sprint-runner` confirmar merge |

**Regra de ouro de eficiência:** Guardians **só são invocados nos gates**.
Não são consultados em fases intermediárias para não desperdiçar tokens.

## 4. Cross-stream — sempre via `@maestro`

| Cenário | Origem | Escala para | Destino |
|---|---|---|---|
| Backend precisa mudar contrato OpenAPI | `@backend-*` (Down) | `@maestro` | `@architecture` (Up) |
| Bug em prod precisa de fix de código | `@incident` (Op) | `@maestro` | `@sprint-runner` (Down) |
| Feature priorizada vira sprint | `@sprint-planner` (Up) | `@maestro` | `@sprint-runner` (Down) |
| Aprendizado de prod gera nova feature | `@observability` (Op) | `@maestro` | `@business`/`@product` (Up) |
| Defeito grave bloqueia release | `@release` (Op) | `@maestro` | `@reviewer` (Down) |

## 5. Side-cars — sob demanda

| Side-car | Acionado por | Para |
|---|---|---|
| `@qa-tester` | `@backend-*`, `@frontend-*` | Escrever/executar step defs Gherkin |
| `@quality` | `@maestro` (gates) | Validar entrada/saída de stream |
| `@security` | `@backend-*`, `@frontend-*`, `@reviewer`, `@devops`, `@sustain` | Scan CVE, OWASP, secrets |
| `@docs` | Qualquer agente que produz artefato | Atualizar docs/ADR/CHANGELOG |
| `@integration-tests` | `@sprint-runner` (após back+front fecham) | Suite ponta-a-ponta |

Side-car **nunca chama outro side-car**. Se precisar, escala para `@maestro`.

## 6. Stack specialists — escolha no wizard

Quando o wizard configura o projeto, define quais `@backend-*` e `@frontend-*`
são instalados. O `@sprint-runner` invoca apenas os agentes da stack escolhida:

```yaml
# helyx.config.yaml
stacks:
  backend:  python-api          # ou java | dotnet | python-agentic
  frontend: react               # ou flutter | android | ios
```

## 7. Agente-fase → Skill

Skills são invocadas via prompt do próprio agente (não como sub-agente).
Carregadas no contexto **apenas se declaradas em `uses_skills`**.

| Agente | Skills típicas |
|---|---|
| `@backend-java` | `coding-guidelines`, `lang-java-spring`, `arch-hexagonal`, `qa-strategy` |
| `@backend-python-api` | `coding-guidelines`, `lang-python-api`, `arch-hexagonal`, `qa-strategy` |
| `@backend-python-agentic` | `coding-guidelines`, `ai-agent-author`, `lang-python-agentic`, `qa-strategy` |
| `@frontend-react` | `coding-guidelines`, `lang-react`, `arch-feature-based`, `ui-ux-design-system` |
| `@reviewer` | `coding-guidelines`, `qa-strategy` |
| `@devops` | `pipeline-adapter` (GH Actions / Azure DevOps / GitLab) |
| `@security` | `security-best-practices`, `security-cve-checker` |
| `@architecture` | `openapi-governance`, `domain-driven-design`, `arch-diagrams-drawio` |
| `@docs` | `docs-writer` |
| Todo agente novo | `ai-agent-author` (meta — para padronizar como escrever agentes) |

## 8. Anti-padrões de roteamento

❌ Usuário falando direto com `@backend-*` (sempre via `@maestro`/`@sprint-runner`)
❌ `@backend-*` → `@architecture` direto (cross-stream sem maestro)
❌ `@maestro` executando trabalho ("ajudar direto")
❌ `@maestro` invocando guardian fora de gate (gasta token sem motivo)
❌ Guardian agindo como agente-fase (eles validam, não executam)
❌ Agente-fase pulando fase do próprio stream
❌ Side-car chamando outro side-car
❌ Skill sendo invocada pelo usuário (sempre por agente)
