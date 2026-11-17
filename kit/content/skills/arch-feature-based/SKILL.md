---
id: arch-feature-based
name: arch-feature-based
type: skill
description: Arquitetura Feature-Based para frontend — co-localização por feature, shared/ com regras estritas, sem camadas horizontais globais. React, Flutter, qualquer stack frontend.
applicable_to:
  - "@frontend-react"
  - "@frontend-flutter"
  - "@frontend-android"
  - "@frontend-ios"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-feature-based

> Define a **estrutura de pastas e regras** do padrão Feature-Based (co-localização).
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.

---

## 1. Princípio fundamental

Código relacionado fica junto. Uma feature possui tudo que precisa para funcionar.
Não existe um `components/` ou `services/` global — cada feature tem os seus.

```
feature/                     Contém: UI, estado, API calls, tipos, testes
├── ui/          →           Componentes específicos da feature
├── model/       →           Tipos, schemas, value objects
├── api/         →           Queries/mutations/hooks de servidor
└── lib/         →           Utilitários internos da feature

shared/                      Apenas o que é genuinamente compartilhado
├── ui/          →           Design system, componentes reutilizáveis
├── lib/         →           Utils transversais (formatters, validators)
└── types/       →           Tipos compartilhados entre features
```

## 2. Estrutura de diretórios canônica

### React (Vite/Next.js)
```
src/
├── features/
│   ├── carrinho/
│   │   ├── ui/
│   │   │   ├── CarrinhoPage.tsx         # Entry point da feature
│   │   │   ├── CarrinhoCard.tsx
│   │   │   ├── FormAplicarCupom.tsx
│   │   │   └── ItemCarrinhoRow.tsx
│   │   ├── model/
│   │   │   ├── carrinho.types.ts        # Types e schemas Zod
│   │   │   └── carrinho.utils.ts        # Formatters, cálculos
│   │   ├── api/
│   │   │   ├── useCarrinho.ts           # TanStack Query: useQuery
│   │   │   └── useAplicarCupom.ts       # TanStack Query: useMutation
│   │   └── index.ts                     # Public API da feature
│   ├── pedidos/
│   │   ├── ui/ ...
│   │   ├── model/ ...
│   │   └── api/ ...
│   └── auth/
│       ├── ui/ ...
│       └── lib/
│           └── auth.store.ts            # Zustand store de auth
├── shared/
│   ├── ui/
│   │   ├── Button/
│   │   ├── Input/
│   │   └── ErrorBoundary/
│   ├── lib/
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   └── http.ts                      # SDK gerado + instância
│   └── types/
│       └── pagination.types.ts
├── app/
│   ├── router.tsx                       # Rotas top-level
│   ├── providers.tsx                    # QueryClient, Theme, etc.
│   └── main.tsx
└── pages/                               # Somente para Next.js pages router
```

### Flutter
```
lib/
├── features/
│   ├── carrinho/
│   │   ├── ui/
│   │   │   ├── carrinho_page.dart
│   │   │   ├── carrinho_card.dart
│   │   │   └── form_aplicar_cupom.dart
│   │   ├── model/
│   │   │   ├── carrinho.dart            # @freezed model
│   │   │   └── carrinho_error.dart      # sealed error types
│   │   ├── providers/                   # Riverpod providers
│   │   │   ├── carrinho_notifier.dart
│   │   │   └── carrinho_providers.dart
│   │   └── carrinho.dart                # barrel export
│   └── pedidos/
│       └── ...
├── shared/
│   ├── ui/
│   │   ├── app_button.dart
│   │   └── skeleton_loader.dart
│   ├── lib/
│   │   ├── formatters.dart
│   │   └── dio_client.dart
│   └── providers/
│       └── dio_provider.dart
└── app/
    ├── router.dart                      # go_router
    └── main.dart
```

### Android (Compose)
```
app/src/main/java/com/empresa/app/
├── feature/
│   ├── carrinho/
│   │   ├── ui/
│   │   │   ├── CarrinhoScreen.kt
│   │   │   └── CarrinhoViewModel.kt
│   │   ├── domain/
│   │   │   └── AplicarCupomUseCase.kt
│   │   └── data/
│   │       ├── CarrinhoRepository.kt
│   │       └── CarrinhoApiService.kt
│   └── pedidos/
│       └── ...
├── shared/
│   ├── ui/
│   │   └── components/
│   ├── data/
│   │   └── network/
│   └── domain/
│       └── model/
└── app/
    ├── MainActivity.kt
    └── di/
```

### iOS (SwiftUI)
```
Sources/
├── Features/
│   ├── Carrinho/
│   │   ├── UI/
│   │   │   ├── CarrinhoView.swift
│   │   │   └── CarrinhoViewModel.swift
│   │   ├── Domain/
│   │   │   └── AplicarCupomUseCase.swift
│   │   └── Data/
│   │       └── CarrinhoRepository.swift
│   └── Pedidos/
│       └── ...
├── Shared/
│   ├── UI/
│   ├── Domain/
│   └── Infrastructure/
└── App/
    ├── AppDelegate.swift
    └── ContentView.swift
```

## 3. Public API por feature (index / barrel)

Cada feature expõe apenas o necessário para o mundo externo.

```typescript
// features/carrinho/index.ts — public API
export { CarrinhoPage } from "./ui/CarrinhoPage";
export type { Carrinho, CarrinhoId } from "./model/carrinho.types";
// ❌ Não exportar: internals de UI, hooks específicos, utils internos
```

```dart
// features/carrinho/carrinho.dart
export 'ui/carrinho_page.dart';
export 'model/carrinho.dart';
// Tudo que é interno usa part ou não exporta
```

## 4. Regras de importação

| De → Para | Permitido |
|---|---|
| `features/A` → `features/A` | ✅ Interno da feature |
| `features/A` → `shared/` | ✅ Shared é transversal |
| `features/A` → `features/B` | ❌ Proibido — use shared ou events |
| `shared/` → `features/` | ❌ Shared não conhece features |

**Comunicação entre features**: usar events (pubsub), store global ou URL params — nunca import direto.

## 5. Regra da shared/

Só vai para `shared/` quando **2 features diferentes** precisam. Uma feature que usa algo internamente mantém dentro dela.

| shared/ui/ | shared/lib/ | shared/types/ |
|---|---|---|
| Design system components | Formatters, validators | Tipos de paginação |
| Icons, typography | HTTP client instance | Error envelope type |
| Skeletons, spinners | Date utils | Auth token type |

## 6. Anti-padrões de Feature-Based

- ❌ `components/` global com 50 componentes — mova para a feature dona ou shared/ui/
- ❌ Import direto entre features (`import { x } from '../pedidos'`)
- ❌ Lógica de negócio em shared/ui/ (shared é infraestrutura, não domínio)
- ❌ Feature folder sem `index.ts` barrel (expõe internals)
- ❌ Shared/ crescendo indefinidamente (se só 1 feature usa, não é shared)
- ❌ Misturar feature-based com estrutura por tipo (`containers/`, `reducers/`)

## 7. Fitness functions

```bash
# Detectar cross-feature imports (React)
node scripts/check-feature-boundaries.js src/features/

# Script: analisa imports de cada feature e detecta referências cruzadas
# Regra: nenhum arquivo em features/X/ pode importar de features/Y/
```

```yaml
# ESLint: no-restricted-imports por feature
# .eslintrc
rules:
  no-restricted-imports:
    - error
    - patterns:
        - group: ["../*/features/*"]
          message: "Import cross-feature proibido. Use shared/ ou eventos."
```
