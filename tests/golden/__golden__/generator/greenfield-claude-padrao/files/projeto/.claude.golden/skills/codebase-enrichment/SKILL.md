---
id: codebase-enrichment
name: codebase-enrichment
type: skill
description: >
  Protocolo de exploração do codebase antes de qualquer execução de task.
  Agentes não devem implementar código sem entender o que já existe no projeto:
  estrutura, padrões, dependências, testes existentes e arquivos que serão tocados.
  Resolve a "cegueira de codebase" — o agente entende o projeto real, não só os artefatos.
applicable_to:
  - "Todos os agentes downstream de build: backend-*, frontend-*"
inputs:
  - code/services/<service>/   (backend)
  - code/apps/<app>/           (frontend)
  - pyproject.toml / pom.xml / *.csproj / pubspec.yaml / package.json / build.gradle
outputs:
  - Bloco "## Codebase Context" injetado no contexto do agente antes da implementação
---

# Skill: codebase-enrichment

> **Antes de escrever código, explore o código que já existe.**
> Um agente que não conhece o projeto cria inconsistências, duplicações e conflitos.
> Esta skill define o protocolo obrigatório de exploração pré-execução.

---

## 1. Quando executar

**Step 0 de qualquer agente de build** — antes de ler o sprint-backlog como guia de implementação, antes de escrever qualquer arquivo.

Ordem correta:
```
[Step 0] workflow-memory READ       ← carrega contexto de runs anteriores
[Step 0b] codebase-enrichment SCAN  ← explora o codebase atual
[Step 1+] implementação             ← agora o agente conhece o terreno
```

---

## 2. Escopo de scan por tipo de agente

### Backend agents (`@backend-*`)

| O que scanear | Como |
|---|---|
| **Estrutura de pastas** | Listar `code/services/<service>/` até 3 níveis de profundidade |
| **Dependências relevantes** | Ler `pyproject.toml` / `pom.xml` / `*.csproj` / `go.mod` — extrair versões das libs principais |
| **Padrões de organização** | Identificar: como domínio está estruturado, como endpoints são registrados, naming conventions |
| **Testes existentes** | Listar `tests/` ou `src/test/` — quantos arquivos, qual framework, quais suites existem |
| **Arquivos relacionados à task** | Buscar por keyword da feature no sprint-backlog — quais arquivos já tocam esse domínio |
| **Migrations / schema** | Se existir `migrations/` ou `schema.sql` — entender estado atual do banco |

### Frontend agents (`@frontend-*`)

| O que scanear | Como |
|---|---|
| **Estrutura de componentes** | Listar `src/` ou `lib/` até 3 níveis |
| **Dependências relevantes** | Ler `package.json` / `pubspec.yaml` / `build.gradle` — libs de UI, state, HTTP |
| **Padrões de componentes** | Como componentes são estruturados, naming, como props são tipadas |
| **State management** | Qual lib está sendo usada e como (stores, providers, blocs) |
| **Design system** | Quais tokens/componentes base já existem |
| **Testes existentes** | Suites de unit/component/E2E — framework e cobertura atual |
| **Arquivos relacionados à task** | Features/componentes que serão afetados pela task atual |

---

## 3. Output: bloco "Codebase Context"

Após o scan, o agente **constrói e injeta** este bloco antes de qualquer decisão de implementação:

```markdown
## Codebase Context (enriquecimento pré-execução)

**Serviço/App**: <nome>
**Scan em**: <YYYY-MM-DD HH:mm>

### STRUCTURE
<layout resumido do diretório — apenas paths relevantes, não tudo>
Ex:
  code/services/billing-api/
  ├── domain/           (3 aggregates: Customer, Invoice, Payment)
  ├── application/      (8 use cases)
  ├── infrastructure/   (postgres adapter, redis cache)
  └── api/              (FastAPI routers: /auth, /invoices, /payments)

### DEPS
<dependências relevantes com versão>
Ex:
  fastapi==0.115.0, pydantic==2.7.1, sqlalchemy==2.0.30
  pytest==8.2.0, testcontainers==4.4.0

### PATTERNS
<padrões detectados que o agente DEVE seguir>
Ex:
  - Auth usa decorator @require_role("admin") nos endpoints protegidos
  - Repositories retornam Result[T, DomainError] (nunca lançam exceção)
  - Testes de integração usam fixture `db_session` com rollback automático
  - Naming: use cases são classes com método único `execute(cmd: XxxCommand)`

### TESTS
<estado atual dos testes>
Ex:
  tests/unit/     — 47 casos, todos passando
  tests/integration/ — 12 casos, usa testcontainers (postgres 16)
  Cobertura atual: ~68% (threshold configurado: 70%)

### RELATED FILES
<arquivos que provavelmente serão tocados por esta task>
Ex:
  domain/user/user.py              — entidade User (adicionar campo `last_login`)
  application/auth/login_use_case.py — implementar refresh token
  api/auth/router.py               — novo endpoint POST /auth/refresh
  tests/unit/domain/test_user.py   — adicionar testes do novo campo
```

---

## 4. Como usar o bloco durante a implementação

- **STRUCTURE**: garante que novos arquivos sejam criados na pasta certa, seguindo a convenção existente
- **DEPS**: proíbe introduzir novas dependências que já existem com outro nome; assegura compatibilidade de versão
- **PATTERNS**: cada decisão de implementação deve ser consistente com os padrões listados — se contradizer, documentar o motivo em `task-<phase>.md`
- **TESTS**: se cobertura atual está abaixo do threshold, a task **deve** incluir testes que ajudem a fechar o gap
- **RELATED FILES**: lista de partida para saber onde implementar — não é exaustiva, mas evita criar arquivos duplicados

---

## 5. Regras de enriquecimento seguro

1. **Não modifique nada durante o scan** — esta fase é somente leitura.
2. **Scan superficial, não exaustivo** — objetivo é contexto, não análise estática completa. Máximo 3 níveis de profundidade.
3. **Se o serviço/app não existe ainda** (projeto novo): registrar no bloco `STRUCTURE: (projeto novo — sem código existente)` e prosseguir.
4. **Se o scan encontrar inconsistências** (ex: dois padrões conflitantes no mesmo codebase): registrar em `task-<phase>.md` sob `## Erros Encontrados` e seguir o padrão mais recente (arquivo com data mais nova).
5. **Promover padrões descobertos para `SHARED.md`** via skill `workflow-memory` ao final da execução — para que agentes de outras fases também se beneficiem.

---

## 6. Integração com workflow-memory

O bloco **Codebase Context** não é persistido como arquivo separado.
Os **padrões descobertos** durante o scan que forem relevantes cross-task são promovidos para `SHARED.md` na seção `## Padrões Descobertos` pelo protocolo WRITE da skill `workflow-memory`.

Fluxo completo:
```
SCAN (esta skill)
  → bloco "Codebase Context" injetado no contexto
  → implementação executada com contexto rico
  → padrões novos descobertos → promovidos ao SHARED.md (workflow-memory WRITE)
  → próxima fase herda os padrões via SHARED.md (workflow-memory READ)
```

---

## 7. Regras de ouro

1. **Scan sempre, mesmo em projeto vazio** — registra o estado atual, não assume.
2. **Seguir padrões existentes** — não inventar arquitetura nova sem documentar decisão no SHARED.md.
3. **Registrar padrões novos encontrados** — o próximo agente não vai re-descobrir o que você já sabe.
4. **Não deixar o bloco genérico** — "structure: <service>" sem conteúdo real é inútil. Se não conseguiu scanear, diga por quê.
