# Iniciativas: feature, modernização e hotfix

Com o Gate D1 aprovado, o projeto está pronto para receber iniciativas. Uma
**iniciativa** é uma unidade de trabalho com começo, meio e fim, registrada em
`.github/artifacts/initiatives.yaml`. Você diz a intenção em português simples, e
o orquestrador classifica e roteia.

| Você diz | Tipo | Quem entra | O que exige |
|---|---|---|---|
| "mapear o projeto" | Descoberta | `@assessor` | nada |
| "planejar a modernização" | Planejamento | `@modernization-planner` | o D1 aprovado |
| "adicionar a feature Y" | `feature` | `@feature-adder` | a Descoberta aprovada |
| "refatorar o módulo X" | `modernization` | `@refactor-agent` | o roadmap e a matriz de risco aprovados (D2) e a cobertura mínima |
| "migrar para a versão 3" | `modernization` | `@migration-agent` | o D2 e a cobertura mínima |
| "hotfix em produção" | `hotfix` | o orquestrador abre a iniciativa e conduz as três ondas | a Descoberta aprovada |

## Os três tipos

### Feature

Uma capacidade nova para quem usa o produto. O `@feature-adder` escreve os cenários
de teste (BDD) antes do código, no estilo do projeto, e nunca refatora de passagem.
Quando a feature pede uma migração incremental (uma tabela nova, por exemplo), ela
passa pelo Planejamento e pelo D2 como uma modernização, sem deixar de ser uma
feature: o meio é o mesmo, o fim é uma capacidade nova.

### Modernização

Mudar a forma como o código é feito, sem mudar o que ele faz: trocar de padrão
arquitetural, subir de versão, extrair um contexto. Tem quatro marcas:

- `arch_target`: o alvo de arquitetura, decidido no Planejamento e guardado na
  iniciativa;
- `driven_by`: os achados da Descoberta que a justificam. Sem achado, sem
  modernização;
- `scope`: os repositórios que ela toca. É o que o lock de modernização usa;
- `waves`: as ondas do roadmap, cada uma publicável sozinha.

Enquanto uma modernização estiver ativa, nenhuma iniciativa nova abre sobre os
repositórios do `scope` dela (veja o [D2](gates.md#d2-o-roadmap-vira-trabalho-de-verdade)).
Uma iniciativa que precisa esperar outra declara `depends_on`.

### Hotfix

Corrigir um defeito em produção. Em vez da escada de fases de uma feature, o hotfix
anda por três ondas, sempre as mesmas:

1. **Diagnóstico**: a causa raiz e o escopo do defeito, antes de mexer em código.
2. **Fix e testes**: a correção, com o teste que fixa o comportamento corrigido
   (a [regressão](praticas/testes-de-caracterizacao.md)).
3. **Validação**: confirmar, no ambiente real, que resolveu sem regressão.

## Épicos, tarefas e o estado de cada uma

O progresso de uma iniciativa fica em `initiatives.yaml`, em dois vocabulários que
convivem:

| Vocabulário | Campos | Quando |
|---|---|---|
| Ondas e itens (o padrão de escrita) | `waves`, `wave_status`, itens `item-1.1` | modernização e hotfix |
| Épicos e tarefas (opcional) | `epics`, `epic_status`, tarefas `task-1.1` | feature e quem escolher usar |

A hierarquia completa é **iniciativa, épico, feature, backlog e tarefa**. O épico é
o nome de uma onda. A "feature" é a ponte para os cenários BDD em
`features/<epic>/*.feature`, e a tarefa é o nome de um item. O hotfix continua
plano: iniciativa e tarefas, sem épico.

Os dois vocabulários são lidos para sempre, e dado antigo nunca é reescrito. A
escrita usa o das ondas, a não ser que você peça o outro (a opção
`--hierarchy epic-feature-backlog-task` do CLI, ou a setting
`jatai.deliveryHierarchy` da extensão).

Cada tarefa tem um [status de trabalho](estado-em-arquivos.md#status-de-trabalho),
e o épico (ou a onda) fecha quando todas as tarefas dele estão fechadas. O status
da iniciativa é `planned`, `in-progress`, `done`, `paused` ou `cancelled`.

Um item que exige aprovação humana própria (um passo com risco de dado em produção,
por exemplo) leva `requires_approval`. Ele só conta como fechado depois do seu
`human_approved_at`. Use isso com parcimônia: a aprovação de rotina já acontece nos
gates.

## Um exemplo completo

O [workspace demo](../../demo/README.md) tem uma iniciativa de cada tipo:

- `feat-reserva-com-fila`, uma feature em Execução, com épicos e tarefas em todos
  os estados;
- `hotfix-prazo-de-devolucao`, um hotfix concluído, do bug à publicação;
- `mod-emprestimos-hexagonal`, uma modernização ainda em Planejamento, que espera a
  feature terminar.

Gere o demo com `npm run demo` e abra o `initiatives.yaml` ao lado do Cockpit.
