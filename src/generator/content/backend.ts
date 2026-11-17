/**
 * backend.ts
 *
 * Backend do scaffold greenfield: pastas por stack × arquitetura, README,
 * Dockerfile, entry point Python, pyproject.toml, pom.xml e a solução .NET.
 *
 * Funções puras `(estado do Wizard) => texto` (F3.4, passo 3): sem fs, sem
 * relógio. Saíram do StructureGenerator sem mudar um byte do que geram.
 */

import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";

export function getBackendDirs(architecture: string, stack: string): string[] {
  // Java Spring uses Maven standard layout (src/main/java/...)
  if (stack === "java-spring") {
    const pkg = "src/main/java/com/example/app";
    switch (architecture) {
      case "hexagonal":
      case "ddd-tactical":
        return [
          `${pkg}/domain/model`,
          `${pkg}/domain/port/input`,
          `${pkg}/domain/port/output`,
          `${pkg}/domain/event`,
          `${pkg}/application/usecase`,
          `${pkg}/infrastructure/persistence`,
          `${pkg}/infrastructure/web`,
          `${pkg}/infrastructure/config`,
          "src/main/resources",
          "src/test/java/com/example/app",
        ];
      case "vertical-slice":
        return [
          `${pkg}/feature/health`,
          `${pkg}/shared/persistence`,
          `${pkg}/shared/observability`,
          `${pkg}/shared/config`,
          "src/main/resources",
          "src/test/java/com/example/app",
        ];
      case "layered":
      default:
        return [
          `${pkg}/controller`,
          `${pkg}/service`,
          `${pkg}/repository`,
          `${pkg}/model`,
          `${pkg}/config`,
          "src/main/resources",
          "src/test/java/com/example/app",
        ];
    }
  }

  // .NET uses src/<Project>.<Layer>/ structure
  if (stack === "dotnet-core") {
    switch (architecture) {
      case "hexagonal":
      case "ddd-tactical":
        return [
          "src/Domain/Entities",
          "src/Domain/ValueObjects",
          "src/Domain/Ports",
          "src/Domain/Events",
          "src/Application/UseCases",
          "src/Application/DTOs",
          "src/Infrastructure/Persistence",
          "src/Infrastructure/WebApi/Controllers",
          "src/Infrastructure/WebApi/Middleware",
          "tests/Unit",
          "tests/Integration",
        ];
      case "vertical-slice":
        return [
          "src/Features/Health",
          "src/Shared/Persistence",
          "src/Shared/Observability",
          "src/API",
          "tests/Features",
        ];
      case "layered":
      default:
        return [
          "src/Controllers",
          "src/Services",
          "src/Repositories",
          "src/Models",
          "src/Configuration",
          "tests/Unit",
          "tests/Integration",
        ];
    }
  }

  // Python API / Python Agentic (existing behavior)
  switch (architecture) {
    case "hexagonal":
      return [
        "src/domain/model",
        "src/domain/ports",
        "src/application/use_cases",
        "src/infrastructure/adapters",
        "src/infrastructure/config",
        "src/api/routes",
        "tests/unit",
        "tests/integration",
      ];
    case "vertical-slice":
      return [
        "src/features/health",
        "src/shared/database",
        "src/shared/observability",
        "src/api",
        "tests/features",
      ];
    case "layered":
      return [
        "src/controllers",
        "src/services",
        "src/repositories",
        "src/models",
        "src/config",
        "tests/unit",
        "tests/integration",
      ];
    case "ddd-tactical":
      return [
        "src/domain/aggregates",
        "src/domain/entities",
        "src/domain/value_objects",
        "src/domain/events",
        "src/domain/repositories",
        "src/application/commands",
        "src/application/queries",
        "src/infrastructure/persistence",
        "src/infrastructure/messaging",
        "src/api/routes",
        "tests/unit/domain",
        "tests/integration",
      ];
    default:
      return ["src", "tests"];
  }
}

/**
 * O que o scaffold realmente cria por stack: a fonte do README do backend. Cada linha aqui
 * tem de bater com os arquivos que o gerador escreve (pom.xml, .csproj, pyproject.toml,
 * Dockerfile). Nada de texto de uma stack aparece no README de outra.
 */
interface BackendStackDoc {
  language: string;
  framework: string;
  tests: string;
  /** Só o que o scaffold instala. `undefined` quando não instala nada. */
  observability?: string;
  /** Id do agente do kit que implementa a stack (`kit/content/agents/downstream`). */
  agent: string;
  /** Bloco de comandos do dia a dia. */
  commands: string;
}

function pythonCommands(): string {
  return [
    "# Instalar as dependências, com as de desenvolvimento",
    'pip install -e ".[dev]"',
    "",
    "# Rodar localmente",
    "python -m src.main",
    "",
    "# Testes",
    "pytest",
    "",
    "# Lint",
    "ruff check src/ tests/",
  ].join("\n");
}

function backendStackDoc(state: WizardState): BackendStackDoc {
  switch (state.backendStack) {
    case "java-spring":
      return {
        language: "Java 21",
        framework: "Spring Boot, com Maven",
        tests: "JUnit, pelo spring-boot-starter-test",
        observability: "Spring Boot Actuator",
        agent: "backend-java",
        commands: ["# Rodar localmente", "mvn spring-boot:run", "", "# Testes", "mvn test"].join("\n"),
      };
    case "dotnet-core": {
      const ns = state.projectName.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
      return {
        language: ".NET 8 (C#)",
        framework: "ASP.NET Core",
        tests: "dotnet test",
        observability: "OpenTelemetry (hosting)",
        agent: "backend-dotnet",
        commands: ["# Rodar localmente", `dotnet run --project src/${ns}.API`, "", "# Testes", "dotnet test"].join("\n"),
      };
    }
    case "python-agentic":
      return {
        language: "Python 3.12+",
        framework: "FastAPI, com LangGraph e LangChain",
        tests: "pytest",
        agent: "backend-python-agentic",
        commands: pythonCommands(),
      };
    case "python-api":
    default:
      return {
        language: "Python 3.12+",
        framework: "FastAPI",
        tests: "pytest",
        agent: "backend-python-api",
        commands: pythonCommands(),
      };
  }
}

export function buildBackendReadme(state: WizardState): string {
  const archLabel = {
    hexagonal: "Clean/Hexagonal (Ports & Adapters)",
    "vertical-slice": "Vertical Slice Architecture",
    layered: "Layered/N-Tier Architecture",
    "ddd-tactical": "DDD Tactical (Aggregates + Domain Events)"
  }[state.backendArchitecture];

  const archNote = {
    hexagonal: "O domínio não depende de infraestrutura: as portas ficam no domínio, os casos de uso na aplicação e os adaptadores na infraestrutura.",
    "vertical-slice": "Cada feature é autocontida (domínio, infraestrutura e API juntos). O que é comum a todas fica em shared.",
    layered: "Controladores chamam serviços, que chamam repositórios, que acessam os modelos.",
    "ddd-tactical": "Agregados, entidades, objetos de valor e eventos ficam no domínio; comandos e consultas (CQRS) ficam na aplicação."
  }[state.backendArchitecture];

  const doc = backendStackDoc(state);
  const dirs = getBackendDirs(state.backendArchitecture, state.backendStack).join("\n");
  const fence = "```";

  return `# ${state.projectName}-api

Backend gerado pela ${BRAND.displayName}.

## Stack

- **Linguagem**: ${doc.language}
- **Framework**: ${doc.framework}
- **Arquitetura**: ${archLabel}
- **Testes**: ${doc.tests}${doc.observability ? `\n- **Observabilidade**: ${doc.observability}` : ""}

## Estrutura

${archNote}

Diretórios que o gerador criou:

${fence}
${dirs}
${fence}

## Comandos

${fence}bash
${doc.commands}
${fence}

## Agentes especializados

- **\`@${doc.agent}\`**: implementa código conforme ${archLabel}
- **\`@arch-cross\`**: valida conformidade arquitetural nos gates G1 e G2
- **\`@reviewer\`**: revisa PRs aplicando as rubricas de ${state.backendArchitecture}

Ver [\`docs/adr/0001-arquitetura-referencia-clean-hexagonal.md\`](../../docs/adr/0001-arquitetura-referencia-clean-hexagonal.md) para detalhes.
`;
}

export function buildBackendDockerfile(state: WizardState): string {
  switch (state.backendStack) {
    case "java-spring":
      return `FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
    case "dotnet-core": {
      const ns = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
      return `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/${ns}.API/${ns}.API.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "${ns}.API.dll"]
`;
    }
    case "python-agentic":
    case "python-api":
    default:
      return `FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .
COPY src/ ./src/
EXPOSE 8000
CMD ["python", "-m", "src.main"]
`;
  }
}

export function buildBackendMain(state: WizardState): string {
  // Only used for Python stacks; Java and .NET have dedicated seed files
  const agentic = state.backendStack === "python-agentic";
  return `"""
${state.projectName}${agentic ? " Agentic" : ""} API - Main entry point
Generated by ${BRAND.displayName}
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="${state.projectName}",
    version="0.1.0",
    description="${state.startupIdea || `API gerada pela ${BRAND.displayName}`}"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure conforme necessário
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "0.1.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
`;
}

export function buildPyprojectToml(state: WizardState, agentic: boolean): string {
  const agenticDeps = agentic ? `
    "langgraph>=0.2.0",
    "langchain-core>=0.3.0",
    "langchain-openai>=0.2.0",` : "";
  return `[project]
name = "${state.projectName}"
version = "0.1.0"
description = "${state.startupIdea || `Gerado pela ${BRAND.displayName}`}"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.6.0",${agenticDeps}
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-cov>=6.0.0",
    "ruff>=0.7.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"
python_functions = "test_*"

[tool.ruff]
line-length = 100
target-version = "py312"
`;
}

export function buildPomXml(state: WizardState): string {
  const ns = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
  </parent>

  <groupId>com.example</groupId>
  <artifactId>${state.projectName}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <name>${ns}</name>
  <description>${state.startupIdea || `Gerado pela ${BRAND.displayName}`}</description>

  <properties>
    <java.version>21</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

export function buildDotnetSln(state: WizardState, ns: string): string {
  // Minimal solution file — IDE-compatible but auto-generated
  return `# Gerado pela ${BRAND.displayName}
Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "${ns}.API", "src\\${ns}.API\\${ns}.API.csproj", "{00000000-0000-0000-0000-000000000001}"
EndProject
Global
  GlobalSection(SolutionConfigurationPlatforms) = preSolution
    Debug|Any CPU = Debug|Any CPU
    Release|Any CPU = Release|Any CPU
  EndGlobalSection
EndGlobal
`;
}

export function buildDotnetCsproj(state: WizardState, ns: string): string {
  return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>${ns}</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.*" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.*" />
    <PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.*" />
  </ItemGroup>
</Project>
`;
}

export function buildDotnetProgram(state: WizardState, ns: string): string {
  return `using ${ns};

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/health", () => new { status = "ok", version = "0.1.0" });

app.Run();
`;
}
