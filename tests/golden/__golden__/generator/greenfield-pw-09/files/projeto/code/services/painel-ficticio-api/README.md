# painel-ficticio-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Java 21
- **Framework**: Spring Boot, com Maven
- **Arquitetura**: Vertical Slice Architecture
- **Testes**: JUnit, pelo spring-boot-starter-test
- **Observabilidade**: Spring Boot Actuator

## Estrutura

Cada feature é autocontida (domínio, infraestrutura e API juntos). O que é comum a todas fica em shared.

Diretórios que o gerador criou:

```
src/main/java/com/example/app/feature/health
src/main/java/com/example/app/shared/persistence
src/main/java/com/example/app/shared/observability
src/main/java/com/example/app/shared/config
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

- **`@backend-java`**: implementa código conforme Vertical Slice Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de vertical-slice

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
