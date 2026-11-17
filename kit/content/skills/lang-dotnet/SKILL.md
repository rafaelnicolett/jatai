---
id: lang-dotnet
name: lang-dotnet
type: skill
description: Boas práticas da linguagem C# / .NET 8+ — idiomas modernos, nullable refs, async/await, DI, testes e observabilidade. Independente do padrão arquitetural.
applicable_to:
  - "@backend-dotnet"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-dotnet

> Boas práticas da **linguagem C# e plataforma .NET 8+**, não do padrão arquitetural.
> Para estrutura de camadas e pastas, use a skill `arch-*` correspondente.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| .NET | 8+ (LTS) | `<TargetFramework>net8.0</TargetFramework>` |
| Linguagem | C# 12 | Enable latest features no `.csproj` |
| Nullable refs | `<Nullable>enable</Nullable>` — **obrigatório** | Projeto não compila com warnings tratados como erros |
| Warnings como erros | `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` | CI falha em qualquer warning |
| API Framework | Minimal APIs (ASP.NET Core) ou Controllers — **1 por serviço** | Minimal para novos projetos |
| Validação | FluentValidation | Na borda — nunca no domínio |
| CQRS (opcional) | MediatR | Apenas se adotar Vertical Slice / CQRS explícito |
| ORM | Entity Framework Core 8 | Code-first, migrations, `AsNoTracking()` em queries |
| HTTP client (saída) | `IHttpClientFactory` + `HttpClient` tipado | Nunca `new HttpClient()` direto |
| Serialização | `System.Text.Json` | Configurar `JsonSerializerOptions` globalmente |
| Logs | Serilog + JSON sink (produção) | Structured logging com `{@Property}` |
| Observabilidade | OpenTelemetry .NET SDK | `AddAspNetCoreInstrumentation()`, `AddEntityFrameworkCoreInstrumentation()` |
| Test runner | xUnit 2.x | Convenção de projeto: `MyProject.Tests` |
| Assertions | FluentAssertions | `result.Should().Be(expected)` |
| Mocks | NSubstitute ou Moq | NSubstitute preferido para código funcional |
| Integration | `WebApplicationFactory<T>` + Testcontainers (.NET) | Sem banco em memória — banco real |
| Contract | Pact .NET | Consumer-driven contract testing |

## 2. C# 12 — idiomas modernos obrigatórios

### 2.1 Records para DTO e Value Objects
```csharp
// ✅ record — imutável, Equals/GetHashCode gerado
public record CarrinhoId(Guid Value)
{
    public static CarrinhoId New() => new(Guid.NewGuid());
}

public record AplicarCupomCommand(CarrinhoId CarrinhoId, string Codigo);

// ✅ record struct — para VOs pequenos (evita alocação heap)
public readonly record struct Percentual(decimal Value)
{
    public Percentual { ArgumentOutOfRangeException.ThrowIfNegative(Value); }
}

// ❌ Classe mutável como DTO
public class AplicarCupomCommand  // mutável, sem Equals semântico
{
    public string CarrinhoId { get; set; }
    public string Codigo { get; set; }
}
```

### 2.2 Nullable reference types — sem `!` operator
```csharp
// ✅ Nullable explícito onde possível ser null
public async Task<Carrinho?> BuscarAsync(CarrinhoId id, CancellationToken ct);

// ✅ Pattern matching para null-safety
var carrinho = await repo.BuscarAsync(id, ct);
if (carrinho is null)
    return Result.Failure<Carrinho>(CarrinhoError.NaoEncontrado(id));

// ❌ Force unwrap — NullReferenceException em produção
var carrinho = await repo.BuscarAsync(id, ct)!;  // proibido
```

### 2.3 async/await end-to-end — sem `.Result` nem `.Wait()`
```csharp
// ✅ Async propagado corretamente
public async Task<IResult> AplicarCupomAsync(
    Guid carrinhoId,
    AplicarCupomRequest request,
    IAplicarCupomUseCase useCase,
    CancellationToken ct)
{
    var result = await useCase.ExecuteAsync(new CarrinhoId(carrinhoId), request.Codigo, ct);
    return result.IsSuccess
        ? Results.Ok(CarrinhoResponse.From(result.Value))
        : Results.UnprocessableEntity(ErrorEnvelope.From(result.Error));
}

// ❌ Deadlock garantido em ASP.NET Core
var result = useCase.ExecuteAsync(...).Result;  // proibido
useCase.ExecuteAsync(...).Wait();               // proibido
```

### 2.4 Result type (sem exceção para fluxo de controle)
```csharp
// Usando OneOf ou implementação própria
public abstract record Result<T>
{
    public sealed record Success(T Value) : Result<T>;
    public sealed record Failure(DomainError Error) : Result<T>;
}

// Switch expression com pattern matching
return result switch
{
    Result<Carrinho>.Success(var carrinho) => Results.Ok(CarrinhoResponse.From(carrinho)),
    Result<Carrinho>.Failure(var error) => MapError(error),
    _ => Results.StatusCode(500)
};
```

### 2.5 Primary constructors (C# 12)
```csharp
// ✅ Mais conciso para classes de serviço/use case
public class AplicarCupomUseCase(
    ICarrinhoRepository carrinhoRepo,
    ICupomRepository cupomRepo,
    IDomainEventPublisher publisher) : IAplicarCupomUseCase
{
    public async Task<Result<Carrinho>> ExecuteAsync(CarrinhoId id, string codigo, CancellationToken ct)
    {
        var carrinho = await carrinhoRepo.BuscarAsync(id, ct);
        // ...
    }
}
```

## 3. ASP.NET Core — Minimal APIs (padrão)

```csharp
// Program.cs — Minimal API com DI explícita
var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddScoped<IAplicarCupomUseCase, AplicarCupomUseCase>()
    .AddScoped<ICarrinhoRepository, PostgresCarrinhoRepository>()
    .AddDbContext<AppDbContext>(opt => opt.UseNpgsql(builder.Configuration["DatabaseUrl"]))
    .AddOpenTelemetry()
        .WithTracing(t => t.AddAspNetCoreInstrumentation().AddNpgsql());

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

// Endpoint groups por bounded context
app.MapGroup("/v1/carrinhos").MapCarrinhoEndpoints();

app.Run();

// CarrinhoEndpoints.cs — extensão por feature
public static class CarrinhoEndpoints
{
    public static RouteGroupBuilder MapCarrinhoEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/{id:guid}/cupom", AplicarCupomHandler.Handle)
             .WithName("AplicarCupom")
             .WithSummary("Aplica cupom de desconto no carrinho")
             .Produces<CarrinhoResponse>()
             .Produces<ErrorEnvelope>(422)
             .RequireAuthorization();
        return group;
    }
}
```

## 4. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes/Interfaces | `PascalCase` | `CarrinhoRepository`, `IAplicarCupomUseCase` |
| Interfaces | Prefixo `I` | `ICarrinhoRepository` |
| Métodos públicos | `PascalCase` + sufixo `Async` | `AplicarCupomAsync()`, `BuscarAsync()` |
| Campos privados | `_camelCase` | `_carrinhoRepo` |
| Propriedades | `PascalCase` | `CarrinhoId`, `TotalLiquido` |
| Constantes | `PascalCase` | `MaxItensCarrinho` |
| Namespaces | `Company.Product.Feature` | `{{brand.displayName}}.Checkout.Domain` |

## 5. Pirâmide de testes (.NET)

```
     ▲ E2E (≤10%)        WebApplicationFactory + HTTP real
    ╱─╲ Contract (≈15%)   Pact .NET (consumer + provider)
   ╱───╲ Integração (≈25%) WebApplicationFactory + Testcontainers
  ╱─────╲ Unitário (≥50%)  xUnit puro, sem DI container
```

### 5.1 Unitário — sem WebApplicationFactory
```csharp
public class AplicarCupomUseCaseTests
{
    private readonly ICarrinhoRepository _carrinhoRepo = Substitute.For<ICarrinhoRepository>();
    private readonly ICupomRepository _cupomRepo = Substitute.For<ICupomRepository>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly AplicarCupomUseCase _sut;

    public AplicarCupomUseCaseTests()
        => _sut = new AplicarCupomUseCase(_carrinhoRepo, _cupomRepo, _publisher);

    [Fact]
    public async Task CupomExpirado_RetornaFailure()
    {
        var cupom = new Cupom(CupomId.New(), "PROMO", DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), Percentual(10));
        _cupomRepo.BuscarPorCodigoAsync("PROMO", default).Returns(cupom);

        var result = await _sut.ExecuteAsync(CarrinhoId.New(), "PROMO", default);

        result.Should().BeOfType<Result<Carrinho>.Failure>()
              .Which.Error.Should().BeOfType<CarrinhoError.CupomExpirado>();
    }
}
```

### 5.2 Integração com WebApplicationFactory + Testcontainers
```csharp
public class CarrinhoApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();

    public async Task InitializeAsync() => await _postgres.StartAsync();
    public async Task DisposeAsync() => await _postgres.DisposeAsync();

    [Fact]
    public async Task AplicarCupomValido_Retorna200()
    {
        var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("DatabaseUrl", _postgres.GetConnectionString()));
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/v1/carrinhos/{Guid.NewGuid()}/cupom",
            new { Codigo = "PROMO10" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

## 6. Observabilidade

```csharp
// Program.cs
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());

// Manual span no use case
using var activity = ActivitySource.StartActivity("AplicarCupom");
activity?.SetTag("carrinho.id", carrinhoId.Value.ToString());
activity?.SetTag("cupom.codigo", codigo);
```

## 7. Anti-padrões específicos de .NET/C#

- ❌ `.Result` ou `.Wait()` em qualquer método assíncrono
- ❌ `new HttpClient()` direto (use `IHttpClientFactory`)
- ❌ `Exception` base capturada sem re-throw
- ❌ `#nullable disable` para escapar de nullable (corrija o código)
- ❌ `public string Propriedade { get; set; }` no domínio (use `init` ou `record`)
- ❌ `DbContext` como singleton (scoped por request)
- ❌ Lógica de negócio em controller/handler (pertence ao use case)
- ❌ SQL string-concat (use EF Core parametrizado ou Dapper com `@param`)
- ❌ `ConfigureAwait(false)` em ASP.NET Core moderno (desnecessário)
- ❌ `bool IsValid { get; set; }` mutável em entidade (use método + invariante)
