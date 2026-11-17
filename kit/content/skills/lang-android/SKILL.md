---
id: lang-android
name: lang-android
type: skill
description: Boas práticas de Kotlin + Jetpack Compose + Android — MVVM/UDF, Hilt, Coroutines, Flow, testes e performance. Independente do padrão arquitetural.
applicable_to:
  - "@frontend-android"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-android

> Boas práticas da **linguagem Kotlin e plataforma Android moderna**, não do padrão arquitetural.
> Para estrutura de camadas, use `arch-mvvm`, `arch-clean-frontend` ou `arch-feature-based`.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Kotlin | 2.x | `kotlinOptions.jvmTarget = "17"` |
| Android | API 26+ (minSdk) | targetSdk sempre o latest stable |
| UI | Jetpack Compose — **somente Compose** | Sem `findViewById`, sem XML layouts novos |
| DI | Hilt (`@HiltAndroidApp`, `@AndroidEntryPoint`) | Nunca Koin em projetos novos |
| Async | Coroutines + Flow | Sem RxJava em código novo |
| HTTP | Retrofit 2 + OkHttp 4 + Gson/Moshi | Serialização: `kotlinx.serialization` preferida |
| Imagens | Coil 2 (`AsyncImage`) | Nunca Glide/Picasso em Compose |
| Navegação | Navigation Compose | NavHost + NavController tipado |
| Storage local | Room 2.x (SQLite) | `@Database`, `@Dao`, `@Entity` |
| Segurança local | `EncryptedSharedPreferences` + `Keystore` | Nunca `SharedPreferences` puro para dados sensíveis |
| Linter | `ktlint` + Android Lint | `./gradlew lint ktlintCheck` no CI |
| Testes unitários | JUnit 4/5 + MockK + Turbine | `@Test`, `coVerify`, `turbine.test{}` |
| Testes UI | Compose UI Test | `ComposeTestRule.onNodeWithTag()` |
| Testes integration | Hilt testing + Room in-memory | `@HiltAndroidTest` |

## 2. Kotlin — idiomas obrigatórios

### 2.1 Data classes para modelos imutáveis
```kotlin
// ✅ Data class — copy(), equals(), hashCode(), toString() gerado
data class Carrinho(
    val id: CarrinhoId,
    val clienteId: ClienteId,
    val itens: List<ItemCarrinho>,
    val cupomAplicado: Cupom? = null,
) {
    val totalBruto: Money get() = itens.sumOf { it.precoUnitario * it.quantidade }
}

// ✅ Value class para IDs de domínio (zero overhead em runtime)
@JvmInline
value class CarrinhoId(val value: String) {
    init { require(value.isNotBlank()) { "CarrinhoId não pode ser vazio" } }
}

// ❌ Classe mutável como modelo
class Carrinho {
    var id: String? = null
    var itens: MutableList<Item> = mutableListOf()  // mutável — proibido
}
```

### 2.2 Sealed classes para estados e resultados
```kotlin
// ✅ Estado da UI com sealed class
sealed interface CarrinhoUiState {
    data object Loading : CarrinhoUiState
    data class Success(val carrinho: Carrinho) : CarrinhoUiState
    data class Error(val mensagem: String) : CarrinhoUiState
}

// ✅ Result de domínio
sealed class CupomResult {
    data class Success(val carrinho: Carrinho) : CupomResult()
    data class Expirado(val validade: LocalDate) : CupomResult()
    data class NaoEncontrado(val codigo: String) : CupomResult()
}

// When exaustivo — compiler garante todos os casos
val resposta = when (result) {
    is CupomResult.Success -> "Desconto aplicado!"
    is CupomResult.Expirado -> "Cupom expirado em ${result.validade}"
    is CupomResult.NaoEncontrado -> "Cupom '${result.codigo}' não encontrado"
}
```

### 2.3 Coroutines e Flow — regras críticas
```kotlin
// ✅ StateFlow para UI state (conflate, hot, replay=1)
class CarrinhoViewModel @Inject constructor(
    private val useCase: AplicarCupomUseCase,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    private val carrinhoId = CarrinhoId(savedState.get<String>("carrinhoId")!!)

    private val _uiState = MutableStateFlow<CarrinhoUiState>(CarrinhoUiState.Loading)
    val uiState: StateFlow<CarrinhoUiState> = _uiState.asStateFlow()

    fun aplicarCupom(codigo: String) {
        viewModelScope.launch {
            _uiState.value = CarrinhoUiState.Loading
            _uiState.value = when (val r = useCase.execute(carrinhoId, codigo)) {
                is CupomResult.Success -> CarrinhoUiState.Success(r.carrinho)
                is CupomResult.Expirado -> CarrinhoUiState.Error("Cupom expirado")
                is CupomResult.NaoEncontrado -> CarrinhoUiState.Error("Não encontrado")
            }
        }
    }
}

// ❌ runBlocking fora de testes — trava a thread
val resultado = runBlocking { useCase.execute(id, codigo) }  // proibido

// ❌ GlobalScope — não cancela com ciclo de vida
GlobalScope.launch { ... }  // proibido
```

### 2.4 Extension functions para legibilidade
```kotlin
// ✅ Extensions em vez de Utils/Helpers
fun Money.formatarBRL(): String = NumberFormat
    .getCurrencyInstance(Locale("pt", "BR"))
    .format(this.toBigDecimal())

fun String.toCarrinhoId(): CarrinhoId = CarrinhoId(this)

// ❌ Classe util estática
object MoneyUtils {
    @JvmStatic fun formatarBRL(value: Long): String { ... }
}
```

## 3. Jetpack Compose — padrões obrigatórios

### 3.1 UDF — Unidirectional Data Flow
```kotlin
// ✅ UDF: ViewModel → State → Composable → Events → ViewModel
@Composable
fun CarrinhoScreen(
    viewModel: CarrinhoViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    CarrinhoContent(
        uiState = uiState,
        onAplicarCupom = viewModel::aplicarCupom,
        onRemoverItem = viewModel::removerItem,
    )
}

// ✅ Composable "burro" — recebe estado, emite eventos
@Composable
fun CarrinhoContent(
    uiState: CarrinhoUiState,
    onAplicarCupom: (String) -> Unit,
    onRemoverItem: (ItemId) -> Unit,
) {
    when (uiState) {
        CarrinhoUiState.Loading -> CircularProgressIndicator()
        is CarrinhoUiState.Success -> CarrinhoList(uiState.carrinho, onRemoverItem)
        is CarrinhoUiState.Error -> ErrorMessage(uiState.mensagem)
    }
}
```

### 3.2 `collectAsStateWithLifecycle` obrigatório (não `collectAsState`)
```kotlin
// ✅ Respeita ciclo de vida — para coleta em background
val uiState by viewModel.uiState.collectAsStateWithLifecycle()

// ❌ collectAsState — não para em background, drena bateria
val uiState by viewModel.uiState.collectAsState()  // proibido
```

### 3.3 `testTag` para testes
```kotlin
@Composable
fun BotaoAplicarCupom(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.testTag("botao_aplicar_cupom")
    ) {
        Text("Aplicar Cupom")
    }
}
```

## 4. Hilt — DI obrigatório

```kotlin
// ✅ Module por camada
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideOkHttp(): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor())
        .build()

    @Provides @Singleton
    fun provideRetrofit(okHttp: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(okHttp)
        .addConverterFactory(KotlinSerializationConverterFactory.create(Json { ignoreUnknownKeys = true }))
        .build()
}

// ✅ Inject em ViewModel
@HiltViewModel
class CarrinhoViewModel @Inject constructor(
    private val aplicarCupomUseCase: AplicarCupomUseCase,
) : ViewModel()
```

## 5. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes | `PascalCase` | `CarrinhoViewModel`, `AplicarCupomUseCase` |
| Composables | `PascalCase` + função | `CarrinhoScreen()`, `CupomBadge()` |
| Funções | `camelCase` | `aplicarCupom()`, `buscarCarrinho()` |
| Properties | `camelCase` | `totalLiquido`, `cupomAplicado` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_ITENS_CARRINHO` |
| Packages | `lowercase` | `com.empresa.checkout.domain` |
| Arquivos | `PascalCase.kt` para classes | `CarrinhoViewModel.kt` |
| Composable files | `PascalCase.kt` | `CarrinhoScreen.kt` |

## 6. Pirâmide de testes (Android)

```
     ▲ UI E2E (≤5%)       Espresso / UI Automator — smoke only
    ╱─╲ Compose UI (≈15%)  ComposeTestRule — componentes críticos
   ╱───╲ Integração (≈20%) HiltAndroidTest + Room in-memory
  ╱─────╲ Unitário (≥60%)  JUnit + MockK + Turbine — ViewModel, UseCases
```

```kotlin
// ✅ Teste de ViewModel com Turbine
@Test
fun `aplicarCupom expirado emite CarrinhoUiState Error`() = runTest {
    val useCase = mockk<AplicarCupomUseCase> {
        coEvery { execute(any(), "PROMO") } returns CupomResult.Expirado(LocalDate.of(2020, 1, 1))
    }
    val vm = CarrinhoViewModel(useCase, savedState)

    vm.uiState.test {
        assertIs<CarrinhoUiState.Loading>(awaitItem())
        vm.aplicarCupom("PROMO")
        val state = awaitItem()
        assertIs<CarrinhoUiState.Error>(state)
        assert(state.mensagem.contains("expirado", ignoreCase = true))
    }
}
```

## 7. Anti-padrões específicos de Android/Kotlin

- ❌ `runBlocking` fora de testes
- ❌ `GlobalScope.launch` — sem lifecycle binding
- ❌ `collectAsState()` em vez de `collectAsStateWithLifecycle()`
- ❌ Lógica de negócio no Composable (pertence ao ViewModel/UseCase)
- ❌ Context passado para ViewModel (memory leak)
- ❌ `MutableStateFlow` exposto publicamente (use `asStateFlow()`)
- ❌ `View` ou `Activity` importados no ViewModel
- ❌ `SharedPreferences` puro para dados sensíveis
- ❌ `Thread.sleep()` ou `Thread(...)` — use coroutines
- ❌ XML layouts em código novo — Compose-only
