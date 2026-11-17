---
id: legacy-modernization-patterns
name: legacy-modernization-patterns
type: skill
description: >
  Padrões canônicos para modernizar sistemas legados de forma incremental e
  reversível: Strangler Fig, Branch by Abstraction, Anti-Corruption Layer,
  Parallel Run, Expand-Contract. Filosofia: nunca big bang. Usada por
  @modernization-planner, @migration-agent, @refactor-agent.
applicable_to:
  - "@modernization-planner"
  - "@migration-agent"
  - "@refactor-agent"
inputs:
  - modernization-roadmap.md
  - arch-discovery.md
outputs:
  - escolha de padrão por iniciativa de modernização
---

# Skill: legacy-modernization-patterns

> **Nunca big bang. Sempre incremental, reversível, shippable.**
> Michael Feathers · Martin Fowler · Sam Newman.

## 1. Strangler Fig (Fowler)

**Quando**: substituir um sistema/módulo legado por um novo, sem downtime.

**Como**:
1. Coloque um **proxy/façade** na frente do legado.
2. Implemente a versão nova de uma **capability** atrás do proxy.
3. Roteie essa capability para o novo; mantenha o resto no legado.
4. Repita até o legado morrer ("estrangulado").

**Aplicações**:
- Substituir monolito por microservices
- Migrar UI antiga para nova (route por rota)
- Trocar ORM (capability por capability)

**Reversibilidade**: alta — basta reroteamento.

## 2. Branch by Abstraction (Hammant)

**Quando**: trocar uma implementação sem branches longos de Git.

**Como**:
1. Introduza uma **abstração** (interface) cobrindo a implementação atual.
2. Migre os consumidores para usar a abstração.
3. Crie a implementação nova atrás da mesma abstração.
4. Switch via feature flag.
5. Remova a implementação antiga.

**Aplicações**:
- Trocar lib (jQuery → React, Hibernate → MyBatis)
- Trocar serviço externo (Stripe → outro PSP)
- Refactor de algoritmo crítico

**Reversibilidade**: total via flag.

## 3. Anti-Corruption Layer (Evans, DDD)

**Quando**: um contexto novo precisa interagir com um legado de modelo sujo.

**Como**:
1. Crie uma camada **tradutora** entre os contextos.
2. ACL recebe modelos do legado e converte para modelos limpos do novo.
3. Novo contexto **nunca** importa modelos do legado diretamente.

**Aplicações**:
- Bounded context novo encostando em DB legado compartilhado
- Integração com sistema externo de outra empresa
- Substituir gradualmente um sistema mantendo integração

**Reversibilidade**: alta — ACL é descartável.

## 4. Parallel Run

**Quando**: substituir lógica crítica (cobrança, cálculo) onde erros são caros.

**Como**:
1. Rode versão nova **em paralelo** com a antiga.
2. Compare outputs.
3. Logue divergências.
4. Quando convergência > threshold (ex: 99.9% por N dias), faça cutover.

**Aplicações**:
- Mudar algoritmo de cálculo de preço
- Substituir sistema de billing
- Refactor de regra de risco/crédito

**Reversibilidade**: total durante o paralelismo.

## 5. Expand-Contract (Database)

**Quando**: alterar schema de DB sem downtime e sem perder rollback.

**Como**:
1. **Expand**: adicione novo schema (coluna nova, tabela nova) compatível
2. **Migrate**: dual-write (escrever no antigo E no novo)
3. **Switch reads**: ler do novo
4. **Contract**: remover o antigo

**Aplicações**:
- Renomear coluna
- Migrar tabela monolítica para tabelas normalizadas
- Trocar tipo de coluna

**Reversibilidade**: alta nas fases 1-2, decrescente após contract.

## 6. Como escolher

| Situação | Padrão recomendado |
|---|---|
| Substituir módulo inteiro | Strangler Fig |
| Trocar implementação de uma capability | Branch by Abstraction |
| Encostar contexto novo em legado sujo | Anti-Corruption Layer |
| Mudar lógica crítica de cálculo | Parallel Run |
| Migrar schema de DB | Expand-Contract |
| Upgrade major de framework | Branch by Abstraction + ACL |

## 7. Anti-padrões

- ❌ **Rewrite**: jogar fora e refazer (quase sempre falha — Joel Spolsky)
- ❌ **Big Bang Migration**: tudo de uma vez em uma release
- ❌ **Long-lived feature branch**: branch que vive >1 sprint
- ❌ **Migrar sem testes**: characterization tests primeiro
- ❌ **Migrar sem rollback**: cada passo precisa de plano de volta

## 8. Cheatsheet para o roadmap

Para cada iniciativa do roadmap, especifique:

```markdown
### {Iniciativa}
- Padrão: {Strangler Fig | Branch by Abstraction | ACL | Parallel Run | Expand-Contract}
- Passos:
  1. ...
  2. ...
- Rollback: ...
- Critério de cutover: ...
- Pré-req: cobertura mínima de X% no escopo
```
