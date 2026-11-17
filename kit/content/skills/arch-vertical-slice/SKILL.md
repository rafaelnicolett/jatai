---
id: arch-vertical-slice
name: arch-vertical-slice
type: skill
description: Arquitetura Vertical Slice — features auto-contidas, MediatR pipeline, sem camadas horizontais globais. Foco em .NET, aplicável a qualquer stack.
applicable_to:
  - "@backend-dotnet"
  - "@backend-python-api"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-vertical-slice

> Define a **estrutura e regras** do padrão Vertical Slice Architecture.
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.

---

## 1. Princípio fundamental

Cada **feature** é uma fatia vertical autocontida que corta todas as camadas necessárias.
Não existe uma camada `Services/` ou `Repositories/` global — cada slice tem o que precisa.

```
Horizontal (❌ evitar)     Vertical Slice (✅)
─────────────────────      ─────────────────────────────────
Controllers/               Features/
  CarrinhoController          AplicarCupom/
  PedidoController              AplicarCupomCommand.cs
Services/                       AplicarCupomHandler.cs
  CarrinhoService                 (query DB, call domain, publish event)
  PedidoService                 AplicarCupomValidator.cs
Repositories/                   AplicarCupomResponse.cs
  CarrinhoRepository          ListarCarrinhos/
  PedidoRepository              ListarCarrinhosQuery.cs
                                ListarCarrinhosHandler.cs
```

**Regra central**: a complexidade necessária fica dentro da fatia. Compartilhamento
entre slices é uma exceção deliberada, não o padrão.

## 2. Estrutura de diretórios canônica

### .NET (principal)
```
src/<Context>/
├── Features/
│   ├── AplicarCupom/
│   │   ├── AplicarCupomCommand.cs       # record com dados de entrada
│   │   ├── AplicarCupomValidator.cs     # FluentValidation
│   │   ├── AplicarCupomHandler.cs       # IRequestHandler<Command, Result>
│   │   ├── AplicarCupomEndpoint.cs      # Minimal API / Controller
│   │   └── AplicarCupomResponse.cs      # DTO de saída
│   ├── ListarCarrinhos/
│   │   ├── ListarCarrinhosQuery.cs
│   │   ├── ListarCarrinhosHandler.cs
│   │   └── ListarCarrinhosResponse.cs
│   └── RemoverItem/
│       └── ...
├── Shared/                              # APENAS infraestrutura transversal
│   ├── Domain/                          # Aggregates, VOs compartilhados entre slices
│   ├── Persistence/                     # DbContext, migrations
│   ├── Auth/                            # JWT middleware
│   └── ErrorHandling/                   # Problem Details middleware
└── Program.cs                           # DI + route scan
```

### Python (FastAPI)
```
src/<context>/
├── features/
│   ├── aplicar_cupom/
│   │   ├── command.py          # Pydantic model: AplicarCupomCommand
│   │   ├── handler.py          # async def handle(cmd, db, events) -> Result
│   │   ├── validator.py        # Regras de validação específicas da feature
│   │   └── router.py           # FastAPI router com 1 endpoint
│   ├── listar_carrinhos/
│   │   ├── query.py
│   │   ├── handler.py
│   │   └── router.py
│   └── remover_item/
│       └── ...
├── shared/
│   ├── domain/                 # Aggregates e VOs reutilizados
│   ├── persistence/            # SQLAlchemy engine + session factory
│   ├── auth/                   # JWT middleware
│   └── errors/                 # Error envelope + handlers
└── main.py                     # Monta todos os routers
```

## 3. MediatR pipeline (.NET — padrão para Vertical Slice)

```csharp
// AplicarCupomCommand.cs
public record AplicarCupomCommand(Guid CarrinhoId, string Codigo)
    : IRequest<Result<AplicarCupomResponse>>;

// AplicarCupomValidator.cs
public class AplicarCupomValidator : AbstractValidator<AplicarCupomCommand>
{
    public AplicarCupomValidator()
    {
        RuleFor(x => x.CarrinhoId).NotEmpty();
        RuleFor(x => x.Codigo).NotEmpty().MaximumLength(50).Matches(@"^[A-Z0-9_-]+$");
    }
}

// AplicarCupomHandler.cs — a fatia completa
public class AplicarCupomHandler(AppDbContext db, IEventPublisher events)
    : IRequestHandler<AplicarCupomCommand, Result<AplicarCupomResponse>>
{
    public async Task<Result<AplicarCupomResponse>> Handle(
        AplicarCupomCommand cmd, CancellationToken ct)
    {
        // 1. Fetch (direto no handler — sem repository global obrigatório)
        var carrinho = await db.Carrinhos
            .Include(c => c.Itens)
            .FirstOrDefaultAsync(c => c.Id == cmd.CarrinhoId, ct);

        if (carrinho is null)
            return Result.Failure<AplicarCupomResponse>(CarrinhoError.NaoEncontrado(cmd.CarrinhoId));

        var cupom = await db.Cupons.FirstOrDefaultAsync(c => c.Codigo == cmd.Codigo, ct);
        if (cupom is null)
            return Result.Failure<AplicarCupomResponse>(CupomError.NaoEncontrado(cmd.Codigo));

        // 2. Domain logic
        var domainResult = carrinho.AplicarCupom(cupom);
        if (domainResult.IsFailure)
            return Result.Failure<AplicarCupomResponse>(domainResult.Error);

        // 3. Persist
        await db.SaveChangesAsync(ct);

        // 4. Publish
        await events.PublishAsync(new CupomAplicadoEvent(carrinho.Id, cupom.Codigo), ct);

        return Result.Success(AplicarCupomResponse.From(carrinho));
    }
}
```

## 4. Quando compartilhar entre slices (shared/)

| Compartilhar ✅ | Não compartilhar ❌ |
|---|---|
| Aggregates com lógica de domínio real | DTOs de request/response |
| DbContext / Session Factory | Lógica de uma feature específica |
| Middleware (auth, logging, errors) | "Service" genérico sem uso cruzado |
| Value Objects transversais (Money, CPF) | Queries SQL específicas de uma feature |

**Regra**: se apenas 1 slice usa, fica dentro da slice. Se 2+ usam, vai para `shared/domain/`.

## 5. Anti-padrões de Vertical Slice

- ❌ `Services/CarrinhoService.cs` global com 15 métodos — criar por feature
- ❌ `IRepository<T>` genérico global — cada feature acessa o DbContext diretamente
- ❌ Fat handler > 100 linhas — extraia helpers privados ou domain objects
- ❌ Chamar `Feature A` de dentro de `Feature B` — use events/MediatR notifications
- ❌ Teste de handler que testa outra feature (acoplamento implícito)

## 6. Fitness functions

```yaml
# CI: Verificar que features não se importam diretamente entre si
- name: No cross-feature imports
  run: |
    python scripts/check_cross_slice.py src/features/
    # Script verifica: nenhum arquivo em features/X/ importa de features/Y/
```

```csharp
// ArchUnit (.NET): Features não referenciam outras Features
Classes().That().ResideInNamespace("*.Features.*")
    .Should().NotHaveDependencyOnAny(
        Classes().That().ResideInNamespace("*.Features.*")
                        .And().DoNotResideInNamespace($"*.{featureName}.*")
    );
```
