---
id: arch-mvvm
name: arch-mvvm
type: skill
description: MVVM com Unidirectional Data Flow (UDF) — Model, ViewModel, View com fluxo unidirecional de estado. SwiftUI, Jetpack Compose, React, Flutter.
applicable_to:
  - "@frontend-ios"
  - "@frontend-android"
  - "@frontend-react"
  - "@frontend-flutter"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-mvvm

> Define o padrão **MVVM com UDF (Unidirectional Data Flow)** para frontend.
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.
> Para estrutura de pastas, combine com `arch-feature-based` ou `arch-clean-frontend`.

---

## 1. Princípio fundamental

```
         Input (user action / event)
              │
              ↓
         ViewModel
         ┌─────────────────────────┐
         │  Intent/Action → State  │
         │  (business logic)       │
         └─────────────────────────┘
              │
              ↓ Observable State (UI State)
         View (SwiftUI / Compose / React / Flutter)
              │
              ↓ User Actions / Events
         ViewModel (ciclo fecha)
```

**Regras UDF**:
1. Estado flui em **uma direção** apenas: ViewModel → View
2. View nunca modifica o estado diretamente — envia **intent/action** ao ViewModel
3. ViewModel é **a fonte da verdade** do estado de UI
4. Estado é **imutável** — cada mudança produz um novo objeto de estado

## 2. UI State — modelagem obrigatória

Estado de UI sempre representa todos os casos possíveis:

```kotlin
// Android (Kotlin sealed)
sealed interface CarrinhoUiState {
    data object Loading : CarrinhoUiState
    data class Success(val carrinho: Carrinho) : CarrinhoUiState
    data class Error(val mensagem: String, val tentarNovamente: () -> Unit) : CarrinhoUiState
}
```

```swift
// iOS (Swift enum)
enum CarrinhoViewState {
    case loading
    case loaded(Carrinho)
    case error(String)
}
```

```typescript
// React (TypeScript union)
type CarrinhoViewState =
  | { status: "loading" }
  | { status: "success"; carrinho: Carrinho }
  | { status: "error"; mensagem: string };
```

```dart
// Flutter (sealed com freezed)
@freezed
sealed class CarrinhoState with _$CarrinhoState {
  const factory CarrinhoState.loading() = _Loading;
  const factory CarrinhoState.success(Carrinho carrinho) = _Success;
  const factory CarrinhoState.error(String mensagem) = _Error;
}
```

## 3. ViewModel — implementação por stack

### Android (Jetpack Compose + Kotlin)
```kotlin
@HiltViewModel
class CarrinhoViewModel @Inject constructor(
    private val aplicarCupom: AplicarCupomUseCase,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val carrinhoId = CarrinhoId(savedState.get<String>("carrinhoId")!!)

    // ✅ StateFlow — hot, replay=1, respeitando lifecycle com collectAsStateWithLifecycle
    private val _state = MutableStateFlow<CarrinhoUiState>(CarrinhoUiState.Loading)
    val state: StateFlow<CarrinhoUiState> = _state.asStateFlow()

    // One-shot UI events (navegação, snackbar) — SharedFlow não tem replay
    private val _events = MutableSharedFlow<CarrinhoUiEvent>()
    val events: SharedFlow<CarrinhoUiEvent> = _events.asSharedFlow()

    fun aplicarCupom(codigo: String) {
        viewModelScope.launch {
            _state.value = CarrinhoUiState.Loading
            when (val r = aplicarCupom.execute(carrinhoId, codigo)) {
                is CupomResult.Success -> {
                    _state.value = CarrinhoUiState.Success(r.carrinho)
                    _events.emit(CarrinhoUiEvent.CupomAplicado)
                }
                is CupomResult.Expirado -> _state.value = CarrinhoUiState.Error("Cupom expirado")
                is CupomResult.NaoEncontrado -> _state.value = CarrinhoUiState.Error("Não encontrado")
            }
        }
    }
}
```

### iOS (SwiftUI + @Observable)
```swift
@Observable
@MainActor
final class CarrinhoViewModel {
    private(set) var state: CarrinhoViewState = .loading
    private let aplicarCupomUseCase: AplicarCupomUseCaseProtocol

    init(useCase: AplicarCupomUseCaseProtocol) {
        self.aplicarCupomUseCase = useCase
    }

    func aplicarCupom(_ codigo: String) async {
        state = .loading
        let result = await aplicarCupomUseCase.execute(carrinhoId: carrinhoId, codigo: codigo)
        state = switch result {
        case .sucesso(let c): .loaded(c)
        case .expirado: .error("Cupom expirado")
        case .naoEncontrado: .error("Não encontrado")
        }
    }
}
```

### React (custom hook como ViewModel)
```typescript
// useCarrinhoViewModel.ts — ViewModel como hook
function useCarrinhoViewModel(carrinhoId: CarrinhoId) {
    const [state, setState] = useState<CarrinhoViewState>({ status: "loading" });
    const { data: carrinho } = useCarrinho(carrinhoId);
    const { mutate: aplicarCupomMutate, isPending } = useAplicarCupom(carrinhoId);

    // Derivar estado da UI a partir do estado do servidor
    const viewState = useMemo<CarrinhoViewState>(() => {
        if (isPending) return { status: "loading" };
        if (!carrinho) return { status: "error", mensagem: "Carrinho não encontrado" };
        return { status: "success", carrinho };
    }, [carrinho, isPending]);

    const aplicarCupom = useCallback((codigo: string) => {
        aplicarCupomMutate(codigo);
    }, [aplicarCupomMutate]);

    return { viewState, aplicarCupom };
}
```

### Flutter (Riverpod AsyncNotifier)
```dart
@riverpod
class CarrinhoNotifier extends _$CarrinhoNotifier {
  @override
  Future<Carrinho> build(CarrinhoId id) async {
    return ref.watch(carrinhoRepositoryProvider).buscar(id);
  }

  Future<void> aplicarCupom(String codigo) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final useCase = ref.read(aplicarCupomUseCaseProvider);
      return useCase.execute(id, codigo);
    });
  }
}
```

## 4. View — regras obrigatórias

```kotlin
// ✅ View apenas observa e delega — sem lógica
@Composable
fun CarrinhoScreen(viewModel: CarrinhoViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    CarrinhoContent(
        state = state,
        onAplicarCupom = viewModel::aplicarCupom,  // ✅ delega ao ViewModel
    )
}

@Composable
fun CarrinhoContent(
    state: CarrinhoUiState,
    onAplicarCupom: (String) -> Unit,
) {
    when (state) {
        CarrinhoUiState.Loading -> LoadingIndicator()
        is CarrinhoUiState.Success -> CarrinhoList(state.carrinho, onAplicarCupom)
        is CarrinhoUiState.Error -> ErrorMessage(state.mensagem)
    }
}

// ❌ Lógica no Composable
@Composable
fun CarrinhoScreen(viewModel: CarrinhoViewModel = hiltViewModel()) {
    val carrinho by viewModel.carrinho.collectAsStateWithLifecycle()
    // ❌ lógica de exibição com if/else embutida no composable raiz
    if (carrinho != null && carrinho!!.itens.isNotEmpty() && isUserLoggedIn()) { ... }
}
```

## 5. Separação ViewModel ↔ Model

| Conceito | Localização | Exemplo |
|---|---|---|
| UI State | ViewModel | `CarrinhoUiState` com campos de UI (loading, error, display strings) |
| Domain Entity | Domain/Model | `Carrinho` com lógica de negócio pura |
| DTO | Data Layer | `CarrinhoDto` com `fromJson`/`toJson` |
| Display Model | ViewModel (mapeia Domain) | `CarrinhoDisplayItem(nome: item.produto.nome, precoFormatado: "R$ 99,90")` |

O ViewModel mapeia Domain Entity → Display Model antes de expor ao View.

## 6. Anti-padrões de MVVM+UDF

- ❌ View modificando estado diretamente (quebra UDF)
- ❌ Lógica de negócio no View/Composable/SwiftUI body
- ❌ ViewModel com referência a View (`Activity`, `UIViewController`, `BuildContext`)
- ❌ ViewModel com `MutableStateFlow` exposto publicamente
- ❌ Multiple sources of truth (ViewModel + local state no View conflitando)
- ❌ `StateFlow` onde deveria ser `SharedFlow` (one-shot events como navegação)
- ❌ ViewModel sem ciclo de vida (sem `viewModelScope` / sem cancelamento em `deinit`)
- ❌ `collectAsState()` em vez de `collectAsStateWithLifecycle()` (Android)
