<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @jatai (o orquestrador)

Este agente tem conteúdo diferente em cada edição do kit. As seções abaixo mostram uma por uma.

## Na edição: projeto existente (brownfield)

| Campo | Valor |
|---|---|
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/variants/brownfield/agents/maestro.agent.md` |

### O que faz

Jataí Brownfield — único ponto de entrada para projetos existentes. Orquestra Foundation → Iniciativas (feature/modernization/hotfix) com gates de aprovação. Roteia para Foundation primeiro, depois autoriza iniciativas com contexto descoberto.

Como chamar: Descreva a intenção (ex.: 'mapear o projeto', 'auditar segurança', 'planejar modernização', 'refatorar módulo X', 'migrar para Spring Boot 3', 'adicionar feature Y')

### Quando entra

- É o ponto de entrada: a conversa começa aqui, e ele roteia para o agente de cada etapa.

### Skills

- Nenhuma. O agente não carrega skill.

### O que recebe

- Nada declarado.

### O que produz

- Nada declarado.

## Na edição: projeto novo (greenfield)

| Campo | Valor |
|---|---|
| Edições do kit | projeto novo (greenfield) |
| Fonte | `kit/variants/greenfield/agents/maestro.agent.md` |

### O que faz

Jataí — orquestrador de delivery. Executa o pipeline completo de uma feature dentro desta sessão: cria iniciativa, roda as fases em sequência, pede confirmação entre elas. O cockpit acompanha passivamente via filesystem.

Como chamar: Descreva a feature ou app que quer entregar (ex: 'crie um CRUD de Lead', 'continua o BDD da feat-auth')

### Quando entra

- É o ponto de entrada: a conversa começa aqui, e ele roteia para o agente de cada etapa.

### Skills

- Nenhuma. O agente não carrega skill.

### O que recebe

- Nada declarado.

### O que produz

- Nada declarado.

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
