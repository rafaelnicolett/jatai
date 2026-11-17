# ADR-0001: Fluxos de delivery diferentes por tipo de iniciativa (não um funil único)

## Status

proposta.

## Contexto

O Cockpit modelava toda iniciativa de delivery contra o mesmo catálogo linear de 16
fases (Business Brief, Product, UX Design, Domínio, BDD, Arquitetura, Sprint Plan,
Sprint Runner, Backend, Frontend, Reviewer, DevOps, Release, Observability,
Incidente e Sustentação), qualquer que fosse o `type` da iniciativa (`feature`,
`modernization`, `hotfix` ou `foundation`).

Esse funil único faz sentido para `feature`. Não faz sentido para `hotfix`: um bug
reportado e corrigido (diagnóstico, fix com testes e validação, em horas e não em
sprints) não passa por Business Brief, PRD, UX Design ou Sprint Runner. Na prática,
um hotfix sem gate de Planejamento completo caía na escada genérica e mostrava
"0/18" mesmo com o trabalho real inteiramente concluído.

Já existia um mecanismo parcial: uma iniciativa com gate de Planejamento (como a
`modernization`) renderiza uma vista guiada por `waves` em vez do catálogo de 16
fases. O gatilho, porém, era acoplado ao nome `modernization`, e não a um conceito
mais amplo de "iniciativa que não segue o funil padrão".

## Decisão

O tipo da iniciativa (`Initiative.type`) determina qual fluxo de fases o Cockpit
mostra, e não é só um rótulo:

- `feature` (ou ausente): o funil de 16 fases.
- `hotfix`: a vista por `waves`, com um modelo padrão de três ondas, **Diagnóstico**,
  **Fix e testes** e **Validação**. Reaproveita o mesmo mecanismo de dados
  (`Initiative.waves` e `Initiative.wave_status`) que a `modernization` já usa. Nenhum
  campo novo no schema de `initiatives.yaml`.
- `modernization`: continua como está, com ondas livres, definidas pelo
  `@modernization-planner` em cada iniciativa.
- `foundation`: fora do escopo desta decisão, porque já tem fluxo próprio.

A vista "por ondas" deixa de ser específica de `modernization` e passa a ser a vista
genérica, parametrizada por um vocabulário (rótulos e ícones) que varia com o tipo. O
Cockpit decide por ela quando o tipo é `modernization` ou `hotfix`, ou quando a
iniciativa tem gate de Planejamento, e pelo funil de 16 fases nos demais casos.

## Consequências

**Positivas:**
- Um hotfix passa a refletir o progresso real, em três ondas pequenas, em vez de uma
  métrica de 18 itens que nunca fecha.
- Zero migração de dado: `type: hotfix` e `waves:` já eram campos válidos. A mudança
  é de roteamento de interface mais um componente generalizado.
- Abre o caminho para tipos futuros reaproveitarem o mesmo mecanismo, sem um
  componente novo por tipo.

**Negativas:**
- A generalização do componente (nomes, testes, comentários) é churn de código sem
  mudança de comportamento para quem já usa `modernization`, com risco de regressão
  se algum texto fixo de "modernização" vazar para a tela de um hotfix.
- O componente não tinha teste automatizado: um teste de caracterização é
  pré-requisito do refactor de generalização, e não só desejável.

Veja [iniciativas](../metodologia/iniciativas.md).
