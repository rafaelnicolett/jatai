# Convenções de código · biblioteca-web

> Workspace demo fictício: os números e os achados abaixo são inventados.

Como o time escreve hoje. Os agentes de Execução seguem isto, mesmo onde acharem
que daria para fazer melhor.

| Tema | Convenção |
|---|---|
| Nomes | Domínio em português (`ListaEmprestimos`, `rotuloDaPosicao`); componentes em `PascalCase`, funções em `camelCase` |
| Estrutura | Uma pasta por feature em `src/features`; chamadas HTTP em `src/api`; o que é de mais de uma tela em `src/shared` |
| Erros | A tela não trata falha de rede hoje (`debt-web-01`) |
| Testes | `vitest` só para funções puras; nome em português, com o comportamento esperado |
| Logging | Não há |
| Anti-padrão | Dado fixo no componente raiz (`debt-web-02`) |
