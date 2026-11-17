# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Java 21
- **Framework**: Spring Boot, com Maven
- **Arquitetura**: DDD Tactical (Aggregates + Domain Events)
- **Testes**: JUnit, pelo spring-boot-starter-test
- **Observabilidade**: Spring Boot Actuator

## Estrutura

Agregados, entidades, objetos de valor e eventos ficam no domínio; comandos e consultas (CQRS) ficam na aplicação.

Diretórios que o gerador criou:

```
src/main/java/com/example/app/domain/model
src/main/java/com/example/app/domain/port/input
src/main/java/com/example/app/domain/port/output
src/main/java/com/example/app/domain/event
src/main/java/com/example/app/application/usecase
src/main/java/com/example/app/infrastructure/persistence
src/main/java/com/example/app/infrastructure/web
src/main/java/com/example/app/infrastructure/config
src/main/resources
src/test/java/com/example/app
```

## Comandos

```bash
# Rodar localmente
mvn spring-boot:run

# Testes
mvn test
```

## Agentes especializados

- **`@backend-java`**: implementa código conforme DDD Tactical (Aggregates + Domain Events)
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de ddd-tactical

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
