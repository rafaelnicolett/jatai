---
id: lang-flutter
name: lang-flutter
type: skill
description: Boas práticas de Dart 3 + Flutter — null-safety, freezed, gerenciamento de estado, testes e performance. Independente do padrão arquitetural.
applicable_to:
  - "@frontend-flutter"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-flutter

> Boas práticas da **linguagem Dart e framework Flutter**, não do padrão arquitetural.
> Para estrutura de camadas (clean-frontend, feature-based), use `arch-clean-frontend` ou `arch-feature-based`.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Dart | 3.x | Null-safety obrigatório desde Flutter 3 |
| Flutter | 3.x stable | `flutter --version` no CI |
| State management | Riverpod 2.x **ou** BLoC 8.x — **1 por app** | Riverpod para novos projetos |
| Imutabilidade | `freezed` + `json_serializable` | Models e estados imutáveis |
| HTTP | `dio` + interceptors | Nunca `http` package diretamente |
| Navegação | `go_router` | Declarativo, deep link nativo |
| DI / Service Locator | `get_it` + `injectable` (opcional) | Ou Riverpod providers como DI |
| Storage local | `flutter_secure_storage` (secrets) + `shared_preferences` (prefs) | Hive/Isar para objetos complexos |
| Logs | `logger` package + OTel (via dart_otel) | |
| Linter | `flutter_lints` + regras customizadas | `analysis_options.yaml` no repo |
| Formatador | `dart format` | Automático no CI |
| Test | `flutter_test` + `mocktail` | Nunca `mockito` (requer codegen desnecessário) |
| Golden tests | `golden_toolkit` | Para componentes de UI críticos |
| Integration | `integration_test` package | Roda em dispositivo/emulador real |

## 2. Dart 3 — idiomas obrigatórios

### 2.1 Null-safety rigorosa — sem `!` desnecessário
```dart
// ✅ Null-safe com tratamento explícito
final Carrinho? carrinho = await repo.buscar(id);
if (carrinho == null) {
  return Result.failure(CarrinhoError.naoEncontrado(id));
}
// carrinho é non-null aqui (smart cast)
return Result.success(carrinho);

// ❌ Force unwrap — NullPointerException em produção
final carrinho = await repo.buscar(id)!;  // proibido se pode ser null
```

### 2.2 `freezed` para models imutáveis e union types
```dart
// ✅ Model imutável com copyWith, == e toString gerado
@freezed
class Carrinho with _$Carrinho {
  const factory Carrinho({
    required CarrinhoId id,
    required ClienteId clienteId,
    required List<ItemCarrinho> itens,
    Cupom? cupomAplicado,
  }) = _Carrinho;

  factory Carrinho.fromJson(Map<String, dynamic> json) => _$CarrinhoFromJson(json);
}

// ✅ Union type para resultado / estado
@freezed
sealed class CupomResult with _$CupomResult {
  const factory CupomResult.sucesso(Carrinho carrinho) = CupomResultSucesso;
  const factory CupomResult.expirado(DateTime validade) = CupomResultExpirado;
  const factory CupomResult.naoEncontrado(String codigo) = CupomResultNaoEncontrado;
}

// Pattern matching com when/map
final mensagem = result.when(
  sucesso: (carrinho) => "Desconto aplicado!",
  expirado: (val) => "Cupom expirado em ${DateFormat.yMd().format(val)}",
  naoEncontrado: (cod) => "Cupom '$cod' não encontrado",
);
```

### 2.3 Riverpod — providers tipados e testáveis
```dart
// ✅ Provider tipado com AsyncNotifier
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

// No widget — clean, sem setState
@override
Widget build(BuildContext context, WidgetRef ref) {
  final carrinhoAsync = ref.watch(carrinhoNotifierProvider(carrinhoId));

  return carrinhoAsync.when(
    data: (carrinho) => CarrinhoView(carrinho: carrinho),
    loading: () => const CarrinhoSkeleton(),
    error: (err, _) => ErroView(mensagem: err.toString()),
  );
}
```

### 2.4 BLoC (alternativa a Riverpod)
```dart
// ✅ BLoC com eventos e estados tipados via sealed classes
sealed class CarrinhoEvent {}
final class AplicarCupomEvent extends CarrinhoEvent {
  final String codigo;
  const AplicarCupomEvent(this.codigo);
}

@freezed
sealed class CarrinhoState with _$CarrinhoState {
  const factory CarrinhoState.inicial() = CarrinhoInicial;
  const factory CarrinhoState.carregando() = CarrinhoCarregando;
  const factory CarrinhoState.carregado(Carrinho carrinho) = CarrinhoCarregado;
  const factory CarrinhoState.erro(String mensagem) = CarrinhoErro;
}

class CarrinhoBloc extends Bloc<CarrinhoEvent, CarrinhoState> {
  CarrinhoBloc(this._useCase) : super(const CarrinhoState.inicial()) {
    on<AplicarCupomEvent>(_onAplicarCupom);
  }

  Future<void> _onAplicarCupom(AplicarCupomEvent event, Emitter<CarrinhoState> emit) async {
    emit(const CarrinhoState.carregando());
    final result = await _useCase.execute(event.codigo);
    emit(result.fold(
      (err) => CarrinhoState.erro(err.mensagem),
      (carrinho) => CarrinhoState.carregado(carrinho),
    ));
  }
}
```

## 3. Widgets — boas práticas

### 3.1 Widgets pequenos e focados
```dart
// ✅ Widget com responsabilidade única
class CupomBadge extends StatelessWidget {
  const CupomBadge({required this.desconto, super.key});
  final double desconto;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.primaryContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(
      '-${desconto.toStringAsFixed(0)}%',
      style: Theme.of(context).textTheme.labelSmall,
    ),
  );
}
```

### 3.2 const onde possível
```dart
// ✅ const elimina rebuild desnecessário
const SizedBox(height: 16)
const Padding(padding: EdgeInsets.all(16))
const Text("Meu Carrinho")

// Lint `prefer_const_constructors` detecta oportunidades automaticamente
```

### 3.3 Keys para listas dinâmicas
```dart
// ✅ Key semântica — preserva estado no reorder/filter
ListView.builder(
  itemCount: itens.length,
  itemBuilder: (_, index) => ItemCarrinhoTile(
    key: ValueKey(itens[index].id),  // não index!
    item: itens[index],
  ),
)
```

## 4. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes/Widgets | `PascalCase` | `CarrinhoCard`, `CarrinhoNotifier` |
| Arquivos | `snake_case.dart` | `carrinho_card.dart`, `aplicar_cupom_use_case.dart` |
| Variáveis/funções | `camelCase` | `aplicarCupom()`, `totalLiquido` |
| Constantes | `lowerCamelCase` | `const maxItensCarrinho = 50` |
| Providers Riverpod | `camelCaseProvider` | `carrinhoNotifierProvider` |
| Eventos BLoC | sufixo `Event` | `AplicarCupomEvent` |
| Estados BLoC | sufixo `State` | `CarrinhoCarregado` |

## 5. Pirâmide de testes (Flutter)

```
     ▲ Integration (≤10%)  integration_test — device real / emulador
    ╱─╲ Widget (≈30%)      flutter_test — pump + finder
   ╱───╲ Unitário (≥60%)   dart test — lógica pura, use cases, repos mockados
```

```dart
// ✅ Teste unitário de use case — sem Flutter
void main() {
  group('AplicarCupomUseCase', () {
    late MockCupomRepository cupomRepo;
    late AplicarCupomUseCase sut;

    setUp(() {
      cupomRepo = MockCupomRepository();
      sut = AplicarCupomUseCase(cupomRepo);
    });

    test('cupom expirado retorna CupomResultExpirado', () async {
      when(() => cupomRepo.buscarPorCodigo('PROMO'))
          .thenAnswer((_) async => Cupom(validade: DateTime(2020), ...));

      final result = await sut.execute(carrinhoId, 'PROMO');

      expect(result, isA<CupomResultExpirado>());
    });
  });
}

// ✅ Teste de widget
testWidgets('CupomBadge exibe percentual formatado', (tester) async {
  await tester.pumpWidget(
    MaterialApp(home: CupomBadge(desconto: 15)),
  );
  expect(find.text('-15%'), findsOneWidget);
});
```

## 6. Performance Flutter

- `const` em widgets sempre que possível — reduz rebuild
- `RepaintBoundary` para animações isoladas
- `ListView.builder` / `GridView.builder` — nunca `children:` com lista grande
- Imagens: `cached_network_image` + placeholders
- `compute()` para processamento CPU-bound (não bloque o main isolate)
- Profile com `flutter run --profile` antes de otimizar

## 7. Anti-padrões específicos de Flutter/Dart

- ❌ `!` (force unwrap) sem garantia de não-null
- ❌ `setState` em widgets complexos (use Riverpod/BLoC)
- ❌ Lógica de negócio dentro de `build()` 
- ❌ `BuildContext` passado por múltiplas camadas (use providers)
- ❌ `dynamic` como tipo (use generics ou sealed classes)
- ❌ `http` package puro (use `dio` com interceptors para retry/auth)
- ❌ `shared_preferences` para dados sensíveis (use `flutter_secure_storage`)
- ❌ Widgets gigantes > 200 linhas sem split
- ❌ `key: UniqueKey()` em listas (recria widget a cada rebuild)
- ❌ Misturar Riverpod e BLoC no mesmo módulo
