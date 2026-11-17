---
id: arch-mvc
name: arch-mvc
type: skill
description: MVC (Model-View-Controller) — separação clássica de responsabilidades. Adequado para apps simples ou mobile com navegação baseada em controllers. iOS UIKit, Android clássico.
applicable_to:
  - "@frontend-ios"
  - "@frontend-android"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: arch-mvc

> Define o padrão **MVC (Model-View-Controller)** para frontend mobile.
> Para idiomas e frameworks específicos, use a skill `lang-*` correspondente.
> Para apps com UI complexa reativa, considere `arch-mvvm` como alternativa.

---

## 1. Quando usar MVC

| Use MVC | Prefira MVVM |
|---|---|
| App simples com poucos estados de UI | Muitos estados de UI (loading/error/empty/data) |
| iOS UIKit com UIViewController existente | SwiftUI / Jetpack Compose novos |
| Manutenção de base legada | Novo módulo com comportamento reativo |
| Formulários simples sem estado compartilhado | Estado compartilhado entre telas |

**Regra prática**: se o controller tem > 300 linhas, considere migrar para MVVM.

## 2. Responsabilidades

```
Model                View               Controller
─────────────        ──────────         ─────────────────────
Dados do domínio     UIView /           UIViewController /
Lógica de negócio    Layout XML /       Activity/Fragment /
Validações           SwiftUI Views      RequestHandler

Model não conhece View nem Controller.
View é passiva — Controller atualiza a View.
Controller conhece Model e View, orquestra.
```

## 3. Estrutura de diretórios

### iOS (UIKit — MVC nativo)
```
Sources/
├── Controllers/
│   ├── CarrinhoViewController.swift
│   └── DetalheItemViewController.swift
├── Views/
│   ├── CarrinhoCell.swift              # UITableViewCell
│   ├── CupomFormView.swift             # UIView customizada
│   └── Xibs/                           # .xib para views complexas
├── Models/
│   ├── Carrinho.swift                  # Struct de domínio
│   ├── Cupom.swift
│   └── CarrinhoService.swift           # Service (camada de dados/regras)
└── Helpers/
    ├── Formatters.swift
    └── Constants.swift
```

### Android (Activity/Fragment — MVC clássico)
```
app/src/main/java/com/empresa/app/
├── ui/
│   ├── carrinho/
│   │   ├── CarrinhoActivity.kt         # Controller
│   │   ├── CarrinhoAdapter.kt          # View (RecyclerView)
│   │   └── CupomDialogFragment.kt      # Controller de dialog
│   └── shared/
│       └── LoadingDialog.kt
├── model/
│   ├── Carrinho.kt                     # Data class
│   └── Cupom.kt
├── repository/
│   ├── CarrinhoRepository.kt           # Interface
│   └── CarrinhoRepositoryImpl.kt       # Retrofit / Room
└── di/
    └── AppModule.kt
```

## 4. Controller — responsabilidades e limites

```swift
// ✅ Controller faz: lifecycle, delegação, atualização de View, chama Service
class CarrinhoViewController: UIViewController {
    private var carrinho: Carrinho?
    private let service: CarrinhoServicing

    init(service: CarrinhoServicing) {
        self.service = service
        super.init(nibName: nil, bundle: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configurarUI()
        carregarCarrinho()
    }

    private func carregarCarrinho() {
        Task { @MainActor in
            do {
                carrinho = try await service.buscarCarrinho(id: carrinhoId)
                atualizarView()
            } catch {
                exibirErro(error)
            }
        }
    }

    // ✅ Atualiza View com dados do Model — Controller orquestra
    private func atualizarView() {
        guard let carrinho else { return }
        tituloLabel.text = "Carrinho (\(carrinho.totalItens) itens)"
        tableView.reloadData()
    }
}

// ❌ Fat Controller — lógica de negócio dentro
class CarrinhoViewController: UIViewController {
    func aplicarCupom(codigo: String) {
        // ❌ Validação de domínio no controller
        guard !codigo.isEmpty, codigo.count <= 50 else { return }
        guard Date() < cupom.validade else {
            showAlert("Cupom expirado")
            return
        }
        // ❌ Cálculo de desconto no controller
        let desconto = itens.reduce(0) { $0 + $1.preco } * cupom.percentual / 100
        totalLabel.text = "R$ \(desconto)"
    }
}
```

### Service — lógica de negócio e acesso a dados
```swift
// ✅ Service contém lógica que não pertence ao Controller nem ao Model simples
protocol CarrinhoServicing {
    func buscarCarrinho(id: CarrinhoId) async throws -> Carrinho
    func aplicarCupom(carrinhoId: CarrinhoId, codigo: String) async throws -> Carrinho
}

class CarrinhoService: CarrinhoServicing {
    private let repository: CarrinhoRepositoring
    private let cupomRepository: CupomRepositoring

    func aplicarCupom(carrinhoId: CarrinhoId, codigo: String) async throws -> Carrinho {
        var carrinho = try await repository.buscar(carrinhoId)
        let cupom = try await cupomRepository.buscarPorCodigo(codigo)
        guard !cupom.expirado else { throw CarrinhoError.cupomExpirado }
        carrinho.aplicarCupom(cupom)
        try await repository.salvar(carrinho)
        return carrinho
    }
}
```

## 5. Model — puro, sem dependência de UI

```swift
// ✅ Struct imutável com comportamento de domínio
struct Carrinho {
    let id: CarrinhoId
    private(set) var itens: [ItemCarrinho]
    private(set) var cupom: Cupom?

    var totalBruto: Decimal { itens.reduce(0) { $0 + $1.subtotal } }
    var totalItens: Int { itens.count }

    mutating func aplicarCupom(_ cupom: Cupom) throws {
        guard !cupom.expirado else { throw CarrinhoError.cupomExpirado }
        guard self.cupom == nil else { throw CarrinhoError.cupomJaAplicado }
        self.cupom = cupom
    }
}

// ❌ Model conhecendo UIViewController
class Carrinho {
    weak var delegate: UIViewController?  // Model não conhece View
    func atualizar() { delegate?.viewDidLoad() }  // proibido
}
```

## 6. Comunicação Controller → View

No MVC UIKit, o Controller possui referências às Views. Prefira:

```swift
// ✅ IBOutlet ou referências lazy — View configurada pelo Controller
@IBOutlet private weak var totalLabel: UILabel!
@IBOutlet private weak var tableView: UITableView!

// ✅ Delegate/DataSource do Controller para componentes de lista
extension CarrinhoViewController: UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        carrinho?.itens.count ?? 0
    }
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "ItemCell", for: indexPath)
        // configure cell
        return cell
    }
}
```

## 7. Anti-padrões de MVC mobile

- ❌ Fat ViewController > 500 linhas — extraia Service, helper ou subcontroller
- ❌ Lógica de domínio no Controller (pertence ao Model/Service)
- ❌ View com referência ao Controller (quebraria reusabilidade)
- ❌ Model com referência a `UIViewController`/`Activity`/`Fragment`
- ❌ Fetch de dados em `viewDidAppear` sem cancelamento
- ❌ `DispatchQueue.main.async` dentro de Service — use `@MainActor` ou `MainThread`
- ❌ `runBlocking` em Activity/Fragment Android — use `lifecycleScope.launch`
- ❌ Business logic em `RecyclerView.Adapter` ou `UITableViewDataSource`
