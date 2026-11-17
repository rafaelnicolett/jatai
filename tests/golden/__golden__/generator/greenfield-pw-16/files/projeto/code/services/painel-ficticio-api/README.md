# painel-ficticio-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: .NET 8 (C#)
- **Framework**: ASP.NET Core
- **Arquitetura**: Vertical Slice Architecture
- **Testes**: dotnet test
- **Observabilidade**: OpenTelemetry (hosting)

## Estrutura

Cada feature é autocontida (domínio, infraestrutura e API juntos). O que é comum a todas fica em shared.

Diretórios que o gerador criou:

```
src/Features/Health
src/Shared/Persistence
src/Shared/Observability
src/API
tests/Features
```

## Comandos

```bash
# Rodar localmente
dotnet run --project src/PainelFicticio.API

# Testes
dotnet test
```

## Agentes especializados

- **`@backend-dotnet`**: implementa código conforme Vertical Slice Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de vertical-slice

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
