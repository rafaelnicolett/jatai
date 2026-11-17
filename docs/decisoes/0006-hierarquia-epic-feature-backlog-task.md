# ADR-0006: Hierarquia Epic, Feature, Backlog e Task no lugar de Wave e Item, reaproveitando a lista de features e o BDD que já existem

## Status

proposta.

## Contexto

O contrato de iniciativas modela o progresso da execução com dois níveis abaixo da
iniciativa: `wave_status` (texto livre `"wave-N: descrição"`) e, dentro dele, `items`
(`item-N.M`). Era o único vocabulário de backlog que o fluxo de projeto existente
usava. Ele não corresponde ao padrão de mercado (Jira, Azure DevOps, SAFe: Epic,
Feature, Story ou item de backlog, Task), e isso é um atrito real para qualquer time
que já trabalha com essa nomenclatura fora da Jataí.

O kit do **projeto novo** já resolvia boa parte disso, só que isolado do projeto
existente:
- `@product`, `@domain-modeler`, `@ux-designer` e `@sprint-planner` produzem
  `.github/artifacts/feature-list.md`;
- `@bdd` consome essa lista e devolve cenários Gherkin em
  `features/<bc>/<feature-slug>.feature`;
- `sprint-backlog.yaml` já modela grupos e itens, com os status
  `backlog`, `in-progress`, `review`, `done`, `blocked` e `descoped`: o vocabulário de
  backlog e de tarefa que se buscava.

O `sprint-backlog.yaml`, porém, já era uma dívida documentada onde é usado: quatro
formatos reais divergentes, tolerados por um parser que nunca os normaliza para um
formato canônico único.

## Decisão

Adotar **Iniciativa, Epic, Feature, Backlog e Task** como hierarquia única,
compartilhada pelo projeto novo e pelo projeto existente:

- **Epic:** renome direto de Wave. Mesmo formato de dado (`WaveStatusEntry` para
  `EpicStatusEntry`) e mesma semântica de status derivado (`done` só se todos os itens
  forem `done`).
- **Feature:** não é um campo novo inventado. É a ponte para
  `feature-list.md` e `features/<bc>/*.feature`, já produzidos pelo `@bdd` no projeto
  novo. No projeto existente, uma versão **leve** do mesmo passo: sem o ciclo espiral
  entre domínio e BDD, sem exigir um contexto delimitado já extraído. Uma lista curta
  de features por épico, com critério de aceite em Dado, Quando e Então, produzida
  como um passo novo dentro do protocolo do `@feature-adder` (e não um agente novo).
- **Backlog:** um formato canônico único, derivado do mais completo dos quatro formatos
  reais de `sprint-backlog.yaml` (sprints e itens), estendido com `epicRef` e
  `featureRef` para ligar de volta à hierarquia.
- **Task:** renome direto de Item (`WaveItemStatusEntry` para `TaskStatusEntry`).
- **O hotfix continua plano:** iniciativa e tarefa, sem Epic, Feature nem Backlog, sem
  camada intermediária. O modelo de três ondas do hotfix ganha uma versão no
  vocabulário novo, com a mesma estrutura.

A migração segue **Expand-Contract** (a [ADR-0007](0007-toggle-hierarquia-retrocompatibilidade.md)
descreve o rollout e a compatibilidade): primeiro os tipos novos existem ao lado dos
antigos, e a remoção dos antigos é uma decisão explícita e futura, que não faz parte
desta ADR.

**Não é objetivo** unificar `initiatives.yaml` e `sprint-backlog.yaml` num único
arquivo. Os dois continuam como artefatos separados, reconciliados por referência
(`epicRef` e `featureRef`) e não por fusão de schema, que é um problema maior.

## Consequências

**Positivas:**
- Um vocabulário só, legível por quem já trabalhou com Jira, Azure DevOps ou SAFe, em
  vez de um vocabulário próprio sem equivalente direto no mercado.
- Fecha, como efeito colateral, a divergência dos quatro formatos de backlog.
- Reaproveita a infraestrutura que já existe (a lista de features, o `@bdd` e o
  contrato do backlog) em vez de inventar um quarto modelo.
- O projeto existente ganha acesso a um pipeline (Feature real, com critério de
  aceite) que antes só o projeto novo tinha.

**Negativas:**
- Dois artefatos (`initiatives.yaml` e `sprint-backlog.yaml`) precisam ficar
  reconciliados por referência para sempre: mais superfície de inconsistência do que
  um arquivo único. É um trade-off aceito para não abrir uma migração maior.
- A lista leve de features é o único componente genuinamente novo (todo o resto é
  renome e consolidação) e o de maior incerteza.
- Times que já memorizaram "wave-1" e "item-2.3" precisam aprender o vocabulário novo.
  Mitigado pela retrocompatibilidade total da [ADR-0007](0007-toggle-hierarquia-retrocompatibilidade.md):
  nada existente precisa ser reescrito.

Veja [iniciativas](../metodologia/iniciativas.md).
