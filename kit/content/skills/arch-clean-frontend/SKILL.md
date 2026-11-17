---
id: arch-clean-frontend
name: arch-clean-frontend
type: skill
description: Clean Architecture para frontend — Data/Domain/Presentation em camadas com inversão de dependência. Flutter, iOS, Android, React. Agnóstica de framework.
applicable_to:
  - "@frontend-flutter"
  - "@frontend-ios"
  - "@frontend-android"
  - "@frontend-react"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-clean-frontend

> Define a **estrutura em camadas** da Clean Architecture adaptada para frontend.
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.

---

## 1. Princípio fundamental

As mesmas regras da Clean Architecture aplicadas ao frontend:
- **Domain Layer**: entidades e lógica de negócio — zero dependências externas
- **Data Layer**: repositórios e fontes de dados — implementa interfaces do domínio
- **Presentation Layer**: ViewModels e UI — consome casos de uso do domínio

```
Presentation         Domain              Data
──────────────       ──────────────      ──────────────
ViewModel/Screen     Use Cases           Repository Impl
     ↓                    ↓                   ↓
Views/Widgets   →   Entities + VOs  ←   API/DB/Cache
                    Repository (I)
```

**Regra de dependência**: a seta aponta para dentro.
- Presentation conhece Domain (use cases)
- Data conhece Domain (implementa interfaces)
- Domain não conhece nenhum dos dois

## 2. Estrutura de diretórios canônica

### Flutter
```
lib/
├── domain/                          # Independente de Flutter/Dart-specifics
│   ├── entities/
│   │   ├── carrinho.dart            # @freezed model — puro
│   │   └── cupom.dart
│   ├── value_objects/
│   │   └── money.dart               # @freezed, validação no construtor
│   ├── repositories/
│   │   └── carrinho_repository.dart # abstract class / interface
│   ├── use_cases/
│   │   └── aplicar_cupom_use_case.dart
│   └── errors/
│       └── checkout_failure.dart    # sealed class de erros
├── data/
│   ├── repositories/
│   │   └── carrinho_repository_impl.dart  # Implementa domain.repositories
│   ├── datasources/
│   │   ├── carrinho_remote_ds.dart        # Dio calls
│   │   └── carrinho_local_ds.dart         # Hive / local cache
│   └── models/
│       └── carrinho_model.dart            # @freezed + fromJson — DTO
├── presentation/
│   ├── carrinho/
│   │   ├── carrinho_page.dart
│   │   ├── carrinho_notifier.dart          # Riverpod AsyncNotifier
│   │   └── widgets/
│   │       ├── carrinho_card.dart
│   │       └── form_aplicar_cupom.dart
│   └── shared_widgets/
│       └── skeleton.dart
└── core/
    ├── di/                                # get_it + injectable bindings
    ├── router/                            # go_router
    └── theme/                             # ThemeData
```

### iOS (SwiftUI + Swift Package per layer)
```
Sources/
├── Domain/                          # Swift Package sem dependências UIKit/SwiftUI
│   ├── Entities/
│   │   └── Carrinho.swift           # struct puro
│   ├── Repositories/
│   │   └── CarrinhoRepositoring.swift  # protocol
│   └── UseCases/
│       └── AplicarCupomUseCase.swift
├── Data/
│   ├── Repositories/
│   │   └── CarrinhoRepository.swift    # Implementa CarrinhoRepositoring
│   ├── DataSources/
│   │   ├── CarrinhoRemoteDS.swift      # URLSession
│   │   └── CarrinhoLocalDS.swift       # SwiftData
│   └── DTOs/
│       └── CarrinhoDTO.swift            # Codable
├── Presentation/
│   ├── Carrinho/
│   │   ├── CarrinhoView.swift
│   │   ├── CarrinhoViewModel.swift      # @Observable
│   │   └── Subviews/
│   └── SharedUI/
└── App/
    ├── DependencyContainer.swift        # Manual DI
    └── ContentView.swift
```

### Android (Compose)
```
app/src/main/java/com/empresa/app/
├── domain/
│   ├── model/
│   │   └── Carrinho.kt              # data class puro
│   ├── repository/
│   │   └── CarrinhoRepository.kt    # interface
│   └── usecase/
│       └── AplicarCupomUseCase.kt
├── data/
│   ├── repository/
│   │   └── CarrinhoRepositoryImpl.kt
│   ├── remote/
│   │   └── CarrinhoApiService.kt    # Retrofit interface
│   ├── local/
│   │   └── CarrinhoDao.kt           # Room DAO
│   └── model/
│       └── CarrinhoDto.kt           # Serializable / @SerializedName
├── presentation/
│   ├── carrinho/
│   │   ├── CarrinhoScreen.kt
│   │   └── CarrinhoViewModel.kt     # @HiltViewModel
│   └── shared/
│       └── components/
└── di/
    └── AppModule.kt                 # Hilt @Module
```

### React (quando Clean + Layers é preferido a Feature-Based)
```
src/
├── domain/
│   ├── entities/
│   │   └── carrinho.ts              # Types puros, sem React
│   ├── repositories/
│   │   └── ICarrinhoRepository.ts   # Interface TypeScript
│   └── use-cases/
│       └── aplicarCupomUseCase.ts
├── data/
│   ├── repositories/
│   │   └── HttpCarrinhoRepository.ts   # Implementa ICarrinhoRepository
│   └── api/
│       └── carrinhoApi.ts              # SDK gerado
├── presentation/
│   ├── carrinho/
│   │   ├── CarrinhoPage.tsx
│   │   ├── useCarrinhoViewModel.ts     # Custom hook como ViewModel
│   │   └── components/
│   └── shared/
└── infrastructure/
    └── di/                             # Wire-up via React Context ou container
```

## 3. Separação Domain ↔ Data — mapper obrigatório

```dart
// data/models/carrinho_model.dart — DTO com fromJson
@freezed
class CarrinhoModel with _$CarrinhoModel {
  const factory CarrinhoModel({
    required String id,
    required List<ItemCarrinhoModel> itens,
    String? cupomCodigo,
  }) = _CarrinhoModel;

  factory CarrinhoModel.fromJson(Map<String, dynamic> json) =>
      _$CarrinhoModelFromJson(json);
}

extension CarrinhoModelMapper on CarrinhoModel {
  // DTO → Domain entity (na camada Data)
  Carrinho toDomain() => Carrinho(
    id: CarrinhoId(id),
    itens: itens.map((i) => i.toDomain()).toList(),
    cupom: cupomCodigo != null ? Cupom(codigo: cupomCodigo!) : null,
  );
}
```

## 4. Regras de dependência

| Camada | Pode importar | Proibido importar |
|---|---|---|
| `domain` | Apenas stdlib / linguagem nativa | `data`, `presentation`, frameworks (Flutter/UIKit/Room) |
| `data` | `domain` (entities, interfaces) | `presentation` |
| `presentation` | `domain` (use cases, entities) | `data` diretamente |
| `core/di` | Tudo | — (é o compositor) |

## 5. Anti-padrões de Clean Frontend

- ❌ UI model (DTO com `fromJson`) no domínio
- ❌ ViewModel acessando data source diretamente (sem use case / repository)
- ❌ Repository impl no domínio (inversão de dependência violada)
- ❌ `@Entity` (Room/CoreData) misturado com domain entity
- ❌ Use Case com estado (deve ser stateless — chame novamente)
- ❌ Domain knowing about Riverpod/Hilt/DI framework
- ❌ Lógica de mapeamento DTO↔Domain no ViewModel (pertence à camada Data)
