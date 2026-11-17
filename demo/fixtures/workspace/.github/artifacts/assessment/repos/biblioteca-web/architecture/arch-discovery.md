# Arquitetura · biblioteca-web

> Workspace demo fictício: os números e os achados abaixo são inventados.

**Padrão que o repositório é hoje:** por feature (`src/features/*`), com 79% de
confiança.

| Pasta | Papel |
|---|---|
| `src/features/emprestimos` | lista de empréstimos do sócio |
| `src/features/reservas` | fila de espera e botão Reservar |
| `src/api` | chamadas à biblioteca-api |
| `src/shared` | funções usadas por mais de uma tela |

As features não importam umas das outras. O que as duas usam (`formatarData`)
fica em `src/shared`.

## Anti-padrões

- O sócio é fixo no código (`membroId={7}` em `src/App.tsx:8`), sem
  autenticação (`debt-web-02`).

Diagrama: [`arch-discovery.drawio`](arch-discovery.drawio) (C4, nível de
contêineres).
