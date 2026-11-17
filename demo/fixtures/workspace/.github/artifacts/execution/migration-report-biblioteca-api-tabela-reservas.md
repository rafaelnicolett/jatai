# Migration · tabela de reservas da biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Tarefa `epic-1/task-1.2`, por `@migration-agent`.

## Escopo

- Stack: `python-fastapi`
- Itens migrados: 1 tabela nova (`reservas`), 0 tabelas alteradas

## Playbook seguido

- Padrão: Expand-Contract
- Etapas: 1. **expand** concluída, 2. migrate e 3. contract fora desta tarefa

O model `Reserva` (`app/models/reserva.py`) cria a tabela `reservas` ao lado de
`emprestimos`. Nada que já existe foi alterado, e nenhuma leitura depende da
tabela nova ainda.

## Rollback

Remover o model e rodar `DROP TABLE reservas`. A tabela não tem dado, então o
passo atrás não perde nada.

## Aprovação

Esta tarefa exige aprovação humana. Pessoa Exemplo aprovou em 2026-10-05.
