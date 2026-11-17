# Feature · fila de reservas na biblioteca-web

> Workspace demo fictício: os números e os achados abaixo são inventados.

Tarefa `epic-3/task-3.1`, por `@feature-adder`. **Falhou.**

## O que aconteceu

A tela `FilaDeReservas` foi criada, mas dois testes de componente quebraram na
primeira execução:

- a tela não tem estado de carregamento: o teste esperava a mensagem "Carregando
  a fila" e a lista chega vazia;
- o botão Reservar aparece habilitado antes de a fila carregar.

Os testes de função pura (`rotuloDaPosicao`) passam.

## O que fazer

Reexecutar a tarefa depois de acrescentar o estado de carregamento. A tarefa
continua em `failed` com o motivo registrado até alguém decidir.

## Padrão arquitetural respeitado

Uma pasta por feature, sem importar outra feature. O que as telas dividem fica
em `src/shared`.

## Riscos identificados

- O portal depende do contrato da API (`task-1.3`), que espera aprovação.
- O portal não tem tema nem tokens de design (ver o relatório de design).
