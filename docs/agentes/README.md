<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# Catálogo de agentes e skills

Os 50 agentes e as 55 skills que o kit da Jataí instala, lidos do frontmatter de `kit/`. Cada agente tem uma ficha com o que faz, quando entra, as skills que carrega, o que recebe e o que produz.

Você nunca chama um agente especialista direto: a conversa começa no orquestrador, que valida os pré-requisitos e roteia. As fichas existem para você saber o que esperar de cada um.

As edições do kit:

- **greenfield**: projeto novo (greenfield).
- **brownfield**: projeto existente (brownfield).

## Ponto de entrada

O agente que você chama. Ele valida os pré-requisitos de cada fase e roteia para os outros; nunca executa trabalho de fase.

| Agente | O que faz | Edições |
|---|---|---|
| [@jatai](jatai.md) | Jataí Brownfield — único ponto de entrada para projetos existentes. | as duas |

## Descoberta (`discovery`)

Só lê. Nenhum agente desta etapa muda código, dependência ou configuração; o gate D1 fecha a etapa.

| Agente | O que faz | Edições |
|---|---|---|
| [@arch-discoverer](arch-discoverer.md) | Discovery: infere o padrão arquitetural real de um repositório e produz a análise C4 (L1 a L3) com diagrama em draw.io ou LikeC4. | brownfield |
| [@assessor](assessor.md) | Coordenador do Foundation (Discovery): inventaria os repositórios e conduz os sub-agentes passo a passo, com validação humana após cada um, até o gate D1. | brownfield |
| [@business-archeologist](business-archeologist.md) | Discovery: engenharia reversa do negócio implícito no código e nos documentos do cliente; produz o business-context.md e as métricas de linha de base. | brownfield |
| [@coding-archaeologist](coding-archaeologist.md) | Discovery: extrai como o time realmente escreve código e gera a skill coding-guidelines-&lt;repo-id>, que vira a lei de codificação dos agentes de execução. | brownfield |
| [@debt-analyst](debt-analyst.md) | Discovery: consolida a dívida técnica num inventário priorizável (quadrante de Fowler e estimativa de juros) a partir dos achados dos outros agentes. | brownfield |
| [@dependency-mapper](dependency-mapper.md) | Discovery: mapeia como os repositórios se conectam (chamadas, contratos, dados compartilhados) e produz o grafo de dependências entre eles. | brownfield |
| [@design-archaeologist](design-archaeologist.md) | Discovery: extrai o padrão visual real da UI existente e gera a skill design-system-&lt;repo-id> para quem cria ou altera telas. | brownfield |
| [@domain-extractor](domain-extractor.md) | Discovery: engenharia reversa de domínio; extrai bounded contexts, aggregates e linguagem ubíqua do código, separando o domínio atual do ideal. | brownfield |
| [@maturity-assessor](maturity-assessor.md) | Discovery (opcional): avalia a maturidade do projeto nos frameworks escolhidos no config (DORA, SAMM, ASVS, CMMI e outros). | brownfield |
| [@quality-auditor](quality-auditor.md) | Discovery: diagnóstico objetivo da saúde do código (complexidade, hotspots, duplicação, código morto), com métricas e não opiniões. | brownfield |
| [@security-auditor](security-auditor.md) | Discovery: mapeia o perfil de risco de segurança do projeto existente (dependências vulneráveis, segredos expostos, superfícies de ataque) sem explorar nada. | brownfield |
| [@tech-mapper](tech-mapper.md) | Discovery: inventário preciso e versionado da stack em uso (versões do lock, não as declaradas) e radar tecnológico do repositório. | brownfield |
| [@test-coverage-mapper](test-coverage-mapper.md) | Discovery: diagnostica o estado dos testes, onde falta cobertura e o que precisa de characterization tests antes de qualquer refactor. | brownfield |

## Planejamento (`planning`)

Decide o que mudar, em que ordem e por quê; o gate D2 fecha a etapa.

| Agente | O que faz | Edições |
|---|---|---|
| [@adr-recorder](adr-recorder.md) | Planning: registra como ADRs as decisões arquiteturais implícitas no projeto e as propostas do roadmap. | brownfield |
| [@modernization-planner](modernization-planner.md) | Planning: compara a arquitetura atual de cada repositório com o alvo e monta o roadmap de modernização incremental e reversível. | brownfield |
| [@risk-prioritizer](risk-prioritizer.md) | Planning: ordena o roadmap pela matriz risco × valor × esforço, incluindo o risco de não fazer. | brownfield |

## Execução (`execution`)

Muda o código em passos pequenos e reversíveis, com a rede de testes pronta; o gate D3 fecha a etapa.

| Agente | O que faz | Edições |
|---|---|---|
| [@feature-adder](feature-adder.md) | Execution: implementa feature nova em código existente, BDD primeiro e no estilo do projeto, sem refatorar de passagem. | brownfield |
| [@migration-agent](migration-agent.md) | Execution: migra versão de runtime ou framework e troca bibliotecas de forma incremental e reversível (Expand-Contract, nunca big bang). | brownfield |
| [@refactor-agent](refactor-agent.md) | Execution: aplica refactors conhecidos e pequenos (receitas de Fowler), com testes verdes e commits atômicos, sem mudar comportamento. | brownfield |
| [@test-backfill-agent](test-backfill-agent.md) | Execution: cria a rede de segurança (characterization tests) que pina o comportamento atual antes de qualquer refactor ou migração. | brownfield |

## Operação (`operation`)

Mantém o que já está em produção.

| Agente | O que faz | Edições |
|---|---|---|
| [@devops](devops.md) | Operation: constrói e mantém CI/CD e IaC dos repositórios do workspace e executa as ações N1 de deploy e rollback. | as duas |
| [@incident](incident.md) | Operation: responde a incidentes reportados e produz o post-mortem, mesmo nos pequenos. | as duas |
| [@observability](observability.md) | Operation: configura health checks, métricas, dashboards e alertas dos serviços do workspace e escala para o @incident. | as duas |
| [@release](release.md) | Operation: cria a tag semver, as release notes e publica o artefato. | greenfield |
| [@sustain](sustain.md) | Operation: patch contínuo de segurança e upgrade de dependências dos repositórios do workspace, fora das iniciativas. | as duas |

## Upstream, para projetos novos (`upstream`)

Define o que construir antes de qualquer código.

| Agente | O que faz | Edições |
|---|---|---|
| [@architecture](architecture.md) | Upstream: define ADRs, o contrato OpenAPI (contract-first), diagramas C4 e de sequência e os padrões transversais da arquitetura. | greenfield |
| [@bdd](bdd.md) | Upstream: escreve os cenários Gherkin em ciclo espiral com o @domain-modeler, na linguagem ubíqua do domínio. | greenfield |
| [@business](business.md) | Upstream: capta a oportunidade de negócio e produz o Business Brief (problema, público, valor esperado e métricas de sucesso). | greenfield |
| [@domain-modeler](domain-modeler.md) | Upstream: aplica DDD (bounded contexts, aggregates, linguagem ubíqua) em ciclo espiral com o @bdd. | greenfield |
| [@product](product.md) | Upstream: transforma o Business Brief em PRD e lista de features priorizadas com hipóteses mensuráveis. | greenfield |
| [@sprint-planner](sprint-planner.md) | Upstream: quebra as features em tarefas com DoR e produz o sprint-backlog.yaml; fecha o Upstream antes do gate G1. | greenfield |
| [@ux-designer](ux-designer.md) | Upstream: transforma o PRD em jornadas visuais validáveis (user flows, wireframes e protótipo HTML navegável). | greenfield |

## Downstream, para projetos novos (`downstream`)

Constrói e valida o que o Upstream definiu.

| Agente | O que faz | Edições |
|---|---|---|
| [@backend-dotnet](backend-dotnet.md) | Downstream: implementa serviços backend em .NET Core (C#), clean architecture e contract-first, a partir das tarefas da sprint. | greenfield |
| [@backend-java](backend-java.md) | Downstream: implementa serviços backend em Java e Spring Boot, arquitetura hexagonal e contract-first via OpenAPI. | greenfield |
| [@backend-python-agentic](backend-python-agentic.md) | Downstream: implementa serviços agênticos em Python (LangGraph, PydanticAI ou equivalente), em que o produto é um agente ou grafo de agentes. | greenfield |
| [@backend-python-api](backend-python-api.md) | Downstream: implementa APIs em Python e FastAPI, clean architecture e contract-first. | greenfield |
| [@frontend-android](frontend-android.md) | Downstream: implementa apps Android nativos em Kotlin e Jetpack Compose (MVVM, Hilt, Coroutines). | greenfield |
| [@frontend-flutter](frontend-flutter.md) | Downstream: implementa apps multiplataforma em Flutter, clean architecture com Riverpod ou Bloc. | greenfield |
| [@frontend-ios](frontend-ios.md) | Downstream: implementa apps iOS nativos em Swift e SwiftUI (MVVM, Combine). | greenfield |
| [@frontend-react](frontend-react.md) | Downstream: implementa o front em React, Vite e TypeScript, com server state separado e design tokens. | greenfield |
| [@reviewer](reviewer.md) | Downstream: revisa os PRs da sprint e só aprova com @security e @qa-tester verdes. | greenfield |
| [@sprint-runner](sprint-runner.md) | Downstream: coordena a execução da sprint, despacha backend e frontend em ondas paralelas e aciona os side-cars de teste e revisão. | greenfield |

## Guardiões (`guardian`)

Entram só nos gates e validam de ponta a ponta. Não executam fase.

| Agente | O que faz | Edições |
|---|---|---|
| [@arch-cross](arch-cross.md) | Guardian: garante a coerência técnica de ponta a ponta entre as stacks e valida a arquitetura nos gates G1 e G2. | greenfield |
| [@stream-align](stream-align.md) | Guardian: garante que o que vai para produção é o que o negócio pediu (rastreabilidade BDD, PRD e código) nos gates G1 e G2. | greenfield |

## Side-cars (`sidecar`)

Entram sob demanda, chamados por outro agente.

| Agente | O que faz | Edições |
|---|---|---|
| [@docs](docs.md) | Side-car: mantém docs, ADRs e CHANGELOG sincronizados com os artefatos versionados. | greenfield |
| [@integration-tests](integration-tests.md) | Side-car: roda a suíte de ponta a ponta e os contract tests entre serviços quando backend e frontend fecham uma onda. | greenfield |
| [@qa-tester](qa-tester.md) | Side-car: escreve as step definitions e executa os cenários BDD na stack ativa. | greenfield |
| [@quality](quality.md) | Side-car: avalia a qualidade nos gates (cobertura, complexidade, smells, dívida técnica). | greenfield |
| [@security](security.md) | Side-car: scan de CVEs, OWASP e segredos, e threat modeling pontual. | greenfield |

## Skills

As 55 skills estão em [skills.md](skills.md), por família, com a edição e os agentes que as usam. Uma skill só entra no contexto de um agente quando o frontmatter dele a declara em `uses_skills`.

## Como este catálogo é gerado

Os arquivos desta pasta saem de `npm run docs:agents`, a partir do frontmatter de `kit/` e do `kit/kit.manifest.yaml`. Não edite à mão: o `npm run docs:agents:check` roda no CI e reprova qualquer diferença entre a pasta e o kit. Para mudar o texto de um agente, mude o agente em `kit/` e gere de novo.
