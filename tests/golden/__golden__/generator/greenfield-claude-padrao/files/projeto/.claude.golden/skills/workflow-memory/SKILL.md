---
id: workflow-memory
name: workflow-memory
type: skill
description: >
  Sistema de memória cross-task para agentes downstream. Persiste contexto entre
  runs — decisões arquiteturais, padrões descobertos, erros encontrados e handoffs.
  Resolve o problema de amnésia entre execuções: cada agente começa informado,
  não do zero.
applicable_to:
  - "Todos os agentes downstream de build: backend-*, frontend-*"
  - "@sprint-runner (inicializa e monitora compactação)"
  - "@reviewer (registra achados para próxima iteração)"
inputs:
  - .github/artifacts/initiatives/<id>/memory/SHARED.md   (leitura obrigatória)
  - .github/artifacts/initiatives/<id>/memory/task-<phase>.md   (leitura obrigatória)
outputs:
  - .github/artifacts/initiatives/<id>/memory/SHARED.md   (atualizado após execução)
  - .github/artifacts/initiatives/<id>/memory/task-<phase>.md   (atualizado após execução)
---

# Skill: workflow-memory

> **Todo agente downstream lê memória antes de começar e escreve memória ao terminar.**
> Não pule. Não é opcional. É o que separa um agente que aprende de um que repete erros.

---

## 1. Estrutura de diretórios

```
.github/artifacts/initiatives/<initiative-id>/memory/
  ├── SHARED.md          ← contexto cross-task: decisões, padrões, riscos, handoffs
  ├── task-backend.md    ← memória específica do agente backend
  ├── task-frontend.md   ← memória específica do agente frontend
  ├── task-review.md     ← achados de review (escrito pelo @reviewer)
  └── _compacted/        ← rounds anteriores após compactação
        └── <YYYY-MM-DD-HH>-shared.md
```

O diretório é criado pelo `@sprint-runner` na abertura da sprint.
O `initiative-id` vem do `initiatives.yaml` (campo `active` ou contexto injetado pelo Maestro).

---

## 2. Protocolo READ — obrigatório ANTES de qualquer implementação

**Executar como Step 0**, antes de ler sprint-backlog, antes de escrever uma linha de código.

```markdown
## Carregando memória do workflow...

Iniciativa: <initiative-id>
Memória compartilhada: .github/artifacts/initiatives/<id>/memory/SHARED.md
Memória da fase:       .github/artifacts/initiatives/<id>/memory/task-<phase>.md
```

**Se os arquivos não existem**: criá-los com o template de scaffold (seção 5).
**Se existem**: lê-los integralmente e tratar como contexto prioritário — maior peso que o sprint-backlog.

### O que priorizar na leitura

| Seção | O que procurar |
|---|---|
| `## Decisões Arquiteturais` | Padrões já escolhidos — **não contradizer sem escalar** |
| `## Padrões Descobertos` | Como o codebase está organizado — **seguir** |
| `## Riscos Abertos` | Problemas conhecidos — **não ignorar** |
| `## Handoffs` | O que a fase anterior deixou para esta — **executar** |
| `## Erros Encontrados` | Falhas da fase anterior — **não repetir** |

---

## 3. Protocolo WRITE — obrigatório DEPOIS de qualquer execução

**Executar como último passo**, após todos os artefatos entregues e `delivery-state.yaml` atualizado.

### 3a. Escrever/atualizar `task-<phase>.md`

Registra o que aconteceu NESTA fase específica:

```markdown
## Objetivo
<o que esta fase precisava entregar — copiar do sprint-backlog>

## Implementado
- <lista de o que foi feito, conciso>

## Arquivos Tocados
- <path relativo do arquivo> — <motivo>

## Decisões Locais
- <decisão tomada> — <motivo>

## Erros Encontrados
- <erro> — <como foi resolvido ou está aberto>

## Pronto para Próxima Fase
- <o que a próxima fase pode assumir como pronto>

## Última Atualização
<YYYY-MM-DD> por @<agente>
```

### 3b. Promover para `SHARED.md` (só o que é cross-task)

Regra de promoção: **só sobe para SHARED o que a PRÓXIMA fase precisa saber**.

| Promover | Não promover |
|---|---|
| Decisão arquitetural nova (ex: "usamos JWT stateless com refresh rotation") | Detalhe de implementação local |
| Padrão descoberto no codebase (ex: "auth usa decorator `@require_role`") | Log de erro já resolvido |
| Risco aberto que bloqueia outra fase | Status de task já entregue |
| Handoff explícito para próxima fase | Comentário de progresso |

Seções obrigatórias do `SHARED.md`:

```markdown
# Memória Compartilhada — <initiative-name>

## Decisões Arquiteturais
<!-- Decisões que TODAS as fases seguintes devem respeitar -->
- [<YYYY-MM-DD>] [@<agente>] <decisão> — <rationale>

## Padrões Descobertos
<!-- Como o codebase está organizado; padrões que os agentes devem seguir -->
- <padrão> — <onde está / exemplo de arquivo>

## Riscos Abertos
<!-- Problemas que podem impactar fases seguintes — resolver ou escalar -->
- [ ] [P<prioridade>] <risco> — descoberto por @<agente> em <data>

## Handoffs Entre Fases
<!-- O que cada fase deixou explicitamente para a próxima -->
- [@<fase-origem> → @<fase-destino>] <o que foi deixado>

## Erros a Não Repetir
<!-- Falhas encontradas que o próximo agente não deve cometer -->
- <erro> — encontrado por @<agente>; solução: <o que fazer>

## Última Atualização
<YYYY-MM-DD> por @<agente>
```

---

## 4. Protocolo COMPACTION — quando arquivo excede limites

**Limites de soft cap:**
- `SHARED.md`: 150 linhas ou 12 KB
- `task-<phase>.md`: 200 linhas ou 16 KB

**Trigger**: verificar tamanho ao final de cada WRITE.

**Procedimento de compactação:**

1. Ler o arquivo atual integralmente
2. Criar `_compacted/<YYYY-MM-DD-HH>-<filename>` com o conteúdo original (preservação)
3. Reescrever o arquivo mantendo:
   - Todas as decisões ainda ativas
   - Todos os riscos ainda abertos
   - Handoffs ainda não resolvidos
   - Padrões ainda relevantes
4. Remover:
   - Decisões revogadas
   - Riscos já resolvidos
   - Erros corrigidos há mais de 2 fases
   - Detalhes de implementação obsoletos

**Resultado**: arquivo reduzido para ≤ 60% do soft cap, sem perder informação ativa.

---

## 5. Templates de scaffold (quando arquivos não existem)

### Template: `SHARED.md`

```markdown
# Memória Compartilhada — <initiative-name>

Criada em: <YYYY-MM-DD> por @sprint-runner

## Decisões Arquiteturais
<!-- Nenhuma ainda -->

## Padrões Descobertos
<!-- Nenhum ainda — será preenchido pelos agentes de build -->

## Riscos Abertos
<!-- Nenhum ainda -->

## Handoffs Entre Fases
<!-- Nenhum ainda -->

## Erros a Não Repetir
<!-- Nenhum ainda -->

## Última Atualização
<YYYY-MM-DD> por @sprint-runner
```

### Template: `task-<phase>.md`

```markdown
# Memória da Fase: <phase> — <initiative-name>

Criada em: <YYYY-MM-DD>

## Objetivo
<!-- Preenchido pelo agente ao iniciar -->

## Implementado
<!-- Preenchido ao concluir -->

## Arquivos Tocados
<!-- Preenchido ao concluir -->

## Decisões Locais
<!-- Preenchido durante execução -->

## Erros Encontrados
<!-- Preenchido durante execução -->

## Pronto para Próxima Fase
<!-- Preenchido ao concluir -->

## Última Atualização
<!-- Preenchido ao concluir -->
```

---

## 6. Integração com delivery-state.yaml (cockpit)

Ao concluir WRITE, adicionar campos opcionais na fase do `delivery-state.yaml`:

```yaml
phases:
  backend:
    status: done
    agent: "@backend-python-api"
    completed_at: "2026-05-16T10:00:00Z"
    # Campos adicionados pela skill workflow-memory:
    memory:
      shared: ".github/artifacts/initiatives/<id>/memory/SHARED.md"
      task:   ".github/artifacts/initiatives/<id>/memory/task-backend.md"
      decisions_count: <N>      # número de decisões registradas no SHARED.md
      risks_open: <N>           # número de riscos abertos no SHARED.md
      files_touched_count: <N>  # número de arquivos listados em task-backend.md
```

> Esses campos são **opcionais e aditivos** — o Cockpit ignora o que não conhece.

---

## 7. Regras de ouro

1. **Leia antes de escrever** — sempre. Sem exceção.
2. **Não duplique o que já está no repo** — memória não é cópia de código; é contexto perdido.
3. **Promova só o cross-task** — SHARED.md não é diário; é guia para a próxima fase.
4. **Compacte quando atingir o limite** — contexto inflado prejudica mais do que ajuda.
5. **Não apague riscos abertos** — só fecha risco com solução documentada.
