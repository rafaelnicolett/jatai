# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: .NET 8 (C#)
- **Framework**: ASP.NET Core
- **Arquitetura**: Layered/N-Tier Architecture
- **Testes**: dotnet test
- **Observabilidade**: OpenTelemetry (hosting)

## Estrutura

Controladores chamam serviços, que chamam repositórios, que acessam os modelos.

Diretórios que o gerador criou:

```
src/Controllers
src/Services
src/Repositories
src/Models
src/Configuration
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

- **`@backend-dotnet`**: implementa código conforme Layered/N-Tier Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de layered

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
