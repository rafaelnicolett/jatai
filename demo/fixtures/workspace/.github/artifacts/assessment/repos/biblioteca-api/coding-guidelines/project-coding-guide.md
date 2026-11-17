# Convenções de código · biblioteca-api

> Workspace demo fictício: os números e os achados abaixo são inventados.

Como o time escreve hoje. Os agentes de Execução seguem isto, mesmo onde acharem
que daria para fazer melhor (a melhoria é uma iniciativa de modernização).

| Tema | Convenção |
|---|---|
| Nomes | Domínio em português (`Emprestimo`, `calcular_prazo`); módulos e funções em `snake_case`; classes em `PascalCase` |
| Estrutura | `router → service → repository`, com `models` e `schemas` separados |
| Erros | O service levanta exceção de domínio (`SemExemplarDisponivel`); o router a traduz para HTTP |
| Testes | `pytest`, fakes escritos à mão (sem mock de módulo), nome `test_<comportamento>`; regressão leva o prefixo `test_regressao_` |
| Logging | Não há; o repositório ainda não registra nada |
| Anti-padrão | Service que consulta a sessão do banco (`debt-api-01`) |
