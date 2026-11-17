# ADR-0001: A fila de reservas anda por ordem de pedido

> Workspace demo fictício: a decisão e o contexto são inventados.

## Status

aceita. Decidido por Pessoa Exemplo em 2026-10-05.

## Contexto

Quando todos os exemplares de um livro estão emprestados, o sócio precisa
esperar. O balcão anota a espera num papel e chama as pessoas na ordem em que
lembra. A feature `feat-reserva-com-fila` põe essa fila no sistema, e alguém
precisa decidir quem passa na frente.

## Decisão

A fila anda **por ordem de pedido**. Quem pediu primeiro é chamado primeiro, sem
prioridade para sócio com livro atrasado nem para sócio antigo. O desempate de
pedidos do mesmo instante é pelo id da reserva.

## Consequências

- (+) A regra é simples de explicar no balcão e de testar.
- (+) Ninguém é ultrapassado sem motivo à vista.
- (−) Um sócio com muitos atrasos espera igual a quem sempre devolveu em dia.
- (−) Mudar para uma fila com prioridade exige uma ADR nova que substitua esta.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Prioridade para quem nunca atrasou | Difícil de explicar e de auditar no balcão |
| Fila em memória, sem tabela | Perde a fila a cada reinício do serviço |
