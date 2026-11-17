---
id: lang-java-spring
name: lang-java-spring
type: skill
description: Boas práticas da linguagem Java 21 com Spring Boot 3.x — idiomas modernos, DI, async, testes e observabilidade. Independente do padrão arquitetural.
applicable_to:
  - "@backend-java"
  - "@reviewer"
  - "@arch-cross"
---

# Skill: lang-java-spring

> Boas práticas da **linguagem Java e framework Spring Boot**, não do padrão arquitetural.
> Para estrutura de camadas e pastas, use a skill `arch-*` correspondente.

---

## 1. Runtime e tooling

| Item | Padrão | Observação |
|---|---|---|
| Java | 21 (LTS) | Virtual Threads habilitadas por padrão |
| Build | Maven (pom.xml) com Spring Boot BOM | Gradle aceito se já estabelecido |
| Spring Boot | 3.x (Jakarta EE 10) | `@SpringBootApplication` + auto-configuration |
| Web | Spring MVC (sync + VT) **ou** WebFlux (reactive) — **1 por serviço** | VT+MVC para maioria; WebFlux para backpressure real |
| Persistence | Spring Data JPA + Hibernate 6 | `@Repository` como interface, nunca implementação manual |
| Migrations | Flyway | Scripts em `src/main/resources/db/migration/V{n}__{desc}.sql` |
| HTTP client (saída) | `RestClient` (Spring 6.1) ou `WebClient` | Nunca `RestTemplate` em código novo |
| Serialização | Jackson 2.15+ | `@JsonProperty` na borda; record projections no domínio |
| Logs | Logback + Logstash encoder (JSON) | MDC para `traceId`, `tenantId` |
| Observabilidade | Micrometer + OpenTelemetry | `@Timed`, `@Observed` ou manual span |
| Test runner | JUnit 5 + AssertJ | `@ExtendWith(MockitoExtension.class)` sem Spring context |
| Mocks | Mockito 5 | `@Mock`, `@InjectMocks` — sem `@MockBean` em unit tests |
| Integration | `@SpringBootTest` + Testcontainers | `@DynamicPropertySource` para URLs de container |
| HTTP mock | WireMock 3 | Substitui mocks de `RestClient`/`WebClient` |
| Contract | Spring Cloud Contract ou Pact | Verifica provider + consumer |

## 2. Java 21 — idiomas modernos obrigatórios

### 2.1 Records para DTO e Value Objects
```java
// ✅ Record — imutável por padrão, equals/hashCode/toString gerado
public record CupomId(UUID value) {
    public CupomId {
        Objects.requireNonNull(value, "CupomId não pode ser nulo");
    }
}

public record AplicarCupomCommand(CarrinhoId carrinhoId, String codigo) {}

// ❌ Classe mutável desnecessária
public class CupomId {
    private UUID value;
    public CupomId(UUID value) { this.value = value; }
    public UUID getValue() { return value; }
    // + equals/hashCode/toString manual — verboso e propenso a erro
}
```

### 2.2 Sealed interfaces para union types do domínio
```java
// ✅ Sealed + records — ADT em Java
public sealed interface CupomError permits CupomError.Expirado, CupomError.NaoEncontrado, CupomError.JaUtilizado {
    record Expirado(LocalDate validade) implements CupomError {}
    record NaoEncontrado(String codigo) implements CupomError {}
    record JaUtilizado(ClienteId clienteId) implements CupomError {}
}

// Pattern matching no switch (Java 21)
String mensagem = switch (error) {
    case CupomError.Expirado(var val) -> "Cupom expirado em " + val;
    case CupomError.NaoEncontrado(var cod) -> "Cupom '" + cod + "' não encontrado";
    case CupomError.JaUtilizado(var id) -> "Cupom já usado por cliente " + id;
};
```

### 2.3 Virtual Threads (Java 21) — I/O bloqueante sem problema
```java
// application.properties
spring.threads.virtual.enabled=true

// Com VT habilitadas, código síncrono é eficiente:
public Carrinho buscarCarrinho(CarrinhoId id) {
    return carrinhoRepository.findById(id.value())  // blocking — OK com VT
        .map(CarrinhoMapper::toDomain)
        .orElseThrow(() -> new CarrinhoNaoEncontrado(id));
}
// Sem necessidade de CompletableFuture/reactive para I/O simples
```

### 2.4 Pattern matching e instanceof
```java
// ✅ Pattern matching (Java 16+)
if (resultado instanceof Ok<Carrinho> ok) {
    return CarrinhoResponse.from(ok.value());
}

// ✅ Switch expression com pattern
return switch (resultado) {
    case Ok<Carrinho> ok -> CarrinhoResponse.from(ok.value());
    case Err<CupomError> err -> throw mapDomainError(err.error());
};

// ❌ instanceof + cast manual
if (resultado instanceof Ok) {
    Carrinho c = ((Ok<Carrinho>) resultado).getValue();
}
```

## 3. Spring Boot — padrões obrigatórios

### 3.1 Dependency injection por construtor (nunca por campo)
```java
// ✅ Construtor — testável, imutável
@Service
public class AplicarCupomUseCase {
    private final CarrinhoRepository carrinhoRepo;
    private final CupomRepository cupomRepo;
    private final DomainEventPublisher eventPublisher;

    // Spring injeta automaticamente quando há 1 construtor
    public AplicarCupomUseCase(
        CarrinhoRepository carrinhoRepo,
        CupomRepository cupomRepo,
        DomainEventPublisher eventPublisher
    ) {
        this.carrinhoRepo = carrinhoRepo;
        this.cupomRepo = cupomRepo;
        this.eventPublisher = eventPublisher;
    }
}

// ❌ Campo — não testável sem Spring context, mutável
@Service
public class AplicarCupomUseCase {
    @Autowired private CarrinhoRepository carrinhoRepo;  // proibido
}
```

### 3.2 Lombok — uso restrito
```java
// ✅ Permitido
@RequiredArgsConstructor   // gera construtor dos campos final
@Getter                    // apenas quando necessário
@Builder                   // para builders de test data

// ❌ Proibido
@Data           // gera setter em tudo — domínio fica mutável
@EqualsAndHashCode(callSuper = true)  // perigoso com JPA
@SneakyThrows   // esconde exceções checadas — enganoso
```

### 3.3 Configuração por ambiente
```yaml
# application.yml — valores padrão
spring:
  datasource:
    url: ${DATABASE_URL}   # variável de ambiente — nunca hardcode

# application-local.yml — override local (no .gitignore)
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
```

### 3.4 Controllers — delgados
```java
// ✅ Controller apenas roteia, valida e converte
@RestController
@RequestMapping("/v1/carrinhos")
@RequiredArgsConstructor
public class CarrinhoController {
    private final AplicarCupomUseCase aplicarCupomUseCase;

    @PostMapping("/{id}/cupom")
    public ResponseEntity<CarrinhoResponse> aplicarCupom(
        @PathVariable UUID id,
        @Valid @RequestBody AplicarCupomRequest request
    ) {
        var result = aplicarCupomUseCase.execute(new CarrinhoId(id), request.codigo());
        return switch (result) {
            case Ok<Carrinho> ok -> ResponseEntity.ok(CarrinhoResponse.from(ok.value()));
            case Err<CupomError> err -> ResponseEntity.unprocessableEntity()
                .body(errorEnvelope(err.error()));
        };
    }
}
```

## 4. Naming conventions

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes/Interfaces | `PascalCase` | `CarrinhoRepository`, `AplicarCupomUseCase` |
| Métodos | `camelCase` + verbo | `aplicarCupom()`, `buscarPorId()` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_ITENS_CARRINHO` |
| Pacotes | `lowercase.sem.underline` | `com.empresa.checkout.domain` |
| Variáveis | `camelCase` | `carrinhoId`, `cupomCodigo` |
| IDs de domínio | `record` com tipo próprio | `record CarrinhoId(UUID value)` |

## 5. Pirâmide de testes (Java)

```
     ▲ E2E (≤10%)        Testcontainers + HTTP cliente real
    ╱─╲ Contract (≈15%)   Spring Cloud Contract ou Pact
   ╱───╲ Integração (≈25%) @SpringBootTest + Testcontainers
  ╱─────╲ Unitário (≥50%)  JUnit 5 puro, sem Spring context
```

### 5.1 Unitário — sem Spring context
```java
// ✅ JUnit 5 + Mockito — sem @SpringBootTest
@ExtendWith(MockitoExtension.class)
class AplicarCupomUseCaseTest {
    @Mock CarrinhoRepository carrinhoRepo;
    @Mock CupomRepository cupomRepo;
    @Mock DomainEventPublisher eventPublisher;
    @InjectMocks AplicarCupomUseCase useCase;

    @Test
    void cupomExpiradoRetornaErro() {
        var cupom = new Cupom(new CupomId(randomUUID()), "PROMO", LocalDate.of(2020,1,1), Desconto.pct(10));
        when(cupomRepo.buscarPorCodigo("PROMO")).thenReturn(Optional.of(cupom));

        var result = useCase.execute(new CarrinhoId(randomUUID()), "PROMO");

        assertThat(result).isInstanceOf(Err.class);
        assertThat(((Err<CupomError>) result).error()).isInstanceOf(CupomError.Expirado.class);
    }
}
```

### 5.2 Integração com Testcontainers
```java
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class CarrinhoRepositoryIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void overrideProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired CarrinhoRepository repo;

    @Test
    void salvarERecuperarCarrinho() {
        var carrinho = Carrinho.novo(new ClienteId(randomUUID()));
        repo.salvar(carrinho);
        var recuperado = repo.buscar(carrinho.getId());
        assertThat(recuperado).isPresent().hasValue(carrinho);
    }
}
```

## 6. Observabilidade

```java
// Micrometer + OTel auto-instrument ou manual
@Observed(name = "aplicar.cupom", contextualName = "AplicarCupomUseCase")
public Result<Carrinho, CupomError> execute(CarrinhoId id, String codigo) {
    // span criado automaticamente pelo @Observed
}

// Manual para granularidade fina
Span span = tracer.nextSpan().name("validar-cupom").start();
try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
    span.tag("cupom.codigo", codigo);
    return validarCupom(cupom);
} finally {
    span.end();
}
```

## 7. Anti-padrões específicos de Java/Spring

- ❌ `@Autowired` em campo (use construtor)
- ❌ `@Data` do Lombok em entidades JPA (hashCode/equals problemático)
- ❌ `new` direto de dependências (quebraria DI e testabilidade)
- ❌ `Optional.get()` sem `isPresent()` — NPE encoberto
- ❌ Captura de `Exception` genérica sem re-throw ou log
- ❌ Lógica de negócio em `@RestController` (pertence ao use case)
- ❌ SQL string-concat — use `@Query` parametrizado ou Criteria API
- ❌ `Thread.sleep()` em produção
- ❌ Entities JPA como DTOs HTTP (expõe schema do banco)
- ❌ `@Transactional` no domínio (pertence ao adapter de persistência)
