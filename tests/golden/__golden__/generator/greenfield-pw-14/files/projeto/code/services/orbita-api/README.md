# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Java 21
- **Framework**: Spring Boot, com Maven
- **Arquitetura**: Clean/Hexagonal (Ports & Adapters)
- **Testes**: JUnit, pelo spring-boot-starter-test
- **Observabilidade**: Spring Boot Actuator

## Estrutura

O domínio não depende de infraestrutura: as portas ficam no domínio, os casos de uso na aplicação e os adaptadores na infraestrutura.

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

- **`@backend-java`**: implementa código conforme Clean/Hexagonal (Ports & Adapters)
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de hexagonal

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
