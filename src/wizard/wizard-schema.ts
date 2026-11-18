/**
 * wizard-schema — drives todos os steps do wizard de setup agêntico.
 * Cada step é renderizado pelo WizardController sem hardcode de stack.
 * Fluxo: Intro → Identidade → Domínio → Host → Backend → Frontend →
 *         Infra → Deploy → Preview/Generate
 */
import type { WizardStep } from "../types";
import { BRAND } from "../data/brand.pure";

const SCHEMA: readonly WizardStep[] = [
  // ── Step 1: Welcome screen ──────────────────────────────────────────────
  {
    id: 1,
    key: "intro",
    title: `${BRAND.displayName} — Agentic Delivery Platform`,
    description: "Você está prestes a criar uma empresa de software completa com IA.",
    required: false,
    inputType: "intro",
    icon: "🚀",
  },

  // ── Step 2: Project identity ────────────────────────────────────────────
  {
    id: 2,
    key: "projectName",
    title: "Nome do projeto",
    description:
      "Slug em lowercase — será o prefixo de todos os repos, artefatos e serviços gerados (ex: nova-fintech, ai-health-platform, devtools-hub).",
    required: true,
    inputType: "text",
    icon: "icon:accent",
  },

  // ── Step 2: Project idea ─────────────────────────────────────────────────
  {
    id: 3,
    key: "startupIdea",
    title: "Descreva o produto em 1-2 frases",
    description:
      "O agente @business usará isso para gerar o Business Brief e iniciar o ciclo de discovery. Seja objetivo — quanto mais claro, melhor o resultado.",
    required: true,
    inputType: "textarea",
    icon: "icon:idea",
  },

  // ── Step 3: Target directory ─────────────────────────────────────────────
  {
    id: 4,
    key: "targetDirectory",
    title: "Onde criar o projeto?",
    description:
      "Escolha a pasta onde os arquivos serão gerados. Se deixar em branco, será criado na pasta do workspace aberto (se houver) ou no seu diretório home.",
    required: false,
    inputType: "folder",
    icon: "📁",
  },

  // ── Step 4: Domain / Industry ─────────────────────────────────────────────
  {
    id: 5,
    key: "domain",
    title: "Domínio do produto",
    description:
      "Configura o vocabulário do domínio (Ubiquitous Language), os cenários BDD e os agentes especializados instalados.",
    required: true,
    inputType: "cards",
    columns: 4,
    options: [
      { value: "fintech",          label: "FinTech",        description: "Pagamentos, banco digital e investimentos.",  icon: "💳" },
      { value: "healthtech",       label: "HealthTech",     description: "Saúde, telemedicina e bem-estar.",      icon: "icon:health" },
      { value: "edtech",           label: "EdTech",         description: "Educação, cursos e aprendizado.",       icon: "icon:education" },
      { value: "marketplace",      label: "Marketplace",    description: "Plataformas entre empresas, de empresa para cliente ou de pessoa para pessoa.",             icon: "icon:marketplace" },
      { value: "developer-tools",  label: "Dev Tools",      description: "Ferramentas para quem desenvolve.",    icon: "icon:devtools" },
      { value: "ai-native",        label: "AI Native",      description: "Produto centrado em agentes de IA.",   icon: "icon:ai-native" },
      { value: "ecommerce",        label: "E-commerce",     description: "Catálogo, checkout e logística.",       icon: "icon:package" },
      { value: "logistics",        label: "Logística",      description: "Frota, rastreamento e armazém.",            icon: "icon:logistics" },
      { value: "other",            label: "Outro",          description: "Um domínio que não está na lista.",      icon: "◈" },
    ],
  },

  // ── Step 5: AI Host ───────────────────────────────────────────────────────
  {
    id: 6,
    key: "hostAdapter",
    title: "Host de IA",
    description:
      "Define onde os agentes vivem e como você os invoca. Todos geram os mesmos artefatos — a diferença é o ambiente de trabalho.",
    required: true,
    inputType: "cards-icon",
    columns: 2,
    options: [
      {
        value: "copilot",
        label: "GitHub Copilot",
        description: "Para conversar no chat do Copilot, dentro do VS Code. Pede uma licença do GitHub Copilot.",
        icon: "icon:github",
        badge: "VS Code nativo",
      },
      {
        value: "claude",
        label: "Claude Code",
        description: "Para conversar no Claude Code, no terminal ou no VS Code. Pede uma assinatura do Claude.",
        icon: "icon:claude",
      },
      {
        value: "opencode",
        label: "OpenCode",
        description: `Para conversar no OpenCode, no terminal. Lê \`.opencode/\` e a entrada é o agente \`${BRAND.name}\` ou \`/${BRAND.name}\`.`,
        icon: "icon:opencode",
        badge: "Terminal nativo",
      },
    ],
  },

  // ── Step 6: Backend stack ─────────────────────────────────────────────────
  {
    id: 7,
    key: "backendStack",
    title: "Stack do Backend",
    description:
      "Template base para todos os microserviços do projeto. Inclui arquitetura de referência, testes, OpenAPI e agentes especializados.",
    required: true,
    inputType: "cards",
    columns: 2,
    options: [
      { value: "python-agentic", label: "Python Agentic",   description: "LangGraph e PydanticAI: agente primeiro, com vários modelos de linguagem.", icon: "icon:python", badge: "AI Native" },
      { value: "python-api",     label: "Python FastAPI",   description: "Hexagonal, assíncrono, Pydantic v2, SQLAlchemy e pytest.", icon: "icon:fastapi" },
      { value: "java-spring",    label: "Java Spring Boot", description: "Hexagonal, Java 21, virtual threads, Hibernate e JUnit 5.", icon: "icon:spring" },
      { value: "dotnet-core",    label: ".NET 8 Core",      description: "Vertical Slice, nullable refs, EF Core e xUnit.", icon: "icon:dotnet" },
    ],
  },

  // ── Step 7: Backend Architecture ────────────────────────────────────────
  {
    id: 8,
    key: "backendArchitecture",
    title: "Arquitetura do Backend",
    description:
      "Define o padrão arquitetural que os agentes @backend-* e @arch-cross vão aplicar e validar. Cada stack tem um padrão recomendado, mas você pode escolher outro.",
    required: true,
    inputType: "cards",
    columns: 2,
    options: [
      { 
        value: "hexagonal", 
        label: "Clean/Hexagonal", 
        description: "Ports & Adapters: domínio, aplicação e infraestrutura. Combina com Python e Java.", 
        icon: "⬡",
        badge: "Padrão"
      },
      { 
        value: "vertical-slice", 
        label: "Vertical Slice", 
        description: "Funcionalidades autocontidas, com pouco acoplamento. Combina com .NET.", 
        icon: "▥"
      },
      { 
        value: "layered", 
        label: "Layered/N-Tier", 
        description: "Controller, Service e Repository. Tradicional e fácil de aprender.", 
        icon: "≡"
      },
      { 
        value: "ddd-tactical", 
        label: "DDD Tactical", 
        description: "Aggregates, Entities, Value Objects e Domain Events. Para domínios complexos.", 
        icon: "◈"
      },
    ],
  },

  // ── Step 8: Frontend stack ────────────────────────────────────────────────
  {
    id: 9,
    key: "frontendStack",
    title: "Stack do Frontend",
    description:
      "Template do portal ou app. Você pode adicionar mais frontends depois via @sprint-runner.",
    required: false,
    inputType: "cards",
    columns: 3,
    options: [
      { value: "react-vite",      label: "React + Vite",     description: "Feature-sliced, TanStack Query, Zod e Vitest.", icon: "icon:react" },
      { value: "flutter",         label: "Flutter",          description: "Dart 3, Riverpod, freezed e golden tests.", icon: "icon:flutter" },
      { value: "android-compose", label: "Android Compose",  description: "MVVM, Hilt, Coroutines e Compose UI.", icon: "icon:android" },
      { value: "ios-swiftui",     label: "iOS SwiftUI",      description: "Swift 5.9, MVVM, async/await e XCTest.", icon: "icon:swift" },
      { value: "none",            label: "Somente Backend",  description: "Sem frontend por ora. Dá para somar depois.", icon: "⬛" },
    ],
  },

  // ── Step 9: Frontend Architecture ───────────────────────────────────────
  {
    id: 10,
    key: "frontendArchitecture",
    title: "Arquitetura do Frontend",
    description:
      "Define o padrão arquitetural que os agentes @frontend-* vão aplicar. Cada stack mobile/web tem convenções específicas.",
    required: false,  // só obrigatório se tiver frontend
    inputType: "cards",
    columns: 2,
    options: [
      { 
        value: "feature-based",
        label: "Feature-based",
        description: "Co-locação: componentes, hooks e stores por feature. Combina com React.",
        icon: "icon:package",
        badge: "React"
      },
      { 
        value: "clean-frontend", 
        label: "Clean Architecture", 
        description: "Data, Domain e Presentation, com repository pattern. Combina com Flutter.", 
        icon: "⬡"
      },
      { 
        value: "mvvm", 
        label: "MVVM", 
        description: "ViewModel observável. É o padrão do SwiftUI e do Compose.", 
        icon: "⇄",
        badge: "Mobile"
      },
      { 
        value: "mvc", 
        label: "MVC", 
        description: "Model, View e Controller. Tradicional.", 
        icon: "△"
      },
    ],
  },

  // ── Step 10: Database ──────────────────────────────────────────────────────
  {
    id: 11,
    key: "database",
    title: "Banco de dados principal",
    description:
      "Configura o repositório de dados, migrations e testes de integração com Testcontainers.",
    required: false,
    inputType: "cards",
    columns: 3,
    options: [
      { value: "postgresql", label: "PostgreSQL",      description: "ACID, JSONB e busca textual.",       icon: "icon:postgresql", badge: "Padrão" },
      { value: "mysql",      label: "MySQL / MariaDB", description: "ACID e réplicas, com amplo suporte.",        icon: "icon:mysql" },
      { value: "mongodb",    label: "MongoDB",          description: "Documentos, schema flexível e Atlas.",      icon: "icon:mongodb" },
      { value: "sqlite",     label: "SQLite",           description: "Arquivo local, sem infraestrutura. Só para desenvolvimento e teste.",   icon: "icon:sqlite" },
      { value: "none",       label: "Sem banco",        description: "Definir depois, ou usar um banco externo ou embutido.",      icon: "icon:nodb" },
    ],
  },

  // ── Step 11: Cloud ─────────────────────────────────────────────────────────
  {
    id: 12,
    key: "cloud",
    title: "Cloud alvo",
    description:
      "O @devops vai gerar IaC (Terraform/Bicep/Pulumi) e pipelines de deploy para este cloud.",
    required: false,
    inputType: "cards",
    columns: 4,
    options: [
      { value: "gcp",   label: "Google Cloud", description: "Cloud Run, GKE e AlloyDB.",          icon: "icon:gcp" },
      { value: "aws",   label: "AWS",           description: "ECS, EKS, RDS e Lambda.",           icon: "icon:aws" },
      { value: "azure", label: "Azure",         description: "Container Apps, AKS e CosmosDB.",    icon: "icon:azure" },
      { value: "none",  label: "On-prem / TBD", description: "Local ou a definir: Docker Compose, e configurar a nuvem depois.",  icon: "icon:onprem" },
    ],
  },

  // ── Step 12: CI/CD ─────────────────────────────────────────────────────────
  {
    id: 13,
    key: "cicd",
    title: "Pipeline de CI/CD",
    description:
      "Template de pipeline gerado pelo @devops. Inclui lint, testes, build, security scan e deploy.",
    required: false,
    inputType: "cards",
    columns: 2,
    options: [
      { value: "github-actions", label: "GitHub Actions",   description: "YAML nativo do GitHub, com muitas ações prontas.",  icon: "icon:github", badge: "Padrão" },
      { value: "gitlab-ci",      label: "GitLab CI/CD",     description: ".gitlab-ci.yml e runners próprios.",        icon: "icon:gitlab" },
      { value: "jenkins",        label: "Jenkins",           description: "Jenkinsfile, self-hosted, pipeline como código.",                       icon: "icon:jenkins" },
      { value: "none",           label: "Configurar depois", description: "Sem pipeline por ora. Dá para pedir ao agente depois.",                  icon: "icon:cicd-later" },
    ],
  },

  // ── Step 13: Template preview ─────────────────────────────────────────────
  {
    id: 14,
    key: "resolvedTemplate",
    title: "Preview do projeto",
    description:
      "Confira o que será gerado: estrutura de arquivos, agentes, pipelines e serviços.",
    required: false,
    inputType: "preview",
    icon: "🗂",
  },
];

export function getWizardSchema(): Promise<readonly WizardStep[]> {
  return Promise.resolve(SCHEMA);
}

// ── Brownfield schema — instala estrutura agêntica em repo existente ────────

const BROWNFIELD_SCHEMA: readonly WizardStep[] = [
  {
    id: 1,
    key: "targetDirectory",
    title: "Onde fica o workspace?",
    description:
      "Selecione uma pasta VAZIA — não o repositório legado. Os repositórios a analisar são informados no próximo passo e materializados em repos/, sem serem modificados. Um workspace pode mapear vários repositórios.",
    required: true,
    inputType: "folder",
    icon: "📁",
  },
  {
    id: 2,
    key: "hostAdapter",
    title: "Host de IA",
    description:
      `Define onde os agentes ficam: Copilot em .github/agents/, Claude Code em .claude/agents/ e OpenCode em .opencode/agents/. Nos três, a entrada é o agente ${BRAND.participant.name}.`,
    required: true,
    inputType: "cards-icon",
    columns: 2,
    options: [
      {
        value: "copilot",
        label: "GitHub Copilot",
        description: "Para conversar no chat do Copilot, dentro do VS Code. Pede uma licença do GitHub Copilot.",
        icon: "icon:github",
        badge: "VS Code nativo",
      },
      {
        value: "claude",
        label: "Claude Code",
        description: "Para conversar no Claude Code, no terminal ou no VS Code. Pede uma assinatura do Claude.",
        icon: "icon:claude",
        badge: "Terminal nativo",
      },
      {
        value: "opencode",
        label: "OpenCode",
        description: `Para conversar no OpenCode, no terminal. Lê \`.opencode/\` e a entrada é o agente \`${BRAND.name}\` ou \`/${BRAND.name}\`.`,
        icon: "icon:opencode",
        badge: "Terminal nativo",
      },
    ],
  },
  {
    id: 3,
    key: "maturityFrameworks",
    title: "Frameworks de maturidade (opcional)",
    description:
      "Selecione 1+ frameworks que o @maturity-assessor irá aplicar no Discovery. Default: DORA 4 Keys (lightweight). Mid e Heavyweight dão mais profundidade ao custo de mais análise.",
    required: false,
    inputType: "cards-multi",
    columns: 2,
    options: [
      { value: "dora-4keys",        label: "DORA 4 Keys",          description: "Deploy Freq, Lead Time, CFR, MTTR — métricas de entrega.",                          badge: "Lightweight · default" },
      { value: "tech-radar",        label: "Tech Radar",            description: "ThoughtWorks-style: Adopt/Trial/Assess/Hold da stack atual.",                       badge: "Lightweight" },
      { value: "spotify-health",    label: "Spotify Squad Health",  description: "11 cards verde/amarelo/vermelho de saúde do time.",                                 badge: "Lightweight" },
      { value: "dora-capabilities", label: "DORA 24 Capabilities",  description: "Práticas técnicas/processuais/culturais que dirigem as 4 Keys.",                    badge: "Mid" },
      { value: "owasp-samm",        label: "OWASP SAMM",            description: "Maturidade do programa de segurança (15 practices × 3 levels).",                  badge: "Mid · Enterprise" },
      { value: "owasp-asvs",        label: "OWASP ASVS",            description: "Verificação de controles de segurança em aplicação (L1/L2/L3).",                   badge: "Mid" },
      { value: "iso-25010",         label: "ISO/IEC 25010",         description: "Qualidade de produto em 8 características (perf, seg, usability…).",              badge: "Mid" },
      { value: "space-devex",       label: "SPACE DevEx",           description: "Produtividade do dev em 5 dimensões (Satisfaction…Efficiency).",                   badge: "Mid" },
      { value: "cmmi",              label: "CMMI",                  description: "5 níveis de maturidade processual (SEI). Apenas se exigido.",                     badge: "Heavyweight · Enterprise" },
      { value: "bsimm",             label: "BSIMM",                 description: "Benchmark descritivo de segurança (12 practices vs. indust.).",                  badge: "Heavyweight · Enterprise" },
    ],
  },
];

export function getBrownfieldSchema(): Promise<readonly WizardStep[]> {
  return Promise.resolve(BROWNFIELD_SCHEMA);
}
