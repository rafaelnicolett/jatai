# Stack e skills confirmadas

> Workspace demo fictício: os números e os achados abaixo são inventados.

Confirmado com Pessoa Exemplo no gate de Stack Config.

| Repositório | Stack | Agente de Execução | Padrão arquitetural (skill) |
|---|---|---|---|
| biblioteca-api | `python-fastapi` | `@backend-python-api` | `arch-layered` (hoje); `arch-hexagonal` só dentro de uma iniciativa de modernização |
| biblioteca-web | `react-vite-typescript` | `@frontend-react` | `arch-feature-based` |

O alvo hexagonal não mora aqui nem no `repos.yaml`: ele vive na iniciativa
`mod-emprestimos-hexagonal`.
