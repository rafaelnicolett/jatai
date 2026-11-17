# orbita-api

Backend gerado pela Helyx.

## Stack

- **Linguagem**: Java 21
- **Framework**: Spring Boot, com Maven
- **Arquitetura**: Layered/N-Tier Architecture
- **Testes**: JUnit, pelo spring-boot-starter-test
- **Observabilidade**: Spring Boot Actuator

## Estrutura

Controladores chamam serviços, que chamam repositórios, que acessam os modelos.

Diretórios que o gerador criou:

```
src/main/java/com/example/app/controller
src/main/java/com/example/app/service
src/main/java/com/example/app/repository
src/main/java/com/example/app/model
src/main/java/com/example/app/config
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

- **`@backend-java`**: implementa código conforme Layered/N-Tier Architecture
- **`@arch-cross`**: valida conformidade arquitetural nos gates G1 e G2
- **`@reviewer`**: revisa PRs aplicando as rubricas de layered

Ver [`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
