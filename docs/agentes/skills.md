<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# Skills do kit

As 55 skills que o kit instala. Uma skill é um pacote de conhecimento que um agente só carrega quando o frontmatter dele a declara em `uses_skills`. Volta ao [índice dos agentes](README.md).

## Arquitetura (`arch-*`)

### `arch-clean-frontend`

Clean Architecture para frontend — Data/Domain/Presentation em camadas com inversão de dependência. Flutter, iOS, Android, React. Agnóstica de framework.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@frontend-flutter](frontend-flutter.md).
- Indicada para: `@frontend-flutter`, `@frontend-ios`, `@frontend-android`, `@frontend-react`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-clean-frontend/SKILL.md`

### `arch-ddd-tactical`

DDD Tático — Aggregate Root, Entity, Value Object, Domain Event, Repository por aggregate, Domain Service. Aplicável a qualquer stack backend.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@backend-python-api`, `@backend-java`, `@backend-dotnet`, `@domain-modeler`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-ddd-tactical/SKILL.md`

### `arch-diagrams-drawio`

Padrões canônicos para gerar diagramas de arquitetura no formato Draw.io XML (.drawio) — C4 (níveis 1-3) e diagramas de sequência UML. Consumida por @architecture e @arch-discoverer.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@architecture](architecture.md).
- Indicada para: `@architecture`, `@arch-discoverer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-diagrams-drawio/SKILL.md`

### `arch-diagrams-likec4`

Gera arquivos DSL LikeC4 (workspace.c4 + views.c4) derivados dos artefatos C4 do @arch-discoverer. Arquitetura viva, navegável e versionada.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@arch-discoverer`.
- Fonte: `kit/content/skills/arch-diagrams-likec4/SKILL.md`

### `arch-feature-based`

Arquitetura Feature-Based para frontend — co-localização por feature, shared/ com regras estritas, sem camadas horizontais globais. React, Flutter, qualquer stack frontend.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@frontend-react](frontend-react.md).
- Indicada para: `@frontend-react`, `@frontend-flutter`, `@frontend-android`, `@frontend-ios`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-feature-based/SKILL.md`

### `arch-hexagonal`

Arquitetura Hexagonal (Ports & Adapters) — estrutura de pastas, regras de dependência, adaptadores e fitness functions. Agnóstica de linguagem.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md).
- Indicada para: `@backend-python-api`, `@backend-java`, `@backend-dotnet`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-hexagonal/SKILL.md`

### `arch-layered`

Arquitetura em Camadas (Layered) — Controller → Service → Repository. Simples e pragmática para CRUD. Agnóstica de linguagem.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@backend-python-api`, `@backend-java`, `@backend-dotnet`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-layered/SKILL.md`

### `arch-mvc`

MVC (Model-View-Controller) — separação clássica de responsabilidades. Adequado para apps simples ou mobile com navegação baseada em controllers. iOS UIKit, Android clássico.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@frontend-ios`, `@frontend-android`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-mvc/SKILL.md`

### `arch-mvvm`

MVVM com Unidirectional Data Flow (UDF) — Model, ViewModel, View com fluxo unidirecional de estado. SwiftUI, Jetpack Compose, React, Flutter.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@frontend-android](frontend-android.md), [@frontend-ios](frontend-ios.md).
- Indicada para: `@frontend-ios`, `@frontend-android`, `@frontend-react`, `@frontend-flutter`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-mvvm/SKILL.md`

### `arch-pattern-detection`

Heurísticas para inferir padrões arquiteturais (Hexagonal, Layered, DDD-tactical, MVC, MVVM, Feature-based, Vertical Slice, Clean-frontend) a partir de estrutura de pastas, nomes e imports. Não impõe — descobre. Usada por @arch-discoverer.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@arch-discoverer`.
- Fonte: `kit/content/skills/arch-pattern-detection/SKILL.md`

### `arch-vertical-slice`

Arquitetura Vertical Slice — features auto-contidas, MediatR pipeline, sem camadas horizontais globais. Foco em .NET, aplicável a qualquer stack.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md).
- Indicada para: `@backend-dotnet`, `@backend-python-api`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/arch-vertical-slice/SKILL.md`

## Linguagem e stack (`lang-*`)

### `lang-android`

Boas práticas de Kotlin + Jetpack Compose + Android — MVVM/UDF, Hilt, Coroutines, Flow, testes e performance. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@frontend-android](frontend-android.md).
- Indicada para: `@frontend-android`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-android/SKILL.md`

### `lang-dotnet`

Boas práticas da linguagem C# / .NET 8+ — idiomas modernos, nullable refs, async/await, DI, testes e observabilidade. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@backend-dotnet](backend-dotnet.md).
- Indicada para: `@backend-dotnet`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-dotnet/SKILL.md`

### `lang-flutter`

Boas práticas de Dart 3 + Flutter — null-safety, freezed, gerenciamento de estado, testes e performance. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@frontend-flutter](frontend-flutter.md).
- Indicada para: `@frontend-flutter`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-flutter/SKILL.md`

### `lang-ios`

Boas práticas de Swift 5.9+ + SwiftUI — Swift Concurrency, @Observable, TCA/MVVM, testes e performance. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@frontend-ios](frontend-ios.md).
- Indicada para: `@frontend-ios`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-ios/SKILL.md`

### `lang-java-spring`

Boas práticas da linguagem Java 21 com Spring Boot 3.x — idiomas modernos, DI, async, testes e observabilidade. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@backend-java](backend-java.md).
- Indicada para: `@backend-java`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-java-spring/SKILL.md`

### `lang-python-agentic`

Boas práticas para Python Agentic — LangGraph/PydanticAI, LLM routing, prompts versionados, eval harness, streaming, tool use e observabilidade de agentes.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@backend-python-agentic](backend-python-agentic.md).
- Indicada para: `@backend-python-agentic`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-python-agentic/SKILL.md`

### `lang-python-api`

Boas práticas da linguagem Python para APIs com FastAPI — idiomas, bibliotecas canônicas, naming, testes e observabilidade. Independente do padrão arquitetural.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@backend-python-api](backend-python-api.md).
- Indicada para: `@backend-python-api`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-python-api/SKILL.md`

### `lang-react`

Boas práticas de React + Vite + TypeScript — idiomas, componentes, estado, forms, testes e performance. Independente do padrão arquitetural de pastas.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@frontend-react](frontend-react.md).
- Indicada para: `@frontend-react`, `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/lang-react/SKILL.md`

## Maturidade do projeto (`maturity-*`)

### `maturity-bsimm`

BSIMM (Building Security In Maturity Model) — modelo descritivo (não prescritivo) baseado em observação de práticas em empresas reais. 12 practices × 4 domains. Tier: Heavyweight (Enterprise).

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-bsimm/SKILL.md`

### `maturity-cmmi`

CMMI (Capability Maturity Model Integration) — 5 níveis de maturidade processual, originalmente do SEI. Tier: Heavyweight (Enterprise/regulado). Avaliação leve baseada em evidência de processo.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-cmmi/SKILL.md`

### `maturity-dora-4keys`

DORA Four Keys — métricas canônicas de performance de entrega (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR). Tier: Lightweight. Coleta automatizada via git + CI/CD logs.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-dora-4keys/SKILL.md`

### `maturity-dora-capabilities`

DORA 24 Capabilities — práticas técnicas, processuais e culturais que dirigem as 4 Keys. Tier: Mid. Self-assessment estruturado com evidência.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-dora-capabilities/SKILL.md`

### `maturity-iso-25010`

ISO/IEC 25010:2011 — Qualidade de produto de software em 8 características × 31 sub-características. Tier: Mid. Avaliação técnica formal.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-iso-25010/SKILL.md`

### `maturity-owasp-asvs`

OWASP ASVS (Application Security Verification Standard) v4 — checklist de verificação de controles de segurança em aplicação, com 3 níveis (L1 opportunistic, L2 standard, L3 advanced). Tier: Mid.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`, `@security-auditor`.
- Fonte: `kit/content/skills/maturity-owasp-asvs/SKILL.md`

### `maturity-owasp-samm`

OWASP SAMM (Software Assurance Maturity Model) v2.0 — 5 business functions × 3 security practices × 3 maturity levels. Tier: Mid (Enterprise-value).

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-owasp-samm/SKILL.md`

### `maturity-space-devex`

SPACE Framework (Forsgren, Storey, Maddila, Zimmermann, Houck — Microsoft Research 2021) — produtividade de devs em 5 dimensões: Satisfaction, Performance, Activity, Communication, Efficiency. Tier: Mid.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-space-devex/SKILL.md`

### `maturity-spotify-health`

Spotify Squad Health Check Model — auto-avaliação leve de saúde do time em 11 dimensões com semáforo verde/amarelo/vermelho + trend. Tier: Lightweight.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-spotify-health/SKILL.md`

### `maturity-tech-radar`

ThoughtWorks-style Technology Radar — classificação de tech/práticas em 4 rings (Adopt/Trial/Assess/Hold) × 4 quadrants (Techniques/Tools/Platforms/ Languages-Frameworks). Tier: Lightweight.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@maturity-assessor](maturity-assessor.md).
- Indicada para: `@maturity-assessor`.
- Fonte: `kit/content/skills/maturity-tech-radar/SKILL.md`

## Método, qualidade e operação

### `ai-agent-author`

Padrão canônico para escrever agentes de IA dentro do kit e nos projetos gerados (especialmente Python Agentic). Define frontmatter, estrutura, exit_contract, guard_rails, observability e eval.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@backend-python-agentic](backend-python-agentic.md).
- Indicada para: `Criação de novos agentes para o kit (<host-dir>/agents/** — .github no Copilot, .claude no Claude)`, `Implementação de agentes em projetos cliente (stack: backend-python-agentic)`, `Refactor de agentes existentes para o padrão`.
- Fonte: `kit/content/skills/ai-agent-author/SKILL.md`

### `bdd-gherkin`

Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona. Consumida por @bdd (escreve) e @qa-tester (implementa step defs).

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@bdd](bdd.md), [@feature-adder](feature-adder.md), [@qa-tester](qa-tester.md), [@stream-align](stream-align.md), [@test-backfill-agent](test-backfill-agent.md).
- Indicada para: `@bdd (autoria)`, `@qa-tester (step definitions)`, `@stream-align (rubrica de cobertura)`.
- Fonte: `kit/content/skills/bdd-gherkin/SKILL.md`

### `characterization-testing`

Testes de caracterização (Michael Feathers — Working Effectively with Legacy Code) — pinam o comportamento atual do sistema, mesmo se estiver errado, antes de qualquer refactor. Golden master, approval tests, snapshot. Usada por @test-backfill-agent.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@test-backfill-agent](test-backfill-agent.md), [@test-coverage-mapper](test-coverage-mapper.md).
- Indicada para: `@test-backfill-agent`, `@refactor-agent`.
- Fonte: `kit/content/skills/characterization-testing/SKILL.md`

### `code-quality-audit`

Métricas objetivas para auditar qualidade de código existente: complexidade ciclomática, hotspots (churn × complexidade), god classes, duplicação, dead code. Estilo Adam Tornhill (Code as a Crime Scene). Usada por @quality-auditor.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@quality-auditor](quality-auditor.md).
- Indicada para: `@quality-auditor`.
- Fonte: `kit/content/skills/code-quality-audit/SKILL.md`

### `codebase-enrichment`

Protocolo de exploração do codebase antes de qualquer execução de task. Agentes não devem implementar código sem entender o que já existe no projeto: estrutura, padrões, dependências, testes existentes e arquivos que serão tocados. Resolve a "cegueira de codebase" — o agente entende o projeto real, não só os artefatos.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-discoverer](arch-discoverer.md), [@assessor](assessor.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md), [@business-archeologist](business-archeologist.md), [@coding-archaeologist](coding-archaeologist.md), [@debt-analyst](debt-analyst.md), [@dependency-mapper](dependency-mapper.md), [@design-archaeologist](design-archaeologist.md), [@domain-extractor](domain-extractor.md), [@feature-adder](feature-adder.md), [@frontend-android](frontend-android.md), [@frontend-flutter](frontend-flutter.md), [@frontend-ios](frontend-ios.md), [@frontend-react](frontend-react.md), [@quality-auditor](quality-auditor.md), [@security-auditor](security-auditor.md), [@tech-mapper](tech-mapper.md), [@test-coverage-mapper](test-coverage-mapper.md).
- Indicada para: `Todos os agentes downstream de build: backend-*, frontend-*`.
- Fonte: `kit/content/skills/codebase-enrichment/SKILL.md`

### `coding-guidelines`

Índice de diretrizes de código do kit. Mapeia (stack, arch) → [lang-*, arch-*]. Contém também princípios universais transversais (naming, error model, observabilidade, segurança). Consumida por @reviewer e @arch-cross como guia de revisão cross-stack.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-cross](arch-cross.md), [@assessor](assessor.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md), [@coding-archaeologist](coding-archaeologist.md), [@debt-analyst](debt-analyst.md), [@feature-adder](feature-adder.md), [@frontend-android](frontend-android.md), [@frontend-flutter](frontend-flutter.md), [@frontend-ios](frontend-ios.md), [@frontend-react](frontend-react.md), [@quality-auditor](quality-auditor.md), [@refactor-agent](refactor-agent.md), [@reviewer](reviewer.md).
- Indicada para: `@reviewer`, `@arch-cross`.
- Fonte: `kit/content/skills/coding-guidelines/SKILL.md`

### `commit-assistant`

Conventional Commits, Semantic Versioning e Release Notes para o @release. Define as regras de bump de versão, formato de commits, geração de tag e estrutura das release notes publicadas.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@feature-adder](feature-adder.md), [@migration-agent](migration-agent.md), [@refactor-agent](refactor-agent.md), [@release](release.md).
- Indicada para: `@release — criação de tag semver, release notes e publicação de artefato`.
- Fonte: `kit/content/skills/commit-assistant/SKILL.md`

### `docs-writer`

Padrões de escrita de documentação. Cobre ADRs, CHANGELOG, PRDs, feature-list e documentação geral. Garante consistência e rastreabilidade entre artefatos. Usada por @docs, @product e @business.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@adr-recorder](adr-recorder.md), [@business](business.md), [@business-archeologist](business-archeologist.md), [@docs](docs.md), [@product](product.md).
- Indicada para: `@docs    — ADRs, CHANGELOG, docs técnicos sob demanda`, `@product — prd.md, feature-list.md`, `@business— business-brief.md`.
- Fonte: `kit/content/skills/docs-writer/SKILL.md`

### `domain-driven-design`

Padrão profundo de DDD aplicado no kit — Strategic (Bounded Contexts, Context Map, Ubiquitous Language) + Tactical (Aggregate, Entity, VO, Domain Event, Repository, Domain Service). Define artefatos canônicos em `docs/domain/` consumidos por @domain-modeler, @architecture, @bdd e @backend-*.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-cross](arch-cross.md), [@architecture](architecture.md), [@assessor](assessor.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-api](backend-python-api.md), [@bdd](bdd.md), [@business-archeologist](business-archeologist.md), [@domain-extractor](domain-extractor.md), [@domain-modeler](domain-modeler.md).
- Indicada para: `@domain-modeler`, `@architecture (consome Context Map para definir serviços/OpenAPI)`, `@bdd (usa Ubiquitous Language nos cenários)`, `@backend-* (implementa agregados/eventos)`.
- Fonte: `kit/content/skills/domain-driven-design/SKILL.md`

### `domain-extraction-from-code`

Engenharia reversa de domínio. Extrai bounded contexts, aggregates e linguagem ubíqua a partir do código existente (entities, services, schemas DB, rotas). Usada por @domain-extractor.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@domain-extractor](domain-extractor.md).
- Indicada para: `@domain-extractor`.
- Fonte: `kit/content/skills/domain-extraction-from-code/SKILL.md`

### `integration-testing`

Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes. Consumida por @integration-tests e @backend-*.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@arch-cross](arch-cross.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-api](backend-python-api.md), [@integration-tests](integration-tests.md), [@test-backfill-agent](test-backfill-agent.md).
- Indicada para: `@integration-tests`, `@backend-* (testes integrados do próprio serviço)`, `@arch-cross (rubricas de contract no gate)`.
- Fonte: `kit/content/skills/integration-testing/SKILL.md`

### `legacy-modernization-patterns`

Padrões canônicos para modernizar sistemas legados de forma incremental e reversível: Strangler Fig, Branch by Abstraction, Anti-Corruption Layer, Parallel Run, Expand-Contract. Filosofia: nunca big bang. Usada por @modernization-planner, @migration-agent, @refactor-agent.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@dependency-mapper](dependency-mapper.md), [@modernization-planner](modernization-planner.md).
- Indicada para: `@modernization-planner`, `@migration-agent`, `@refactor-agent`.
- Fonte: `kit/content/skills/legacy-modernization-patterns/SKILL.md`

### `openapi-governance`

Padrões e governança para contratos OpenAPI — versionamento, lint, breaking change detection, geração de SDK, modelos C4 (4 níveis) e diagramas de sequência.

- Edições do kit: projeto novo (greenfield).
- Usada por: [@arch-cross](arch-cross.md), [@architecture](architecture.md), [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md), [@frontend-react](frontend-react.md).
- Indicada para: `@architecture`, `@arch-cross`, `@backend-*`, `@reviewer`.
- Fonte: `kit/content/skills/openapi-governance/SKILL.md`

### `pipeline-adapter`

Padrão Port & Adapter para pipelines de CI/CD e IaC. Permite ao @devops gerar pipelines para GitHub Actions, Azure DevOps ou GitLab CI sem acoplamento a um único provedor. Define estrutura canônica de stages, jobs e IaC (Terraform).

- Edições do kit: projeto novo (greenfield).
- Usada por: [@devops](devops.md).
- Indicada para: `@devops — geração e manutenção de pipelines e infraestrutura`.
- Fonte: `kit/content/skills/pipeline-adapter/SKILL.md`

### `qa-strategy`

Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing. Consumida por @qa-tester, @quality, @reviewer.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md), [@feature-adder](feature-adder.md), [@frontend-android](frontend-android.md), [@frontend-flutter](frontend-flutter.md), [@frontend-ios](frontend-ios.md), [@frontend-react](frontend-react.md), [@integration-tests](integration-tests.md), [@qa-tester](qa-tester.md), [@quality](quality.md), [@reviewer](reviewer.md), [@test-backfill-agent](test-backfill-agent.md), [@test-coverage-mapper](test-coverage-mapper.md).
- Indicada para: `@qa-tester`, `@quality`, `@reviewer`, `@integration-tests`.
- Fonte: `kit/content/skills/qa-strategy/SKILL.md`

### `safe-refactoring-recipes`

Catálogo de receitas de refactoring (Fowler — Refactoring 2nd ed.) com protocolo test-first. Cada receita: motivação, mecânica passo-a-passo, rollback. Aplicável a qualquer linguagem. Usada por @refactor-agent.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@migration-agent](migration-agent.md), [@refactor-agent](refactor-agent.md).
- Indicada para: `@refactor-agent`, `@migration-agent`.
- Fonte: `kit/content/skills/safe-refactoring-recipes/SKILL.md`

### `security-best-practices`

Padrões de segurança aplicados por @security e @devops. Cobre OWASP Top 10, detecção de secrets, threat modeling e checklist de hardening. Produz relatório estruturado em .github/artifacts/security/.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@devops](devops.md), [@incident](incident.md), [@observability](observability.md), [@security](security.md), [@security-auditor](security-auditor.md).
- Indicada para: `@security — scan completo antes de aprovar PR ou release`, `@devops   — hardening de pipelines e infra antes do gate G2`.
- Fonte: `kit/content/skills/security-best-practices/SKILL.md`

### `security-cve-checker`

Auditoria de CVEs em dependências. Triagem por severidade, decisão de fix vs. accept-risk, geração de PRs de patch. Usada por @security (scan pontual) e @sustain (monitoramento contínuo).

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@migration-agent](migration-agent.md), [@security](security.md), [@security-auditor](security-auditor.md), [@sustain](sustain.md), [@tech-mapper](tech-mapper.md).
- Indicada para: `@security — scan de CVEs antes de aprovar PR ou release`, `@sustain  — monitoramento contínuo e PRs de patch automático`.
- Fonte: `kit/content/skills/security-cve-checker/SKILL.md`

### `task-manager`

Gerenciamento de tarefas de sprint. Define o schema canônico do sprint-backlog.yaml, ciclo de vida de status, DoR/DoD, sizing e o protocolo de dispatch do sprint-runner. Resolve o problema de backlog malformado e execução sem rastreabilidade.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@modernization-planner](modernization-planner.md), [@risk-prioritizer](risk-prioritizer.md), [@sprint-planner](sprint-planner.md), [@sprint-runner](sprint-runner.md).
- Indicada para: `@sprint-planner — para estruturar e validar o sprint-backlog.yaml`, `@sprint-runner  — para despachar, rastrear e encerrar tarefas da sprint`.
- Fonte: `kit/content/skills/task-manager/SKILL.md`

### `tech-debt-mapping`

Inventário e priorização de dívida técnica usando o framework de Martin Fowler (prudent/reckless × deliberate/inadvertent) e estimativa de juros. Usada por @debt-analyst e @modernization-planner.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@debt-analyst](debt-analyst.md), [@modernization-planner](modernization-planner.md), [@risk-prioritizer](risk-prioritizer.md).
- Indicada para: `@debt-analyst`, `@modernization-planner`.
- Fonte: `kit/content/skills/tech-debt-mapping/SKILL.md`

### `tech-stack-detection`

Heurísticas para detectar a stack tecnológica real de um projeto brownfield a partir de manifests e lock files. Garante que versões reportadas sejam as em uso (lock), não as declaradas. Usada por @tech-mapper.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@tech-mapper](tech-mapper.md).
- Indicada para: `@tech-mapper`.
- Fonte: `kit/content/skills/tech-stack-detection/SKILL.md`

### `ui-ux-design-system`

Padrão canônico de UI/UX para agentes @frontend-*. Define design tokens, grid, catálogo de componentes, motion/loaders, iconografia e A11y de forma agnóstica de framework. Não escolhe stack de styling (isso é ADR).

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@design-archaeologist](design-archaeologist.md), [@frontend-android](frontend-android.md), [@frontend-flutter](frontend-flutter.md), [@frontend-ios](frontend-ios.md), [@frontend-react](frontend-react.md), [@ux-designer](ux-designer.md).
- Indicada para: `Implementação de UIs em projetos gerados pelos templates frontend`, `Redesigns de portais/aplicações em React, Flutter, Compose, SwiftUI`, `Revisão visual por @reviewer e @quality`.
- Fonte: `kit/content/skills/ui-ux-design-system/SKILL.md`

### `ux-prototyping`

Metodologia para criar protótipos HTML navegáveis e wireframes ASCII a partir de fluxos de usuário — sem framework JS. Produz artefatos validáveis por stakeholder antes do downstream. Consumida por @ux-designer.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@ux-designer](ux-designer.md).
- Indicada para: `Fase UX Design (upstream) em qualquer stack de frontend`, `Validação de fluxo com stakeholder antes de codificar`, `Geração de user-flows.md, wireframes e prototype/`.
- Fonte: `kit/content/skills/ux-prototyping/SKILL.md`

### `version-migration-playbook`

Playbook de upgrades de versão major em runtimes/frameworks comuns: Java 8→21, Spring Boot 2→3, Python 2→3, Node 14→20, .NET Framework→.NET 8, React classes→hooks. Sempre via Expand-Contract + characterization tests. Usada por @migration-agent.

- Edições do kit: projeto existente (brownfield).
- Usada por: [@migration-agent](migration-agent.md).
- Indicada para: `@migration-agent`, `@modernization-planner`.
- Fonte: `kit/content/skills/version-migration-playbook/SKILL.md`

### `workflow-memory`

Sistema de memória cross-task para agentes downstream. Persiste contexto entre runs — decisões arquiteturais, padrões descobertos, erros encontrados e handoffs. Resolve o problema de amnésia entre execuções: cada agente começa informado, não do zero.

- Edições do kit: projeto novo (greenfield) e projeto existente (brownfield).
- Usada por: [@backend-dotnet](backend-dotnet.md), [@backend-java](backend-java.md), [@backend-python-agentic](backend-python-agentic.md), [@backend-python-api](backend-python-api.md), [@feature-adder](feature-adder.md), [@frontend-android](frontend-android.md), [@frontend-flutter](frontend-flutter.md), [@frontend-ios](frontend-ios.md), [@frontend-react](frontend-react.md), [@migration-agent](migration-agent.md), [@refactor-agent](refactor-agent.md), [@reviewer](reviewer.md), [@sprint-runner](sprint-runner.md).
- Indicada para: `Todos os agentes downstream de build: backend-*, frontend-*`, `@sprint-runner (inicializa e monitora compactação)`, `@reviewer (registra achados para próxima iteração)`.
- Fonte: `kit/content/skills/workflow-memory/SKILL.md`

### `workspace-tools`

Padrões operacionais para agentes manipularem o workspace com segurança — criação, edição, deleção e reorganização de arquivos; operações de terminal; convenções de estrutura de diretórios do workspace.

- Edições do kit: projeto novo (greenfield).
- Usada por: nenhum agente declara esta skill em `uses_skills`.
- Indicada para: `Qualquer agente que precise criar/mover/deletar arquivos no workspace`, `Operações de limpeza e reorganização de artefatos`, `Geração de scripts de setup/automação`, `Ações que afetam o filesystem além de simples edições de código`.
- Fonte: `kit/content/skills/workspace-tools/SKILL.md`
