---
id: pipeline-adapter
name: pipeline-adapter
type: skill
description: >
  Padrão Port & Adapter para pipelines de CI/CD e IaC. Permite ao @devops
  gerar pipelines para GitHub Actions, Azure DevOps ou GitLab CI sem acoplamento
  a um único provedor. Define estrutura canônica de stages, jobs e IaC (Terraform).
applicable_to:
  - "@devops — geração e manutenção de pipelines e infraestrutura"
inputs:
  - code/**
  - api/openapi.yaml
  - helyx.config.yaml
outputs:
  - pipelines/**
  - infrastructure/**
---

# Skill: pipeline-adapter

> Pipeline sem adapter vira lock-in. Mude o provedor mudando uma linha de config.

---

## 1. Arquitetura Port & Adapter para CI/CD

```
pipelines/
  core/
    stages.yaml       ← definição agnóstica de estágios (o Port)
  adapters/
    github-actions/   ← implementação para GitHub Actions (o Adapter)
    azure-devops/     ← implementação para Azure DevOps
    gitlab-ci/        ← implementação para GitLab CI
  README.md           ← qual adapter está ativo + como trocar
```

O `stages.yaml` é a fonte de verdade. Os adapters traduzem para a sintaxe do provedor.

### stages.yaml — contrato agnóstico

```yaml
# pipelines/core/stages.yaml
version: 1
provider: github-actions   # github-actions | azure-devops | gitlab-ci

stages:
  - id: validate
    description: "Lint, type check, static analysis"
    runs_on: ubuntu-latest
    steps: [lint, type-check, security-scan]
    fail_fast: true

  - id: test
    description: "Unit + integration tests"
    runs_on: ubuntu-latest
    steps: [unit-tests, integration-tests]
    requires: [validate]
    services: [postgres, redis]   # Testcontainers ou services nativos

  - id: build
    description: "Build Docker image + push to registry"
    runs_on: ubuntu-latest
    steps: [docker-build, docker-push]
    requires: [test]
    env:
      REGISTRY: ghcr.io/<org>/<repo>

  - id: deploy-staging
    description: "Deploy para staging"
    runs_on: ubuntu-latest
    steps: [terraform-plan, terraform-apply]
    requires: [build]
    environment: staging
    approval: false

  - id: deploy-prod
    description: "Deploy para produção"
    runs_on: ubuntu-latest
    steps: [terraform-plan, terraform-apply]
    requires: [deploy-staging]
    environment: production
    approval: true   # gate humano obrigatório
```

---

## 2. Adapter — GitHub Actions

Caminho: `pipelines/adapters/github-actions/`

### Estrutura gerada

```
.github/workflows/
  ci.yml          ← validate + test (todo PR)
  cd-staging.yml  ← build + deploy-staging (merge p/ main)
  cd-prod.yml     ← deploy-prod (tag semver)
```

### ci.yml — template

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5       # ou setup-node, setup-java, etc.
        with:
          python-version: "3.12"
          cache: "pip"
      - name: Install deps
        run: pip install -e ".[dev]"
      - name: Lint
        run: ruff check .
      - name: Type check
        run: mypy .
      - name: Security scan
        run: pip-audit

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: validate
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - name: Install deps
        run: pip install -e ".[dev]"
      - name: Tests
        run: pytest --cov --cov-report=xml
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost:5432/test
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

### Boas práticas GitHub Actions
- `actions/checkout@v4` — sempre versão fixada (não `@main`)
- `permissions:` — mínimo necessário (principle of least privilege)
- Secrets via `${{ secrets.XXX }}` — nunca hardcoded
- Cache de dependências (`cache: "pip"` / `cache: "npm"`) — obrigatório
- `timeout-minutes: 15` em jobs de teste para evitar runners travados

---

## 3. Adapter — Azure DevOps

Caminho: `pipelines/adapters/azure-devops/`

### azure-pipelines.yml — template equivalente

```yaml
trigger:
  branches:
    include: [main]
  paths:
    exclude: [docs/]

pr:
  branches:
    include: [main, develop]

pool:
  vmImage: ubuntu-latest

stages:
  - stage: Validate
    jobs:
      - job: Lint
        steps:
          - task: UsePythonVersion@0
            inputs:
              versionSpec: "3.12"
          - script: pip install -e ".[dev]" && ruff check . && mypy .
            displayName: Lint & Type Check

  - stage: Test
    dependsOn: Validate
    jobs:
      - job: Tests
        services:
          postgres:
            image: postgres:16-alpine
            env:
              POSTGRES_PASSWORD: test
            ports: "5432:5432"
        steps:
          - script: pytest --cov
            env:
              DATABASE_URL: $(DATABASE_URL)

  - stage: Build
    dependsOn: Test
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - job: DockerBuild
        steps:
          - task: Docker@2
            inputs:
              command: buildAndPush
              repository: $(IMAGE_REPO)
              dockerfile: Dockerfile
```

---

## 4. Adapter — GitLab CI

Caminho: `pipelines/adapters/gitlab-ci/`

### .gitlab-ci.yml — template

```yaml
stages:
  - validate
  - test
  - build
  - deploy

variables:
  PYTHON_VERSION: "3.12"
  DOCKER_DRIVER: overlay2

lint:
  stage: validate
  image: python:$PYTHON_VERSION-slim
  cache:
    paths: [.venv/]
  script:
    - pip install -e ".[dev]"
    - ruff check .
    - mypy .

test:
  stage: test
  image: python:$PYTHON_VERSION-slim
  services:
    - postgres:16-alpine
  variables:
    POSTGRES_PASSWORD: test
    DATABASE_URL: postgresql+asyncpg://postgres:test@postgres:5432/test
  script:
    - pip install -e ".[dev]"
    - pytest --cov

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only: [main]
```

---

## 5. IaC — Terraform (padrão)

Estrutura canônica:

```
infrastructure/
  terraform/
    main.tf          ← provider + backend state
    variables.tf     ← todas as variáveis com description obrigatório
    outputs.tf       ← outputs explícitos
    modules/
      networking/    ← VPC, subnets
      compute/       ← containers / VMs
      database/      ← RDS / Cloud SQL
      storage/       ← GCS / S3
```

### Regras de IaC
- `terraform validate` + `terraform plan` no CI — obrigatório antes de apply
- State remoto (GCS bucket / S3 / Terraform Cloud) — nunca state local em equipe
- `terraform.tfvars` no `.gitignore` — valores sensíveis via env var ou secrets manager
- Módulos com `version` fixada: `source = "terraform-aws-modules/vpc/aws" version = "5.1.2"`
- Destroy em produção requer `approval: true` no pipeline

### Checklist de hardening de IaC
- [ ] Sem credenciais em `.tf` files
- [ ] SGs/NSGs com regras mínimas (sem `0.0.0.0/0` exceto load balancer)
- [ ] Logs de auditoria habilitados (CloudTrail / Cloud Audit Logs)
- [ ] Backups automáticos em databases
- [ ] Imagens Docker com `HEALTHCHECK` definido

---

## 6. Como trocar de provedor

1. Editar `pipelines/core/stages.yaml`: mudar `provider: <novo>`
2. Copiar o adapter correspondente para `pipelines/adapters/<novo>/`
3. Adaptar variáveis de ambiente e secrets para o novo provedor
4. Testar em branch de feature antes de remover o adapter antigo
5. Atualizar `pipelines/README.md` com o novo provedor ativo
