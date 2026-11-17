---
id: ai-agent-author
name: ai-agent-author
type: skill
description: Padrão canônico para escrever agentes de IA dentro do kit e nos projetos gerados (especialmente Python Agentic). Define frontmatter, estrutura, exit_contract, guard_rails, observability e eval.
applicable_to:
  - Criação de novos agentes para o kit (<host-dir>/agents/** — .github no Copilot, .claude no Claude)
  - "Implementação de agentes em projetos cliente (stack: backend-python-agentic)"
  - Refactor de agentes existentes para o padrão
inputs:
  - Descrição do papel do agente
  - Stream/fase ou tipo (sidecar/guardian)
outputs:
  - Arquivo `<id>.agent.md` com frontmatter completo + corpo
  - (Para Python Agentic) módulo `agents/<id>/` com `__init__.py`, `agent.py`, `prompts/`, `tools.py`, `eval/`
---

# Skill: ai-agent-author

> **Não invente um agente sem passar por aqui.** Garante que todo agente do
> ecossistema do kit siga o mesmo padrão — facilita orquestração, eficiência
> de token, observabilidade e evolução.

---

## 1. Decida o tipo

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `L0` Maestro | Único ponto de entrada | `@maestro` |
| `L2-phase` | Fase de um stream | `@product`, `@backend-java` |
| `L2-sidecar` | Transversal sob demanda | `@security` |
| `L2-guardian` | Validação fim-a-fim em gates | `@arch-cross` |
| `L3-skill` | Capacidade atômica | `openapi-governance` |

## 2. Frontmatter obrigatório (templates)

### Phase agent
```yaml
---
id: <slug>
layer: L2-phase
stream: upstream | downstream | operation
phase: <n-name>
receives_from: [<agentes/maestro>]
delivers_to:   [<próxima fase>]
escalates_to:  [maestro]
inputs:        [<paths de artefatos>]
outputs:       [<paths de artefatos produzidos>]
exit_contract: [<condições verificáveis>]
guard_rails:   [<o que NÃO faz>]
uses_skills:   [<skills L3>]
token_budget:  low | medium | high
---
```

### Sidecar
```yaml
---
id: <slug>
layer: L2-sidecar
stream: sidecar
receives_from: [<quem invoca>]
delivers_to:   [<para onde devolve>]
escalates_to:  [maestro]
inputs:        [...]
outputs:       [...]
exit_contract: [...]
guard_rails:
  - Não chamar outro side-car
uses_skills:   [...]
token_budget:  low | medium
---
```

### Guardian
```yaml
---
id: <slug>
layer: L2-guardian
stream: guardian
invoke_on: [gate.upstream_to_downstream, gate.downstream_to_operation]
receives_from: [maestro]
delivers_to:   [maestro]
escalates_to:  [maestro]
inputs:        [...]
outputs:       [.github/artifacts/gates/<gate-id>-<id>.md]
exit_contract: [<rubricas de validação>]
guard_rails:
  - Não executar trabalho de fase
  - Não ser invocado fora de gate
uses_skills:   [...]
token_budget:  medium
---
```

## 3. Corpo do agente — seções padrão

```markdown
# @<id> — <título curto>

<1 parágrafo: o que faz, o que NÃO faz, output principal>

## Princípios (opcional, se não óbvios)
## Outputs canônicos (mostrar template do artefato)
## Rubricas / heurísticas (para guardians/quality)
## Anti-padrões (curto, complementa guard_rails)
```

## 4. Padrão para agentes em **Python Agentic** (stack `backend-python-agentic`)

Estrutura de pastas obrigatória:

```
code/services/<service>/
├── pyproject.toml
├── src/<service>/
│   ├── agents/
│   │   └── <agent-id>/
│   │       ├── __init__.py
│   │       ├── agent.py          # definição do grafo/agente
│   │       ├── prompts/          # prompts versionados (.md)
│   │       │   └── system.md
│   │       ├── tools.py          # ferramentas expostas ao agente
│   │       └── schemas.py        # Pydantic I/O
│   ├── runtime/
│   │   ├── llm_router.py         # provider-agnostic (BYO LLM)
│   │   ├── tracing.py            # OTel + LLM tracing
│   │   └── cost_tracker.py       # token/cost por run
│   └── api/                      # opcional: FastAPI exposing the agent
└── eval/
    ├── golden/                   # casos de teste com expected outputs
    │   └── <case>.yaml
    ├── metrics.py                # métricas de qualidade (judge LLM, regex, semantic)
    └── runner.py
```

### Regras invariantes para Python Agentic
1. **Provider-agnostic**: jamais hardcode de modelo/provider. Sempre via
   `llm_router` + config.
2. **Prompts são arquivos** (`.md`), versionados, nunca string literal in-line.
3. **Tools tipadas com Pydantic**: input/output schema explícitos.
4. **Tracing obrigatório**: cada step do grafo emite span OTel + custo.
5. **Eval harness obrigatório**: PR sem eval para o agente novo é rejeitado.
6. **Sem secrets**: providers via variáveis de ambiente.
7. **Guardrails**: nunca desabilitar safety checks do framework.

### Mínimo para considerar "feito" um agente Python Agentic
- [ ] `agents/<id>/agent.py` com grafo/lógica
- [ ] `agents/<id>/prompts/system.md` versionado
- [ ] `agents/<id>/schemas.py` com I/O Pydantic
- [ ] `eval/golden/<id>-*.yaml` com ≥ 5 casos
- [ ] `eval/runner.py` rodando no CI
- [ ] OTel spans visíveis no trace
- [ ] Custo por run logado

## 5. Heurísticas de eficiência de token (TODOS os tipos)

- `token_budget: low` → agente curto, contexto reduzido. Side-cars simples e
  fases planejadoras.
- `token_budget: medium` → fases que produzem documentos médios.
- `token_budget: high` → fases de implementação (backend/frontend) e
  arquitetura.
- `uses_skills` mínimo possível — cada skill carrega contexto.
- Sempre **ler arquivo de artefato**, nunca pedir o usuário a recolar.
- Guardians **só em gates**.

## 6. Checklist final antes de submeter um agente novo

- [ ] Frontmatter completo no template do tipo correto
- [ ] `exit_contract` é verificável (não vago)
- [ ] `guard_rails` lista pelo menos 2 anti-padrões
- [ ] `uses_skills` mínimo necessário
- [ ] Não inventa cross-stream (escala via `@maestro`)
- [ ] Não duplica responsabilidade de outro agente
- [ ] (Python Agentic) estrutura de pastas + eval + tracing
- [ ] Nenhum nome de empresa, ferramenta proprietária ou versão fixa hardcoded
