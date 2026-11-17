---
id: lang-ios
name: lang-ios
type: skill
description: Boas práticas de Swift 5.9+ + SwiftUI — Swift Concurrency, @Observable, TCA/MVVM, testes e performance. Independente do padrão arquitetural.
applicable_to:
  - "@frontend-ios"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-ios

> Boas práticas da **linguagem Swift e framework SwiftUI**, não do padrão arquitetural.
> Para estrutura de camadas, use `arch-mvvm` ou `arch-clean-frontend`.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Swift | 5.9+ | Macros disponíveis (`@Observable`, `@Model`) |
| iOS target | 17+ | Permite `@Observable`, Swift Data, `NavigationStack` |
| UI | SwiftUI — **somente SwiftUI** | UIKit apenas para integrações com SDKs externos |
| State/Observable | `@Observable` macro (iOS 17+) | Substitui `@ObservableObject`/`@Published` |
| DI | Manual (init injection) **ou** Factory/Needle | Sem Sorcery/third-party em projetos novos |
| Async | Swift Concurrency (`async/await`, `Task`, `AsyncStream`) | Sem Combine para novos flows |
| HTTP | URLSession + `async/await` **ou** Alamofire | Nunca callbacks/completion handlers em código novo |
| Storage local | SwiftData (iOS 17+) **ou** Core Data | UserDefaults apenas para prefs simples |
| Keychain | `Security.framework` ou KeychainAccess | Nunca UserDefaults para dados sensíveis |
| Linter | SwiftLint | `.swiftlint.yml` no repo, CI falha em violations |
| Formatador | swift-format | `--mode format` no pre-commit |
| Testes unitários | XCTest + Swift Testing (Xcode 16) | `#expect`, `#require` no Swift Testing |
| Testes UI | XCUITest | Smoke apenas — preferir testes unitários |
| Mocks | Manual (`MockProtocol`) ou Mockingbird | Sem Sourcery-generated em projetos novos |

## 2. Swift — idiomas obrigatórios

### 2.1 Structs e value types para modelos do domínio
```swift
// ✅ struct — valor semântico, thread-safe, cópia implícita
struct Carrinho: Equatable, Identifiable {
    let id: CarrinhoId
    let clienteId: ClienteId
    let itens: [ItemCarrinho]
    let cupomAplicado: Cupom?

    var totalBruto: Decimal {
        itens.reduce(.zero) { $0 + $1.precoUnitario * Decimal($1.quantidade) }
    }
}

// ✅ Newtype pattern para IDs de domínio
struct CarrinhoId: RawRepresentable, Hashable, Codable {
    let rawValue: UUID
    init(rawValue: UUID = UUID()) { self.rawValue = rawValue }
}

// ❌ class para modelos simples — referência semântica desnecessária
class Carrinho { var itens: [Item] = [] }
```

### 2.2 Enums para union types e domínio
```swift
// ✅ Enum com associated values — ADT Swift
enum CupomResult {
    case sucesso(Carrinho)
    case expirado(validade: Date)
    case naoEncontrado(codigo: String)
}

// Pattern matching exaustivo
switch result {
case .sucesso(let carrinho):
    return .success(CarrinhoResponse(carrinho))
case .expirado(let val):
    return .failure(.cupomExpirado(validade: val))
case .naoEncontrado(let cod):
    return .failure(.cupomNaoEncontrado(codigo: cod))
}

// ✅ Enum como namespace de constantes
enum APIEndpoints {
    static let carrinhos = "/v1/carrinhos"
    static func cupom(id: CarrinhoId) -> String { "\(carrinhos)/\(id.rawValue)/cupom" }
}
```

### 2.3 Swift Concurrency — sem completion handlers
```swift
// ✅ async/await com structured concurrency
func buscarCarrinho(_ id: CarrinhoId) async throws -> Carrinho {
    let request = URLRequest(url: baseURL.appending(path: "/v1/carrinhos/\(id.rawValue)"))
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        throw APIError.naoEncontrado
    }
    return try JSONDecoder().decode(Carrinho.self, from: data)
}

// ✅ Task para side-effects em SwiftUI
.onAppear {
    Task {
        await viewModel.carregarCarrinho(id)
    }
}

// ❌ Completion handler em código novo
func buscarCarrinho(_ id: String, completion: @escaping (Result<Carrinho, Error>) -> Void) {  // proibido
    URLSession.shared.dataTask(with: url) { data, _, error in ... }.resume()
}

// ❌ Force try — crash em produção
let carrinho = try! decodificar(data)  // proibido
```

### 2.4 @Observable macro (iOS 17+)
```swift
// ✅ @Observable — sem @Published necessário (iOS 17+)
@Observable
final class CarrinhoViewModel {
    var uiState: CarrinhoUiState = .carregando
    private(set) var carrinho: Carrinho?

    private let useCase: AplicarCupomUseCaseProtocol

    init(useCase: AplicarCupomUseCaseProtocol) {
        self.useCase = useCase
    }

    func aplicarCupom(_ codigo: String) async {
        uiState = .carregando
        let result = await useCase.execute(carrinhoId: carrinho!.id, codigo: codigo)
        uiState = switch result {
        case .sucesso(let c): .carregado(c)
        case .expirado: .erro("Cupom expirado")
        case .naoEncontrado: .erro("Cupom não encontrado")
        }
    }
}

// Para iOS 16 e abaixo (fallback):
// @MainActor final class CarrinhoViewModel: ObservableObject {
//     @Published var uiState: CarrinhoUiState = .carregando
// }
```

## 3. SwiftUI — padrões obrigatórios

### 3.1 UDF — Unidirectional Data Flow
```swift
// ✅ View recebe estado, envia actions para ViewModel
struct CarrinhoScreen: View {
    @State private var viewModel: CarrinhoViewModel  // @Observable não precisa @StateObject

    init(carrinhoId: CarrinhoId) {
        self._viewModel = State(wrappedValue: CarrinhoViewModel(
            carrinhoId: carrinhoId,
            useCase: Dependencies.shared.aplicarCupomUseCase
        ))
    }

    var body: some View {
        CarrinhoContent(
            uiState: viewModel.uiState,
            onAplicarCupom: { codigo in
                Task { await viewModel.aplicarCupom(codigo) }
            }
        )
    }
}

// ✅ Subview "burra" — recebe dados, emite closures
struct CarrinhoContent: View {
    let uiState: CarrinhoUiState
    let onAplicarCupom: (String) -> Void

    var body: some View {
        switch uiState {
        case .carregando: ProgressView()
        case .carregado(let carrinho): CarrinhoList(carrinho: carrinho, onAplicarCupom: onAplicarCupom)
        case .erro(let msg): ErrorView(mensagem: msg)
        }
    }
}
```

### 3.2 Sem force unwrap `!` em produção
```swift
// ✅ Optional binding
guard let carrinho = carrinho else {
    return EmptyCarrinhoView()
}

// ✅ Nil coalescing
let desconto = cupom?.desconto ?? 0

// ❌ Force unwrap — crash garantido quando nil
let total = carrinho!.totalBruto  // proibido
let decoded = try! JSONDecoder().decode(...)  // proibido
```

### 3.3 Accessibility obrigatório
```swift
Button(action: { aplicarCupom() }) {
    Image(systemName: "tag.fill")
}
.accessibilityLabel("Aplicar cupom de desconto")
.accessibilityHint("Toque para aplicar o código PROMO10")

// Lista acessível
List(itens, id: \.id) { item in
    ItemCarrinhoRow(item: item)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.nome), \(item.preco.formatted(.currency(code: "BRL")))")
}
```

## 4. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Types (struct/class/enum/protocol) | `PascalCase` | `CarrinhoViewModel`, `CupomResult` |
| Protocols | `PascalCase` + sufixo descritivo | `AplicarCupomUseCaseProtocol`, `CarrinhoRepositoring` |
| Funções/métodos | `camelCase` + verbo | `aplicarCupom(_:)`, `buscarCarrinho(id:)` |
| Propriedades/variáveis | `camelCase` | `totalLiquido`, `cupomAplicado` |
| Constantes | `camelCase` ou `UPPER_SNAKE` em `enum` namespace | `maxItensCarrinho`, `APIEndpoints.carrinhos` |
| Arquivos | `PascalCase.swift` | `CarrinhoViewModel.swift`, `CupomResult.swift` |

## 5. Pirâmide de testes (iOS)

```
     ▲ UI E2E (≤5%)         XCUITest — smoke jornadas críticas
    ╱─╲ Integração (≈15%)    XCTest + URLProtocol mock / stub HTTP
   ╱───╲ Unitário (≥80%)     XCTest / Swift Testing — ViewModel, UseCases, pure logic
```

```swift
// ✅ Teste com Swift Testing (Xcode 16+)
@Suite("AplicarCupomUseCase")
struct AplicarCupomUseCaseTests {

    @Test("Cupom expirado retorna .expirado")
    func cupomExpirado() async {
        let repo = MockCupomRepository()
        repo.cupomParaRetornar = Cupom(codigo: "PROMO", validade: Date.distantPast, desconto: 10)
        let sut = AplicarCupomUseCase(cupomRepo: repo)

        let result = await sut.execute(carrinhoId: CarrinhoId(), codigo: "PROMO")

        #expect(result == .expirado(validade: Date.distantPast))
    }
}

// ✅ Teste legado com XCTest
class CarrinhoViewModelTests: XCTestCase {
    func testAplicarCupomExpiradoEmiteEstadoErro() async {
        let mockUseCase = MockAplicarCupomUseCase()
        mockUseCase.resultadoFixo = .expirado(validade: .distantPast)
        let vm = CarrinhoViewModel(useCase: mockUseCase)

        await vm.aplicarCupom("PROMO")

        guard case .erro = vm.uiState else {
            XCTFail("Esperava estado de erro, recebeu \(vm.uiState)")
            return
        }
    }
}
```

## 6. Anti-padrões específicos de iOS/Swift

- ❌ Force unwrap `!` em produção
- ❌ `try!` ou `try?` que engole erros silenciosamente
- ❌ Completion handlers em código novo (use async/await)
- ❌ Lógica de negócio dentro de `body` da View
- ❌ `DispatchQueue.main.async` dentro de ViewModel moderno (use `@MainActor`)
- ❌ `UserDefaults` para dados sensíveis (use Keychain)
- ❌ `class` para modelos do domínio quando `struct` é suficiente
- ❌ Captura forte de `self` em closures async (`[weak self]` quando necessário)
- ❌ Misturar Combine e Swift Concurrency no mesmo flow (escolha 1)
- ❌ Views > 150 linhas sem `@ViewBuilder` split ou subview extraction
