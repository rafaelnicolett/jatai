---
id: lang-python-agentic
name: lang-python-agentic
type: skill
description: Boas práticas para Python Agentic — LangGraph/PydanticAI, LLM routing, prompts versionados, eval harness, streaming, tool use e observabilidade de agentes.
applicable_to:
  - "@backend-python-agentic"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-python-agentic

> Extensão de `lang-python-api` para sistemas agênticos.
> Tudo de `lang-python-api` vale aqui + as regras específicas abaixo.
> Para estrutura de camadas, use `arch-hexagonal` ou `arch-layered`.

---

## 1. Framework de agentes — escolha 1 por serviço

| Framework | Quando usar | Não usar quando |
|---|---|---|
| **LangGraph** | Workflows multi-step com estado, ciclos, branching condicional | Agente simples de 1 passo |
| **PydanticAI** | Agentes simples/médios, output estruturado garantido, DX limpa | Grafos complexos com ciclos |

**Nunca misture** os dois no mesmo serviço. Registre a escolha no ADR da stack
do backend (`docs/adr/`).

```python
# ✅ PydanticAI — agente com output estruturado
from pydantic_ai import Agent
from pydantic import BaseModel

class AnaliseRisco(BaseModel):
    nivel: Literal["baixo", "medio", "alto"]
    justificativa: str
    acoes_recomendadas: list[str]

agente_risco = Agent(
    model="openai:gpt-4o",         # provider via LLM Router
    result_type=AnaliseRisco,
    system_prompt=load_prompt("prompts/analise-risco.md"),
)

# ✅ LangGraph — workflow com estado e ciclos
from langgraph.graph import StateGraph, END

graph = StateGraph(AgentState)
graph.add_node("pesquisar", pesquisar_node)
graph.add_node("analisar", analisar_node)
graph.add_node("revisar", revisar_node)
graph.add_conditional_edges("revisar", deve_repetir, {"sim": "pesquisar", "nao": END})
```

## 2. LLM Router — provider-agnostic obrigatório

**Nunca chame um provider LLM diretamente.** Use o router centralizado que
lê do `helyx.config.yaml` e faz fallback automático.

```python
# ✅ Via LLM Router (abstrai provider)
from adapters.out.llm.router import get_model

model = get_model("primary")   # lê de config: openai:gpt-4o | anthropic:claude-3-5 | gemini:...
agente = Agent(model=model, ...)

# ❌ Provider hardcoded
from openai import AsyncOpenAI
client = AsyncOpenAI(api_key="sk-...")  # proibido — acopla ao provider
```

```python
# Implementação do router (adapter out)
# adapters/out/llm/router.py
def get_model(slot: str) -> str:
    config = load_ai_sdk_config()
    return config["llm"]["slots"][slot]["model"]   # ex: "openai:gpt-4o"
```

## 3. Prompts — versionados em arquivos `.md`

```
prompts/
├── analise-risco.md           # system prompt do agente de risco
├── extracao-entidades.md      # system prompt de extração
└── templates/
    └── relatorio-parcial.md   # template de user message
```

```python
# ✅ Carrega prompt do arquivo (versionado, editável sem deploy)
from pathlib import Path

def load_prompt(path: str) -> str:
    return (Path(__file__).parent.parent / path).read_text(encoding="utf-8")

# ❌ Prompt inline — não versionado, não revisável
system = "Você é um assistente financeiro que analisa risco de crédito..."
```

### Estrutura canônica de prompt `.md`
```markdown
# Agente: Análise de Risco

## Papel
Você é um especialista em análise de risco de crédito do domínio {domain_name}.

## Contexto
{context}

## Regras
- Analise apenas os dados fornecidos
- Não invente informações
- Se incerto, declare nível "medio" e justifique

## Formato de saída
Retorne um JSON com: nivel, justificativa, acoes_recomendadas
```

## 4. Tool use — padrões de segurança

```python
# ✅ Tool com schema estrito e descrição clara
@agente.tool
async def buscar_historico_credito(
    ctx: RunContext[AgentDeps],
    cpf: str = Field(description="CPF do cliente, apenas dígitos, sem pontuação"),
    meses: int = Field(ge=1, le=60, description="Período em meses"),
) -> HistoricoCredito:
    """Busca histórico de crédito de um cliente no bureau externo."""
    return await ctx.deps.bureau_client.buscar(cpf, meses)

# ❌ Tool sem tipagem — LLM pode passar valores errados
async def buscar_historico(cpf, meses):
    return bureau.get(cpf, meses)
```

### Segurança em tools
- **Validar inputs** antes de qualquer IO (o LLM pode alucinar parâmetros)
- **Sem execução de código arbitrário** via tool (sem `eval`, `exec`, `subprocess`)
- **Rate limiting** em tools que chamam APIs externas
- **Auditoria**: logar cada invocação de tool com parâmetros (sem PII)

## 5. Estado e memória

```python
# ✅ Estado explícito como TypedDict (LangGraph)
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    documentos: list[Documento]
    decisao: str | None
    iteracoes: int

# ✅ Memória de curto prazo: dentro do run (não persiste)
# ✅ Memória de longo prazo: via adapter out (VectorDB, PostgreSQL)
# ❌ Variável global de estado — quebra concorrência
```

## 6. Streaming

```python
# ✅ Streaming com PydanticAI
async with agente_risco.run_stream(user_message, deps=deps) as result:
    async for chunk in result.stream_text(delta=True):
        yield f"data: {chunk}\n\n"
    final: AnaliseRisco = await result.get_data()

# ✅ Streaming com LangGraph
async for event in graph.astream_events({"messages": [msg]}, version="v2"):
    if event["event"] == "on_chat_model_stream":
        yield event["data"]["chunk"].content
```

## 7. Eval harness — obrigatório no CI

```python
# evals/test_analise_risco.py
import pytest
from evals.harness import EvalCase, run_eval   # harness de eval do próprio projeto

CASES: list[EvalCase] = [
    EvalCase(
        id="risco-alto-inadimplente",
        input={"historico": historico_inadimplente()},
        expected_nivel="alto",
        expected_keywords=["inadimplência", "score baixo"],
    ),
    EvalCase(
        id="risco-baixo-historico-limpo",
        input={"historico": historico_limpo()},
        expected_nivel="baixo",
    ),
]

@pytest.mark.parametrize("case", CASES)
async def test_analise_risco_eval(case: EvalCase):
    result = await agente_risco.run(build_message(case.input))
    assert result.data.nivel == case.expected_nivel
    # LLM-as-judge para qualidade da justificativa:
    score = await judge.avaliar(result.data.justificativa, case.expected_keywords)
    assert score >= 0.8
```

```yaml
# pyproject.toml — eval como test suite separada
[tool.pytest.ini_options]
markers = ["eval: LLM evaluation tests (slow, require API keys)"]
# CI: pytest -m "not eval" (fast) | pytest -m "eval" (nightly)
```

## 8. Observabilidade de agentes

```python
# ✅ Span por invocação de agente
with tracer.start_as_current_span("AgentRun.AnaliseRisco") as span:
    span.set_attribute("agent.model", model_name)
    span.set_attribute("agent.input_tokens", usage.input_tokens)
    span.set_attribute("agent.output_tokens", usage.output_tokens)
    span.set_attribute("agent.cost_usd", calculate_cost(usage))
    span.set_attribute("agent.tool_calls", len(tool_calls))
```

**Métricas obrigatórias:**
- `llm.request.duration` (histogram) — latência por modelo
- `llm.tokens.input` / `llm.tokens.output` (counter) — custo
- `llm.errors` (counter) — por tipo (timeout, rate_limit, invalid_response)
- `agent.tool_calls` (counter) — por tool name
- `agent.iterations` (histogram) — para grafos com ciclos

## 9. Anti-padrões específicos de agentes

- ❌ Provider LLM hardcoded (`from openai import ...` direto)
- ❌ Prompt inline em string Python (não versionado)
- ❌ Tool sem validação de input (confiar cegamente no LLM)
- ❌ Estado global mutável entre runs (quebra concorrência)
- ❌ Sem eval harness no CI (regressão silenciosa)
- ❌ `eval()` ou `exec()` como tool (RCE trivial)
- ❌ Retry infinito sem backoff exponencial + jitter
- ❌ Misturar dois frameworks (LangGraph + LangChain + ...) no mesmo serviço
- ❌ PII nos logs de prompt/completion
