/**
 * infra.ts
 *
 * Infraestrutura do scaffold greenfield: docker-compose local e pipeline de CI.
 *
 * Funções puras `(estado do Wizard) => texto` (F3.4, passo 3): sem fs, sem
 * relógio. Saíram do StructureGenerator sem mudar um byte do que geram.
 */

import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";

export function buildDockerCompose(state: WizardState): string {
  // Port depends on stack runtime
  const apiPort = state.backendStack === "java-spring" ? 8080
                : state.backendStack === "dotnet-core" ? 5000
                : 8000;

  const dbService = state.database === "postgresql" ? `
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${state.projectName}
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
` : state.database === "mysql" ? `
  mysql:
    image: mysql:8-oracle
    environment:
      MYSQL_DATABASE: ${state.projectName}
      MYSQL_USER: dev
      MYSQL_PASSWORD: dev
      MYSQL_ROOT_PASSWORD: root
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
` : state.database === "mongodb" ? `
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
` : "";

  return `version: "3.9"

services:
  api:
    build:
      context: ../code/services/${state.projectName}-api
      dockerfile: Dockerfile
    ports:
      - "${apiPort}:${apiPort}"
    environment:
      - ENV=local
    ${state.database !== "none" && state.database !== "sqlite" ? "depends_on:\n      - " + (state.database === "postgresql" ? "postgres" : state.database === "mysql" ? "mysql" : "mongodb") : ""}
${dbService}
${state.database !== "none" && state.database !== "sqlite" ? `
volumes:
  ${state.database === "postgresql" ? "postgres_data:" : state.database === "mysql" ? "mysql_data:" : "mongo_data:"}
` : ""}`;
}

export function buildCIPipeline(state: WizardState): string {
  const svcDir = `code/services/${state.projectName}-api`;
  let testSteps: string;

  switch (state.backendStack) {
    case "java-spring":
      testSteps = `
      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
          cache: maven

      - name: Run tests
        run: cd ${svcDir} && mvn -B verify

      - name: Build JAR
        run: cd ${svcDir} && mvn -B package -DskipTests`;
      break;

    case "dotnet-core": {
      const ns = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
      testSteps = `
      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Restore dependencies
        run: cd ${svcDir} && dotnet restore

      - name: Run tests
        run: cd ${svcDir} && dotnet test --no-restore --logger trx

      - name: Build
        run: cd ${svcDir} && dotnet publish src/${ns}.API/${ns}.API.csproj -c Release -o publish`;
      break;
    }

    case "python-agentic":
    case "python-api":
    default:
      testSteps = `
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: cd ${svcDir} && pip install -e .[dev]

      - name: Run tests
        run: cd ${svcDir} && pytest --cov

      - name: Lint
        run: cd ${svcDir} && ruff check src/ tests/`;
      break;
  }

  return `name: CI — ${state.projectName}
# Gerado pela ${BRAND.displayName}

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${testSteps}

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t ${state.projectName}:latest ${svcDir}

# Este pipeline será expandido pelo @devops durante configuração de CI/CD
`;
}
