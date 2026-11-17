# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: .NET 8 (C#)
- **Framework**: ASP.NET Core
- **Arquitetura**: DDD Tactical (Aggregates + Domain Events)
- **Testes**: dotnet test
- **Observabilidade**: OpenTelemetry (hosting)

## Estrutura

Agregados, entidades, objetos de valor e eventos ficam no domínio; comandos e consultas (CQRS) ficam na aplicação.

Diretórios que o gerador criou:

```
src/Domain/Entities
src/Domain/ValueObjects
src/Domain/Ports
src/Domain/Events
src/Application/UseCases
src/Application/DTOs
src/Infrastructure/Persistence
src/Infrastructure/WebApi/Controllers
src/Infrastructure/WebApi/Middleware
tests/Unit
tests/Integration
```

## Comandos

```bash
# Rodar localmente
dotnet run --project src/Orbita.API

# Testes
dotnet test
```

## Agentes especializados

- **`@backend-dotnet`**: implementa código conforme DDD Tactical (Aggregates + Domain Events)
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de ddd-tactical

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
