# Strangler

O **Strangler** (a figueira estranguladora, de Martin Fowler) troca um sistema ou um
módulo velho por um novo sem desligar o velho: o novo cresce em volta, capacidade
por capacidade, até o velho não ter mais o que fazer.

## Quando usar

Quando você precisa substituir um módulo ou um sistema inteiro sem parada: de um
monólito para serviços, de uma tela antiga para uma nova (rota por rota), de uma
biblioteca para outra (capacidade por capacidade).

Se o que muda é só uma implementação atrás de uma interface, uma abstração
resolve. Se muda o esquema dos dados, veja [Expand-Contract](expand-contract.md).

## Os passos

1. **Ponha uma fachada na frente do velho.** Um proxy, uma rota, uma interface: um
   ponto por onde passa tudo o que for trocado.
2. **Construa uma capacidade nova atrás da fachada**, no jeito novo, e deixe o resto
   como está.
3. **Roteie essa capacidade para o novo.** O resto continua no velho.
4. **Repita** capacidade por capacidade.
5. **Apague o velho** quando nada mais passar por ele. Sem esse passo, a figueira
   nunca termina.

A volta é barata: basta rotear a capacidade de novo para o velho.

## Como a Jataí aplica

- O `@modernization-planner` escolhe o Strangler quando o roadmap pede a troca de um
  módulo, e escreve o passo a passo, o plano de volta e o critério de corte.
- O `@migration-agent` e o `@refactor-agent` executam um passo por PR, com a suíte
  verde nos dois lados.
- Antes de qualquer passo, o `@test-backfill-agent` fixa o comportamento de hoje
  com [testes de caracterização](testes-de-caracterizacao.md), porque é a suíte que
  prova que o novo faz o que o velho fazia.

No [workspace demo](../../../demo/README.md), a modernização
`mod-emprestimos-hexagonal` usa Strangler na terceira onda: os repositórios SQL são
trocados por adaptadores um a um, com a suíte verde a cada troca.

A própria Jataí usa a prática em dois níveis. O repositório aberto nasceu de um
snapshot do produto anterior e evoluiu ao lado dele, enquanto o original ficou só
com correções ([ADR-0012](../../decisoes/0012-repositorio-isolado-jatai-strangler-parallel-run.md)).
E a troca do Wizard segue a mesma regra, em seis passos: da extração da sessão até
a remoção do Wizard antigo, com o protocolo entre as telas congelado e testado
([ADR-0019](../../decisoes/0019-wizard-app-react-no-webview.md)).

## Como saber que deu certo

- Cada passo foi publicado sozinho, sem parar nada.
- A fatia que passa pelo novo cresce a cada passo, e a do velho encolhe.
- Dá para voltar uma capacidade ao velho num passo só.
- No fim, o velho foi removido, e não apenas esquecido.

## Armadilhas

- **Estrangular sem teste.** Sem a rede de caracterização, ninguém sabe se o novo é
  igual ao velho.
- **Uma branch longa para o "novo".** O Strangler existe para evitar isso.
- **A fachada virar o novo monólito.** Mantenha-a fina: ela só roteia.
- **Nunca remover o velho.** Marque a remoção no roadmap, com um critério de corte.
