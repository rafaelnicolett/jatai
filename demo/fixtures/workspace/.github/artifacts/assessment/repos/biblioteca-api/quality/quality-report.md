# Qualidade · biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

| Medida | Valor |
|---|---|
| Cobertura de linhas | 58% |
| Maior complexidade ciclomática | 3 (`EmprestimoService.devolver`) |
| Hotspot (mudança × complexidade) | `app/services/emprestimo_service.py` |

## Achados

| id | Severidade | Achado |
|---|---|---|
| q-api-1 | medium | `app/services/prazo.py` e os routers não têm teste |
| q-api-2 | low | `membro_id` é um inteiro solto: não há tabela de membros |
| q-api-3 | low | `app/routers/livros.py` responde sem `response_model` |
