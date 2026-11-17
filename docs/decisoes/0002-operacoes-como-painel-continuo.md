# ADR-0002: Operações é um painel contínuo, não uma fase de iniciativa

## Status

proposta.

## Contexto

`devops`, `release`, `observability`, `incident` e `sustain` já eram marcados como
`stream: "operation"` no catálogo de fases, mas conviviam no **mesmo array linear**
das fases de Upstream e Downstream, e contavam para o total e para o "feito" de
**qualquer** iniciativa de delivery.

Isso modela errado a natureza do trabalho. Uma iniciativa (`feature`, `hotfix` ou
`modernization`) tem início e fim: as fases de Upstream e Downstream fecham quando a
iniciativa entrega. Operação (deploy contínuo, observabilidade, resposta a incidente,
patches de sustentação) não tem fim. Ela não é uma etapa que uma iniciativa
"conclui", e sim uma capacidade do workspace inteiro, que continua existindo depois
que toda iniciativa em curso já fechou.

Consequência prática: não havia, em lugar nenhum do Cockpit, uma tela que respondesse
"o que está rodando em produção agora" ou "qual foi o último patch do `@sustain`". Se
essa informação existisse, estaria fatiada dentro de cada iniciativa, nunca agregada.

## Decisão

Operação deixa de ser modelada como fases dentro do ciclo de vida de uma iniciativa e
vira um **painel dedicado do Cockpit**, uma aba própria ("Operações"), com escopo de
workspace inteiro.

O conteúdo da v1, em três blocos:
1. **Ações N1:** atalhos para rodar `@devops`, `@release` e `@sustain` (deploy,
   rollback, patch).
2. **Status de observabilidade e de incidentes:** o que `@observability` e
   `@incident` registram (alertas ativos, health checks, post-mortems recentes).
3. **Histórico de patches:** o log do que o `@sustain` corrigiu ou atualizou ao longo
   do tempo, fora do ciclo das iniciativas.

Os agentes de Operação (`@devops`, `@observability`, `@incident` e `@sustain`)
escrevem os artefatos que o painel lê, em `.github/artifacts/operations/`.

Consequência de modelagem: as cinco fases de `stream: "operation"` deixam de contar no
total e no "feito" de uma iniciativa comum, e uma `feature` ou um `hotfix` concluído
passa a mostrar 100% sem depender da Operação. Essa mudança só vem **depois** de o
painel existir, para a métrica de Operação não desaparecer sem ter onde viver.

## Consequências

**Positivas:**
- O que era invisível (deploys, incidentes, patches contínuos) ganha uma casa própria,
  navegável a qualquer momento.
- Corrige a métrica de conclusão das iniciativas, que ficava presa a fases que a
  iniciativa nunca vai concluir.
- Cria o espaço certo para crescer: telemetria real de produção, quando existir, tem
  para onde ir sem forçar mais um item na escada de 16 fases.

**Negativas:**
- É o item de maior esforço e incerteza do plano: depende de uma decisão de produto
  sobre o formato exato dos artefatos que cada agente de Operação escreve. Há risco de
  estourar o escopo se não for cortado num MVP simples por bloco.
- O progresso por stream e o dashboard liam as cinco fases de Operação como parte do
  progresso de uma iniciativa. Remover essa contagem exige cuidado para não quebrar
  esses dois consumidores, e por isso vem por último.

Veja [as etapas](../metodologia/streams.md#operação-operation).
