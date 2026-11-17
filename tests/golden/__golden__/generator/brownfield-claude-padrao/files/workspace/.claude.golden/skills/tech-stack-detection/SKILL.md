---
id: tech-stack-detection
name: tech-stack-detection
type: skill
description: >
  Heurísticas para detectar a stack tecnológica real de um projeto brownfield a
  partir de manifests e lock files. Garante que versões reportadas sejam as em
  uso (lock), não as declaradas. Usada por @tech-mapper.
applicable_to:
  - "@tech-mapper"
inputs:
  - manifests (package.json, pom.xml, build.gradle, pyproject.toml, *.csproj, go.mod, Cargo.toml, Gemfile)
  - lock files (package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, Gemfile.lock, Cargo.lock, go.sum, packages.lock.json)
outputs:
  - Lista de (linguagem, framework, runtime, build tool, ORM, DB driver) com versões reais
---

# Skill: tech-stack-detection

> **Versão real é a do lock. Sempre.**
> `package.json` diz `^4.0.0`, mas o lock diz `4.7.3` — a real é 4.7.3.

## 1. Tabela de detecção por ecossistema

| Ecossistema | Manifest | Lock | Detecta |
|---|---|---|---|
| Node.js | package.json | package-lock.json / pnpm-lock.yaml / yarn.lock | runtime via `engines`, framework via deps |
| Java | pom.xml | (Maven não tem lock por default; checar `dependencyManagement`) | `<java.version>`, Spring/Quarkus/Micronaut |
| Java/Kotlin | build.gradle(.kts) | gradle.lockfile (se ativado) | `sourceCompatibility`, plugins |
| Python | pyproject.toml / requirements.txt | poetry.lock / Pipfile.lock / requirements.txt (com pin) | `python_requires`, FastAPI/Django/Flask |
| .NET | *.csproj | packages.lock.json | `<TargetFramework>`, ASP.NET / EF |
| Go | go.mod | go.sum | `go 1.X`, deps |
| Rust | Cargo.toml | Cargo.lock | `edition`, deps |
| Ruby | Gemfile | Gemfile.lock | `ruby '...'`, Rails/Sinatra |
| Swift | Package.swift | Package.resolved | targets, deps |

## 2. Heurísticas de framework

| Sinal | Framework |
|---|---|
| `org.springframework.boot` em pom/build | Spring Boot |
| `fastapi`, `uvicorn` em pyproject | FastAPI |
| `django` em pyproject/requirements | Django |
| `flask` em requirements | Flask |
| `react`, `react-dom` | React |
| `vue` | Vue |
| `@angular/core` | Angular |
| `next` | Next.js |
| `vite` em devDeps | Vite |
| `Microsoft.AspNetCore.*` em csproj | ASP.NET Core |
| `gin-gonic`, `echo`, `fiber` em go.mod | Go web frameworks |
| `actix-web`, `rocket`, `axum` em Cargo | Rust web |

## 3. Heurísticas de DB / ORM

| Dep | DB / ORM |
|---|---|
| `psycopg2`, `psycopg`, `pg`, `postgresql-jdbc` | PostgreSQL |
| `pymysql`, `mysql-connector`, `mysql2` | MySQL |
| `sqlalchemy` | SQLAlchemy ORM |
| `prisma`, `@prisma/client` | Prisma |
| `typeorm`, `mikro-orm` | TS ORMs |
| `hibernate-core`, `spring-data-jpa` | Hibernate/JPA |
| `EntityFrameworkCore` | EF Core |
| `mongoose`, `mongodb` | MongoDB |
| `redis`, `ioredis`, `lettuce-core` | Redis |

## 4. Status da versão

Para cada dep: comparar com **latest stable** (de memória — `npmjs`, `Maven Central`, `PyPI`, `nuget.org`):

- `latest` — alinhado
- `outdated-minor` — atrás de minor/patch
- `outdated-major` — atrás de major
- `EOL` — versão sem suporte

## 5. Anti-padrões

- ❌ Reportar versão do `^` no package.json — sempre lock
- ❌ Listar deps `optionalDependencies` como obrigatórias
- ❌ Confundir devDependency com runtime
- ❌ Inferir framework sem evidência de import
