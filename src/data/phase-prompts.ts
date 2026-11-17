// ── Phase Prompt Library ──────────────────────────────────────────────────
// Prompt cards exibidos no cockpit de acordo com a fase atual da iniciativa.
// Cada fase tem 4 prompts focados e direcionados para o agente correto.

import { BRAND } from "./brand.pure";

export interface PhasePromptCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
  prompt: string;
  tag?: string; // ex: "quick-win" | "análise" | "artefato"
}

export interface PhasePromptGroup {
  phaseId: string;
  label: string;
  agent: string;
  stream: "upstream" | "downstream" | "operation";
  cards: PhasePromptCard[];
}

export const PHASE_PROMPT_LIBRARY: Record<string, PhasePromptGroup> = {

  // ── UPSTREAM ──────────────────────────────────────────────────────────

  business: {
    phaseId: "business",
    label: "Business Brief",
    agent: "@business",
    stream: "upstream",
    cards: [
      {
        id: "biz-oportunidade",
        icon: "🎯",
        title: "Mapear Oportunidade",
        desc: "Descreva o problema de mercado, o tamanho da oportunidade e a proposta de valor inicial.",
        prompt: `@${BRAND.participant.name} Quero mapear uma oportunidade de negócio. Me ajude a estruturar: qual é o problema do usuário, qual o contexto de mercado e qual seria a proposta de valor. Gere o business-brief.md no padrão da ${BRAND.displayName}.`,
        tag: "artefato",
      },
      {
        id: "biz-personas",
        icon: "👥",
        title: "Definir Personas",
        desc: "Identifique quem são os usuários principais, suas dores e motivações.",
        prompt: `@${BRAND.participant.name} Com base no contexto do projeto, me ajude a definir as personas primárias: nome, papel, dores principais e o que elas ganham com a solução. Inclua no business-brief.`,
        tag: "análise",
      },
      {
        id: "biz-concorrencia",
        icon: "🔬",
        title: "Análise de Mercado",
        desc: "Mapeie concorrentes, diferenciais e posicionamento estratégico.",
        prompt: `@${BRAND.participant.name} Quero fazer uma análise de mercado para o projeto. Me ajude a mapear concorrentes diretos e indiretos, identificar diferenciadores e definir o posicionamento. Adicione ao business-brief.`,
        tag: "análise",
      },
      {
        id: "biz-metricas",
        icon: "📈",
        title: "Métricas de Sucesso",
        desc: "Defina KPIs e critérios mensuráveis para validar a oportunidade.",
        prompt: `@${BRAND.participant.name} Com base no business brief, me ajude a definir as métricas de sucesso do produto: KPIs primários, metas de curto prazo (3 meses) e critérios de validação da hipótese de negócio.`,
        tag: "análise",
      },
    ],
  },

  product: {
    phaseId: "product",
    label: "PRD",
    agent: "@product",
    stream: "upstream",
    cards: [
      {
        id: "prd-completo",
        icon: "📋",
        title: "Gerar PRD Completo",
        desc: "Transforme o business brief em um PRD com features, personas e critérios de aceite.",
        prompt: `@${BRAND.participant.name} Tenho o business brief pronto. Me ajude a criar o PRD completo com: lista de features priorizadas, descrição de personas, épicos e histórias de usuário iniciais, e critérios de aceite. Gere o prd.md.`,
        tag: "artefato",
      },
      {
        id: "prd-moscow",
        icon: "⚖️",
        title: "Priorizar com MoSCoW",
        desc: "Classifique features como Must Have, Should Have, Could Have, Won't Have.",
        prompt: `@${BRAND.participant.name} Com as features do PRD, me ajude a aplicar o framework MoSCoW. Para cada feature, defina se é Must / Should / Could / Won't have e justifique. Atualize o prd.md.`,
        tag: "análise",
      },
      {
        id: "prd-aceite",
        icon: "✅",
        title: "Critérios de Aceite",
        desc: "Defina critérios mensuráveis de aceite para cada feature principal.",
        prompt: `@${BRAND.participant.name} Para as features Must Have do PRD, me ajude a escrever critérios de aceite claros e mensuráveis no formato 'dado que... quando... então...'. Atualize o prd.md.`,
        tag: "artefato",
      },
      {
        id: "prd-roadmap",
        icon: "🗓",
        title: "Roadmap de Releases",
        desc: "Organize as features em releases sequenciais com objetivos claros.",
        prompt: `@${BRAND.participant.name} Com o PRD pronto, me ajude a criar um roadmap de releases: MVP, v1.0, v1.1 — com quais features entram em cada release e qual o objetivo de negócio de cada uma.`,
        tag: "análise",
      },
    ],
  },

  "ux-design": {
    phaseId: "ux-design",
    label: "UX Design",
    agent: "@ux-designer",
    stream: "upstream",
    cards: [
      {
        id: "ux-jornadas",
        icon: "🗺",
        title: "Mapear Jornadas",
        desc: "Crie os fluxos de usuário para as principais personas do produto.",
        prompt: `@${BRAND.participant.name} Com base no PRD e nas personas, me ajude a mapear as jornadas de usuário principais. Para cada persona, descreva os passos, pontos de fricção e oportunidades de encantamento. Gere docs/design/user-flows.md.`,
        tag: "artefato",
      },
      {
        id: "ux-wireframes",
        icon: "🖼",
        title: "Criar Wireframes ASCII",
        desc: "Esboce as telas principais em wireframe textual antes do protótipo.",
        prompt: `@${BRAND.participant.name} Com os fluxos mapeados, me ajude a criar wireframes ASCII das telas principais: listagem, detalhe, formulário de criação e dashboard. Inclua navegação e estados (empty, loading, erro).`,
        tag: "artefato",
      },
      {
        id: "ux-prototipo",
        icon: "🎨",
        title: "Protótipo HTML Navegável",
        desc: "Gere um protótipo HTML estático e navegável para validação com stakeholders.",
        prompt: `@${BRAND.participant.name} Com os wireframes prontos, me ajude a criar um protótipo HTML navegável sem framework JS. Deve cobrir os fluxos principais, usar CSS inline e ser aberto direto no browser para validação.`,
        tag: "artefato",
      },
      {
        id: "ux-acessibilidade",
        icon: "♿",
        title: "Checklist A11y",
        desc: "Valide o design contra critérios de acessibilidade WCAG 2.1 AA.",
        prompt: `@${BRAND.participant.name} Com o protótipo criado, me ajude a revisar a acessibilidade: contraste de cores, navegação por teclado, labels de formulário, semântica HTML e critérios WCAG 2.1 nível AA.`,
        tag: "análise",
      },
    ],
  },

  domain: {
    phaseId: "domain",
    label: "Domínio",
    agent: "@domain-modeler",
    stream: "upstream",
    cards: [
      {
        id: "domain-bc",
        icon: "🏛",
        title: "Modelar Bounded Contexts",
        desc: "Identifique e delimite os contextos de domínio com suas responsabilidades.",
        prompt: `@${BRAND.participant.name} Com base no PRD e business brief, me ajude a modelar os Bounded Contexts do sistema: nome, responsabilidade principal, tipo (core/supporting/generic) e fronteiras. Gere docs/domain/bounded-contexts.md.`,
        tag: "artefato",
      },
      {
        id: "domain-ul",
        icon: "📖",
        title: "Linguagem Ubíqua",
        desc: "Defina o glossário de termos do domínio compartilhado entre negócio e tecnologia.",
        prompt: `@${BRAND.participant.name} Me ajude a construir a Linguagem Ubíqua do projeto: identifique os termos-chave do domínio, defina cada um com precisão e elimine ambiguidades. Gere docs/domain/ubiquitous-language.md.`,
        tag: "artefato",
      },
      {
        id: "domain-events",
        icon: "⚡",
        title: "Event Storming",
        desc: "Mapeie os eventos de domínio que ocorrem nos fluxos principais.",
        prompt: `@${BRAND.participant.name} Com os bounded contexts definidos, me ajude a fazer um Event Storming: liste os Domain Events por contexto, os Aggregates que os emitem e os Command que os causam. Gere docs/domain/event-storming.md.`,
        tag: "artefato",
      },
      {
        id: "domain-aggregates",
        icon: "🧩",
        title: "Definir Aggregates",
        desc: "Identifique os Aggregates, suas Entities e Value Objects por contexto.",
        prompt: `@${BRAND.participant.name} Com o Event Storming pronto, me ajude a definir os Aggregates de cada Bounded Context: qual é o Aggregate Root, quais Entities e Value Objects compõem cada um, e quais as invariantes de negócio.`,
        tag: "análise",
      },
    ],
  },

  bdd: {
    phaseId: "bdd",
    label: "BDD Features",
    agent: "@bdd",
    stream: "upstream",
    cards: [
      {
        id: "bdd-happy",
        icon: "✅",
        title: "Cenários Happy Path",
        desc: "Escreva os cenários Gherkin para os fluxos principais de sucesso.",
        prompt: `@${BRAND.participant.name} Com base no PRD e nos wireframes, me ajude a escrever os cenários BDD Gherkin para os fluxos principais de sucesso (happy path). Use linguagem de domínio nos Given/When/Then. Gere os .feature files em features/.`,
        tag: "artefato",
      },
      {
        id: "bdd-errors",
        icon: "🚨",
        title: "Cenários de Erro",
        desc: "Cubra validações, permissões e casos de borda com Gherkin.",
        prompt: `@${BRAND.participant.name} Para as features já escritas, me ajude a adicionar cenários de erro: validações de formulário, permissões negadas, recursos não encontrados e falhas de integração. Mantenha linguagem de domínio.`,
        tag: "artefato",
      },
      {
        id: "bdd-outline",
        icon: "📊",
        title: "Scenario Outline",
        desc: "Parametrize cenários repetitivos com Scenario Outline e tabelas de exemplos.",
        prompt: `@${BRAND.participant.name} Identifique nos .feature files os cenários que podem ser parametrizados e converta-os para Scenario Outline com Examples tables. Reduza duplicação mantendo clareza.`,
        tag: "quick-win",
      },
      {
        id: "bdd-review",
        icon: "🔍",
        title: "Revisar Gherkin",
        desc: `Valide se os cenários estão claros, testáveis e no padrão da ${BRAND.displayName}.`,
        prompt: `@${BRAND.participant.name} Revise todos os .feature files existentes: verifique se os cenários são declarativos (não imperativo), se usam linguagem de domínio, se estão organizados por contexto e se cobrem os critérios de aceite do PRD.`,
        tag: "análise",
      },
    ],
  },

  architecture: {
    phaseId: "architecture",
    label: "Arquitetura",
    agent: "@architecture",
    stream: "upstream",
    cards: [
      {
        id: "arch-openapi",
        icon: "📡",
        title: "Contrato OpenAPI",
        desc: "Gere o contrato API-first em OpenAPI 3.1 com base no domínio e BDD.",
        prompt: `@${BRAND.participant.name} Com o domínio e os cenários BDD definidos, me ajude a criar o contrato OpenAPI 3.1 da API. Inclua endpoints, schemas, security schemes e exemplos. Gere api/openapi.yaml.`,
        tag: "artefato",
      },
      {
        id: "arch-c4",
        icon: "🏗",
        title: "Diagrama C4",
        desc: "Desenhe os diagramas C4 Context e Container da solução.",
        prompt: `@${BRAND.participant.name} Me ajude a criar os diagramas C4 da arquitetura: nível Context (sistema e atores externos) e nível Container (serviços, databases, frontends). Gere docs/architecture/c4-context.md e c4-container.md.`,
        tag: "artefato",
      },
      {
        id: "arch-adr",
        icon: "📝",
        title: "Registrar ADRs",
        desc: "Documente as decisões técnicas relevantes com Architecture Decision Records.",
        prompt: `@${BRAND.participant.name} Com as decisões técnicas do projeto definidas, me ajude a criar ADRs para as escolhas mais impactantes: stack, banco de dados, autenticação, pattern de comunicação. Gere docs/adr/000N-titulo.md.`,
        tag: "artefato",
      },
      {
        id: "arch-review",
        icon: "🔎",
        title: "Revisar Arquitetura",
        desc: "Valide a arquitetura contra os requisitos de domínio, BDD e não-funcionais.",
        prompt: `@${BRAND.participant.name} Revise a arquitetura definida: verifique aderência ao domínio, cobertura dos cenários BDD, requisitos não-funcionais (performance, segurança, escalabilidade) e consistência entre OpenAPI e C4.`,
        tag: "análise",
      },
    ],
  },

  "sprint-plan": {
    phaseId: "sprint-plan",
    label: "Sprint Plan",
    agent: "@sprint-planner",
    stream: "upstream",
    cards: [
      {
        id: "sp-historias",
        icon: "📖",
        title: "Quebrar em Histórias",
        desc: "Transforme features e BDD em histórias de usuário estimadas.",
        prompt: `@${BRAND.participant.name} Com o PRD e os cenários BDD, me ajude a criar o sprint backlog: quebre as features em histórias de usuário no formato 'Como... quero... para...', com critérios de aceite e estimativas. Gere .github/artifacts/sprint-backlog.yaml.`,
        tag: "artefato",
      },
      {
        id: "sp-capacidade",
        icon: "⚡",
        title: "Definir Capacidade",
        desc: "Calcule a capacidade do time e selecione histórias para o sprint.",
        prompt: `@${BRAND.participant.name} Me ajude a planejar a capacidade da sprint: quantos story points o time consegue entregar, quais histórias priorizadas cabem no sprint respeitando dependências e complexidade.`,
        tag: "análise",
      },
      {
        id: "sp-dod",
        icon: "✅",
        title: "Definition of Done",
        desc: "Defina o checklist de DoD compartilhado entre time e stakeholders.",
        prompt: `@${BRAND.participant.name} Me ajude a definir o Definition of Done da sprint: quais são os critérios que uma história precisa atender para ser considerada concluída (testes, review, deploy, documentação). Inclua no sprint-backlog.yaml.`,
        tag: "artefato",
      },
      {
        id: "sp-riscos",
        icon: "⚠️",
        title: "Mapear Riscos",
        desc: "Identifique dependências técnicas e riscos que podem bloquear a sprint.",
        prompt: `@${BRAND.participant.name} Com o sprint backlog definido, me ajude a mapear riscos e dependências: quais histórias têm dependências externas, quais têm maior incerteza técnica e como mitigar os principais bloqueios.`,
        tag: "análise",
      },
    ],
  },

  // ── DOWNSTREAM ────────────────────────────────────────────────────────

  "sprint-run": {
    phaseId: "sprint-run",
    label: "Sprint Runner",
    agent: "@sprint-runner",
    stream: "downstream",
    cards: [
      {
        id: "sr-iniciar",
        icon: "▶",
        title: "Iniciar Sprint",
        desc: "Faça o dispatch para os agentes de stack e comece a implementação.",
        prompt: `@${BRAND.participant.name} Estou pronto para iniciar a sprint. Leia o sprint-backlog.yaml e faça o dispatch para os agentes de stack corretos (backend e frontend). Confirme a stack configurada e as histórias a implementar.`,
        tag: "artefato",
      },
      {
        id: "sr-status",
        icon: "📊",
        title: "Status da Sprint",
        desc: "Obtenha um relatório do progresso atual das histórias em andamento.",
        prompt: `@${BRAND.participant.name} Me dê um status atualizado da sprint em andamento: quais histórias foram concluídas, quais estão em progresso, quais estão bloqueadas e qual é o burn-down estimado.`,
        tag: "análise",
      },
      {
        id: "sr-desbloquear",
        icon: "🔓",
        title: "Desbloquear Impedimento",
        desc: "Identifique e resolva um bloqueio técnico ou de dependência na sprint.",
        prompt: `@${BRAND.participant.name} Tenho um impedimento na sprint. Me ajude a analisar o bloqueio, avaliar alternativas de solução e definir o caminho mais rápido para desbloquear sem comprometer a qualidade.`,
        tag: "quick-win",
      },
      {
        id: "sr-aceite",
        icon: "✅",
        title: "Verificar Critérios de Aceite",
        desc: "Valide se as histórias entregues atendem aos critérios definidos no backlog.",
        prompt: `@${BRAND.participant.name} Para as histórias implementadas, me ajude a verificar se cada uma atende ao seu critério de aceite e ao DoD. Gere um relatório de validação antes do code review.`,
        tag: "análise",
      },
    ],
  },

  backend: {
    phaseId: "backend",
    label: "Backend",
    agent: "@backend",
    stream: "downstream",
    cards: [
      {
        id: "be-endpoint",
        icon: "⚙",
        title: "Implementar Endpoint",
        desc: "Crie um endpoint seguindo o contrato OpenAPI e a arquitetura hexagonal.",
        prompt: `@${BRAND.participant.name} Me ajude a implementar um endpoint da API. Seguindo o contrato OpenAPI, a arquitetura hexagonal e os padrões da stack configurada. Inclua handler, use case, repository e testes unitários.`,
        tag: "artefato",
      },
      {
        id: "be-dominio",
        icon: "🧩",
        title: "Implementar Domínio",
        desc: "Implemente Aggregates, Entities e Value Objects do modelo de domínio.",
        prompt: `@${BRAND.participant.name} Me ajude a implementar o modelo de domínio: Aggregate Root com invariantes de negócio, Entities, Value Objects imutáveis e Domain Events. Siga a linguagem ubíqua definida.`,
        tag: "artefato",
      },
      {
        id: "be-testes",
        icon: "🧪",
        title: "Criar Testes Unitários",
        desc: "Escreva testes unitários para use cases e lógica de domínio.",
        prompt: `@${BRAND.participant.name} Me ajude a criar testes unitários para o código implementado: testes de use cases com mocks dos ports, testes do modelo de domínio com cenários de negócio e testes de validações. Use a framework da stack configurada.`,
        tag: "artefato",
      },
      {
        id: "be-seguranca",
        icon: "🔐",
        title: "Revisar Segurança",
        desc: "Verifique vulnerabilidades OWASP Top 10 no código do backend.",
        prompt: `@${BRAND.participant.name} Revise o código do backend sob a ótica de segurança OWASP Top 10: injection, autenticação/autorização, exposição de dados sensíveis, controle de acesso quebrado e configurações inseguras. Gere relatório de achados.`,
        tag: "análise",
      },
    ],
  },

  frontend: {
    phaseId: "frontend",
    label: "Frontend",
    agent: "@frontend",
    stream: "downstream",
    cards: [
      {
        id: "fe-componente",
        icon: "⬡",
        title: "Implementar Componente",
        desc: "Crie um componente de UI seguindo o design system e as jornadas do UX.",
        prompt: `@${BRAND.participant.name} Me ajude a implementar um componente de UI. Seguindo o design system, os wireframes e os padrões da stack configurada. Inclua estados (loading, empty, error) e testes de componente.`,
        tag: "artefato",
      },
      {
        id: "fe-integracao",
        icon: "🔌",
        title: "Integrar com API",
        desc: "Conecte o frontend à API usando o contrato OpenAPI como referência.",
        prompt: `@${BRAND.participant.name} Me ajude a integrar o frontend com a API: crie o cliente HTTP tipado a partir do OpenAPI, implemente o estado de loading/error, trate respostas de erro e escreva testes de integração.`,
        tag: "artefato",
      },
      {
        id: "fe-design-system",
        icon: "🎨",
        title: "Aplicar Design System",
        desc: "Implemente tokens de design, componentes base e padrões de layout.",
        prompt: `@${BRAND.participant.name} Me ajude a implementar o design system: tokens de cor, tipografia e espaçamento como CSS vars, componentes base reutilizáveis (Button, Input, Card) e grid de layout responsivo.`,
        tag: "artefato",
      },
      {
        id: "fe-acessibilidade",
        icon: "♿",
        title: "Validar A11y",
        desc: "Garanta que os componentes atendam aos critérios WCAG 2.1 AA.",
        prompt: `@${BRAND.participant.name} Revise os componentes implementados quanto à acessibilidade: atributos ARIA, navegação por teclado, contraste de cores, semântica HTML e comportamento com screen readers.`,
        tag: "análise",
      },
    ],
  },

  reviewer: {
    phaseId: "reviewer",
    label: "Code Review",
    agent: "@reviewer",
    stream: "downstream",
    cards: [
      {
        id: "rev-completo",
        icon: "🔍",
        title: "Code Review Completo",
        desc: "Faça um review abrangente de código antes do merge.",
        prompt: `@${BRAND.participant.name} Faça um code review completo do código implementado: verifique aderência à arquitetura, qualidade do código, cobertura de testes, segurança OWASP e conformidade com a DoD. Gere relatório de review.`,
        tag: "análise",
      },
      {
        id: "rev-arquitetura",
        icon: "🏗",
        title: "Verificar Arquitetura",
        desc: "Valide se o código respeita a arquitetura hexagonal e os contratos definidos.",
        prompt: `@${BRAND.participant.name} Verifique a aderência arquitetural do código: o fluxo passa pelas camadas corretas (adapter → use case → domain), os ports estão sendo respeitados, o OpenAPI está sendo seguido e não há acoplamento indevido.`,
        tag: "análise",
      },
      {
        id: "rev-seguranca",
        icon: "🔐",
        title: "Security Review",
        desc: "Análise focada em vulnerabilidades de segurança do código.",
        prompt: `@${BRAND.participant.name} Faça uma revisão de segurança focada: verifique SQL injection, XSS, CSRF, autenticação/autorização, dados sensíveis expostos, dependências vulneráveis e configurações inseguras.`,
        tag: "análise",
      },
      {
        id: "rev-aprovar",
        icon: "✅",
        title: "Aprovar para Merge",
        desc: "Confirme que todos os critérios estão atendidos e aprove o merge.",
        prompt: `@${BRAND.participant.name} O review está concluído. Verifique se todos os pontos críticos foram endereçados e gere o relatório final de aprovação para merge. Atualize o delivery-state.yaml com reviewer: done.`,
        tag: "quick-win",
      },
    ],
  },

  // ── OPERATION ─────────────────────────────────────────────────────────

  devops: {
    phaseId: "devops",
    label: "DevOps / CI",
    agent: "@devops",
    stream: "operation",
    cards: [
      {
        id: "dv-pipeline",
        icon: "🔄",
        title: "Criar Pipeline CI/CD",
        desc: "Configure o pipeline de integração e entrega contínua.",
        prompt: `@${BRAND.participant.name} Me ajude a criar o pipeline CI/CD para o projeto: build, testes unitários, análise de qualidade, build de imagem Docker, push para registry e deploy em ambiente de staging. Gere o arquivo em pipelines/.`,
        tag: "artefato",
      },
      {
        id: "dv-docker",
        icon: "🐳",
        title: "Containerizar Aplicação",
        desc: "Crie Dockerfile otimizado e docker-compose para desenvolvimento local.",
        prompt: `@${BRAND.participant.name} Me ajude a containerizar a aplicação: Dockerfile multi-stage otimizado para produção, docker-compose.local.yml para desenvolvimento com todos os serviços e variáveis de ambiente documentadas.`,
        tag: "artefato",
      },
      {
        id: "dv-iac",
        icon: "🏗",
        title: "Infraestrutura como Código",
        desc: "Defina a infraestrutura em código (Terraform, Pulumi ou CloudFormation).",
        prompt: `@${BRAND.participant.name} Me ajude a criar a infraestrutura como código: defina os recursos necessários (compute, banco, storage, networking), variáveis por ambiente (dev/staging/prod) e outputs importantes.`,
        tag: "artefato",
      },
      {
        id: "dv-secrets",
        icon: "🔐",
        title: "Gestão de Secrets",
        desc: "Configure gestão segura de segredos e variáveis de ambiente.",
        prompt: `@${BRAND.participant.name} Me ajude a definir a estratégia de gestão de secrets: quais variáveis precisam de proteção, como injetá-las no pipeline de forma segura e como rotar credenciais sem downtime.`,
        tag: "análise",
      },
    ],
  },

  release: {
    phaseId: "release",
    label: "Release",
    agent: "@release",
    stream: "operation",
    cards: [
      {
        id: "rel-tag",
        icon: "🏷",
        title: "Criar Tag Semver",
        desc: "Gere a próxima tag de versão seguindo Semantic Versioning.",
        prompt: `@${BRAND.participant.name} Com base nas mudanças desta sprint, me ajude a definir a próxima versão semver: é um MAJOR (breaking), MINOR (feature) ou PATCH (fix)? Crie a tag e atualize os arquivos de versão.`,
        tag: "artefato",
      },
      {
        id: "rel-notes",
        icon: "📝",
        title: "Release Notes",
        desc: "Gere release notes estruturadas para usuários e times técnicos.",
        prompt: `@${BRAND.participant.name} Com base nas histórias entregues nesta sprint, me ajude a gerar release notes: seção de novas features, melhorias, correções e breaking changes. Separe a versão para usuários finais da versão técnica.`,
        tag: "artefato",
      },
      {
        id: "rel-checklist",
        icon: "✅",
        title: "Checklist de Release",
        desc: "Valide todos os critérios antes de promover para produção.",
        prompt: `@${BRAND.participant.name} Vamos executar o checklist de release: testes de fumaça passaram, migrations rodaram em staging, rollback testado, monitoramento configurado, comunicação enviada. Registre cada item.`,
        tag: "análise",
      },
      {
        id: "rel-hotfix",
        icon: "🚑",
        title: "Planejar Hotfix",
        desc: "Crie um plano de hotfix para correção urgente em produção.",
        prompt: `@${BRAND.participant.name} Precisamos de um hotfix urgente. Me ajude a planejar: qual é o impacto, qual é a correção mínima necessária, como testar rapidamente e como fazer o deploy sem janela de manutenção.`,
        tag: "quick-win",
      },
    ],
  },

  observability: {
    phaseId: "observability",
    label: "Observability",
    agent: "@observability",
    stream: "operation",
    cards: [
      {
        id: "obs-dashboards",
        icon: "📊",
        title: "Criar Dashboards",
        desc: "Configure dashboards de monitoramento com métricas de negócio e técnicas.",
        prompt: `@${BRAND.participant.name} Me ajude a criar dashboards de observabilidade: métricas de negócio (conversion, retention), métricas técnicas (latência, error rate, throughput) e métricas de infraestrutura (CPU, memória, disco).`,
        tag: "artefato",
      },
      {
        id: "obs-alertas",
        icon: "🔔",
        title: "Definir Alertas e SLOs",
        desc: "Configure SLOs, SLAs e alertas para garantir confiabilidade.",
        prompt: `@${BRAND.participant.name} Com a stack em produção, me ajude a definir SLOs realistas (disponibilidade, latência p99), criar alertas pra burn rate de error budget e configurar escalação de incidentes.`,
        tag: "artefato",
      },
      {
        id: "obs-tracing",
        icon: "🔗",
        title: "Distributed Tracing",
        desc: "Configure rastreamento distribuído entre serviços com OpenTelemetry.",
        prompt: `@${BRAND.participant.name} Me ajude a configurar distributed tracing com OpenTelemetry: instrumentação da aplicação, propagação de contexto entre serviços, exportação para o backend de observabilidade e queries de trace análise.`,
        tag: "artefato",
      },
      {
        id: "obs-analise",
        icon: "🔍",
        title: "Análise de Métricas",
        desc: "Analise as métricas atuais e identifique gargalos ou anomalias.",
        prompt: `@${BRAND.participant.name} Analise as métricas atuais da aplicação: identifique endpoints com alta latência, serviços com error rate elevado, tendências de crescimento e possíveis gargalos de performance. Gere relatório de achados.`,
        tag: "análise",
      },
    ],
  },

  incident: {
    phaseId: "incident",
    label: "Incidente",
    agent: "@incident",
    stream: "operation",
    cards: [
      {
        id: "inc-diagnostico",
        icon: "🚨",
        title: "Diagnosticar Incidente",
        desc: "Analise sintomas, hipóteses e defina um plano de investigação.",
        prompt: `@${BRAND.participant.name} Temos um incidente em produção. Me ajude a estruturar o diagnóstico: descreva os sintomas observados, formule hipóteses de causa raiz, defina os primeiros passos de investigação e quem acionar.`,
        tag: "quick-win",
      },
      {
        id: "inc-runbook",
        icon: "📖",
        title: "Criar Runbook",
        desc: "Documente o procedimento de resposta para este tipo de incidente.",
        prompt: `@${BRAND.participant.name} Com base no incidente atual, me ajude a criar um runbook: descreva os sintomas, diagnóstico passo a passo, ações de remediação, rollback se necessário e quem notificar. Gere em .github/artifacts/incidents/.`,
        tag: "artefato",
      },
      {
        id: "inc-postmortem",
        icon: "📝",
        title: "Post-Mortem",
        desc: "Escreva o post-mortem sem culpa com lições aprendidas e ações.",
        prompt: `@${BRAND.participant.name} O incidente foi resolvido. Me ajude a escrever o post-mortem: linha do tempo, impacto, causa raiz, o que foi bem, o que falhou e action items com owners e prazos. Formato blameless.`,
        tag: "artefato",
      },
      {
        id: "inc-rollback",
        icon: "⏪",
        title: "Acionar Rollback",
        desc: "Execute o plano de rollback para reverter para a versão estável.",
        prompt: `@${BRAND.participant.name} Precisamos fazer rollback urgente. Me ajude a executar: qual versão estável reverter, como fazer o rollback de código e migrations, como validar que o rollback foi bem-sucedido e como comunicar.`,
        tag: "quick-win",
      },
    ],
  },

  sustain: {
    phaseId: "sustain",
    label: "Sustentação",
    agent: "@sustain",
    stream: "operation",
    cards: [
      {
        id: "sus-cves",
        icon: "🛡",
        title: "Verificar CVEs",
        desc: "Escaneie dependências em busca de vulnerabilidades conhecidas.",
        prompt: `@${BRAND.participant.name} Me ajude a fazer um scan de segurança nas dependências: identifique CVEs críticos e altos, avalie o impacto de cada um e gere um plano de atualização priorizado. Gere relatório em .github/artifacts/security/.`,
        tag: "análise",
      },
      {
        id: "sus-upgrade",
        icon: "⬆️",
        title: "Atualizar Dependências",
        desc: "Atualize dependências com breaking changes de forma segura.",
        prompt: `@${BRAND.participant.name} Me ajude a planejar a atualização de dependências: identifique quais têm breaking changes, crie um plano de atualização incremental, atualize os testes para cobrir as mudanças e gere PRs por grupo.`,
        tag: "artefato",
      },
      {
        id: "sus-refactor",
        icon: "🔧",
        title: "Refactoring Técnico",
        desc: "Pague dívida técnica identificada mantendo comportamento estável.",
        prompt: `@${BRAND.participant.name} Temos dívida técnica a pagar. Me ajude a planejar o refactoring: identifique os módulos mais problemáticos, priorize pelo impacto, planeje a refatoração incremental sem quebrar funcionalidades existentes.`,
        tag: "análise",
      },
      {
        id: "sus-performance",
        icon: "⚡",
        title: "Análise de Performance",
        desc: "Identifique e otimize gargalos de performance na aplicação.",
        prompt: `@${BRAND.participant.name} Me ajude a analisar a performance da aplicação: identifique queries lentas, N+1 problems, memory leaks, endpoints com alta latência e proponha otimizações priorizadas por impacto.`,
        tag: "análise",
      },
    ],
  },
};

// Tags para filtros visuais
export const TAG_LABELS: Record<string, string> = {
  "artefato":  "📄 Gera Artefato",
  "análise":   "🔍 Análise",
  "quick-win": "⚡ Quick Win",
};

// Cor por stream
export const STREAM_ACCENT: Record<string, string> = {
  upstream:   "var(--hx-blue)",
  downstream: "var(--hx-purple)",
  operation:  "var(--hx-green)",
};
