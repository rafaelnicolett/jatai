# Test Backfill · fluxo de empréstimo da biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Tarefa `epic-1/task-1.1`, por `@test-backfill-agent`.

## Alvo

- Módulo: `app/services/emprestimo_service.py`
- Cobertura antes: 31%
- Cobertura depois: 78%

## Testes criados

| Arquivo | Tipo | O que fixa |
|---|---|---|
| `tests/test_emprestimo_service.py` | caracterização | emprestar com exemplar livre grava o empréstimo com prazo; emprestar sem exemplar livre recusa |

## Comportamentos pinados

- O empréstimo recebe o prazo calculado por `calcular_prazo`.
- Sem exemplar livre, `emprestar` levanta `SemExemplarDisponivel` e nada é gravado.

## Known bugs

Nenhum encontrado neste módulo.

## Status

Pronto para a migração da tabela de reservas (`task-1.2`).
