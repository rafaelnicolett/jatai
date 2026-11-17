# Dívida técnica · biblioteca-web

> Workspace demo fictício: os números e os achados abaixo são inventados.

| id | Achado | Quadrante | Juros | Severidade |
|---|---|---|---|---|
| debt-web-01 | As telas não tratam falha de rede (`ListaEmprestimos`, `FilaDeReservas`) | imprudente, inadvertida | médio: erro de rede deixa a tela vazia sem explicação | medium |
| debt-web-02 | O sócio é fixo em `src/App.tsx` (`membroId={7}`) | prudente, deliberada | baixo: some quando houver autenticação | low |
| debt-web-03 | Sem `package-lock.json` | imprudente, inadvertida | baixo: versão diferente em cada máquina | low |

## Ganhos rápidos

1. Mostrar uma mensagem quando a chamada falhar (`debt-web-01`).
2. Gerar o `package-lock.json` (`debt-web-03`).
3. Ligar `noUnusedLocals` (`q-web-2`).
4. Testar um componente com a biblioteca de testes da casa (`q-web-1`).
5. Tirar o sócio fixo para uma configuração (`debt-web-02`).
