# Roadmap · Reserva de livros com fila de espera

> Workspace demo fictício: os números e os achados abaixo são inventados.

Iniciativa `feat-reserva-com-fila` (`type: feature`). Ela é uma feature de produto
que precisa de uma tabela nova, então segue o fluxo de Planejamento de uma
migração incremental (Expand-Contract), sem virar modernização.

## Estado atual (do Discovery)

A `biblioteca-api` empresta livros e não guarda pedido de espera. O portal só
lista empréstimos. O balcão registra a espera num papel.

## Visão de futuro

Quando não há exemplar, o sócio entra numa fila. A fila anda por ordem de pedido
([ADR-0001](../../../../docs/adr/0001-fila-de-reservas-por-ordem-de-pedido.md)).

## Estratégia

- Padrão: **Expand-Contract**. A tabela `reservas` nasce ao lado das existentes;
  nada que já existe é alterado.
- Cada épico fecha sozinho e pode ser publicado sozinho.
- BDD antes do código: um arquivo de cenários por épico, em `features/`.

## Épicos

| Épico | Repositório | Padrão | Paga dívida | Critério de sucesso |
|---|---|---|---|---|
| epic-1 · Modelo de reservas e API | `biblioteca-api` | Expand-Contract | `debt-api-02` | tabela criada sem tocar em `emprestimos`; contrato do `POST /reservas` aprovado |
| epic-2 · Fila de espera | `biblioteca-api` | — | — | fila por ordem de pedido; próximo avisado na devolução |
| epic-3 · Tela de reservas no portal | `biblioteca-web` | — | `debt-web-01` | fila e botão Reservar; falha de rede mostra mensagem |

## Pré-requisitos

- epic-1 exige testes de caracterização do fluxo de empréstimo antes de mexer
  no banco (`task-1.1`).
- epic-3 só começa depois que o contrato da API for aprovado (`task-1.3`).
