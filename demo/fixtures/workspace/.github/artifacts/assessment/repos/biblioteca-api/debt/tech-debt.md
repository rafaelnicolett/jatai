# Dívida técnica · biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Quadrantes de Fowler: prudente ou imprudente, deliberada ou inadvertida. Os
juros dizem o que a dívida cobra a cada mudança.

| id | Achado | Quadrante | Juros | Severidade |
|---|---|---|---|---|
| debt-api-01 | `EmprestimoService` mistura regra de negócio e acesso a dados | prudente, inadvertida | alto: toda regra nova de empréstimo mexe no banco | high |
| debt-api-02 | `app/services/prazo.py` sem teste automatizado | imprudente, inadvertida | médio: um erro de prazo passa sem aviso | medium |
| debt-api-03 | `app/routers/livros.py` consulta o banco sem service nem repository | prudente, deliberada | médio: a regra de catálogo vai nascer no router | medium |
| debt-api-04 | Sem arquivo de lock das dependências | imprudente, inadvertida | baixo: versão diferente em cada máquina | low |
| debt-api-05 | `app/config.py` lê o ambiente na importação | prudente, inadvertida | baixo: difícil testar com outros valores | low |

## Ganhos rápidos

1. Testar `prazo.py` (`debt-api-02`).
2. Gerar o arquivo de lock (`debt-api-04`).
3. Passar a configuração por parâmetro (`debt-api-05`).
4. Dar `response_model` a `livros.py` (`q-api-3`).
5. Criar a tabela de membros antes de a fila depender dela (`q-api-2`).
