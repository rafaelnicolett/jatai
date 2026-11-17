/**
 * catalog.ts — dados do Concierge (F3.7, Split Phase do
 * `ConciergeParticipant.ts`, cluster K1): os templates de entrada por fase,
 * que preenchem o chat com um roteiro estruturado, e os ícones de stream e de
 * prioridade dos cards. O catálogo de fases em si é o único
 * (`chatPhaseMeta`, `data/phase-catalog.pure.ts`). Sem `vscode` nem I/O.
 */

import { BRAND } from "../data/brand.pure";

// ── Phase input templates (pre-fill chat input with structured framework) ────

export const PHASE_TEMPLATE: Partial<Record<string, string>> = {
  "business": `@${BRAND.participant.name} Quero criar o Business Brief do meu projeto.

## 🏢 Contexto do Negócio
- **Setor / Indústria**: <ex: fintech, saúde, educação, varejo, logística>
- **Modelo de negócio**: <ex: B2B SaaS, marketplace, app consumer, plataforma interna, e-commerce>
- **Estágio atual**: <ex: ideia nova, MVP a ser construído, produto existente com nova feature>

## 😣 Problema que o produto resolve
- **Persona principal** (quem sofre): <ex: pequenos comerciantes, equipes de RH, estudantes universitários>
- **Dor central**: <descreva o problema em 1-2 frases>
- **Como resolvem hoje** (workaround atual): <ex: planilhas, processo manual, sistema legado>

## 💡 Proposta de Valor
- **O que o produto faz**: <descreva a solução em 1-2 frases>
- **Principal diferencial**: <por que escolheriam isso em vez do que existe?>
- **Resultado esperado para o usuário**: <ex: reduz 80% do tempo, economiza R$X/mês, elimina erro humano>

## 🎯 Escopo do MVP
- **Funcionalidades essenciais**: <liste as 3-5 mais importantes>
- **Fora do escopo por enquanto**: <o que explicitamente NÃO entra no MVP>
- **Restrições ou premissas**: <ex: só web, sem integrações externas, multitenancy desde o início>

## 👥 Contexto de Time e Prazo (opcional)
- **Equipe disponível**: <ex: 2 devs backend, 1 frontend, 1 designer>
- **Prazo ou milestone**: <ex: demo em 3 meses, lançamento no Q3>
- **Stack preferida ou restrição**: <ex: já temos infra AWS, time conhece Python>`,

  "product": `@${BRAND.participant.name} Quero evoluir para o PRD — Product Requirements Document.

## 📋 Resumo do Produto
- **Nome**: <nome do produto ou feature>
- **Objetivo**: <o que resolve e para quem, em 1 frase>

## 👤 Personas e Jornada Principal
- **Persona 1**: <nome, cargo/perfil, dor principal>
- **Persona 2** (se houver): <nome, cargo/perfil, dor principal>
- **Jornada crítica**: <fluxo principal que precisa funcionar impecavelmente, passo a passo>

## 🗂 Features para o MVP (em ordem de prioridade)
1. <Feature A> — <por que é essencial>
2. <Feature B> — <por que é essencial>
3. <Feature C> — <nice-to-have ou P2>

## ✅ Critérios de Aceite Gerais
- <o que define que o produto está pronto para lançar>

## 📐 Restrições e Integrações
- <performance, segurança, compliance, integrações obrigatórias>`,

  "ux-design": `@${BRAND.participant.name} Quero definir o UX e os fluxos do usuário.

## 🎨 Visão de Produto e Tom
- **Estilo visual pretendido**: <ex: minimalista, corporativo, consumer amigável>
- **Referências visuais** (opcional): <URLs ou apps de referência>

## 👤 Fluxos Prioritários
- **Fluxo 1 — <nome>**: <descrição do fluxo>
- **Fluxo 2 — <nome>**: <descrição do fluxo>

## 📱 Plataformas
- <Web, Mobile iOS, Mobile Android, Desktop, Todos>

## ⚠️ Casos de borda e acessibilidade
- <pontos críticos de UX, usuários com necessidades especiais, idiomas>`,

  "bdd": `@${BRAND.participant.name} Quero criar os cenários BDD para a feature.

## 🎯 Feature a especificar
- **Nome**: <ex: autenticação, checkout, onboarding>
- **Objetivo**: <o que o usuário consegue fazer com essa feature>

## 👤 Atores envolvidos
- <Persona/Role 1>: <papel no fluxo>
- <Persona/Role 2>: <papel no fluxo>

## 🔄 Fluxo principal (happy path)
1. <passo 1>
2. <passo 2>
3. <passo 3>

## ⚠️ Fluxos alternativos e erros
- <O que acontece quando X falha?>
- <Caso de borda importante>

## 📌 Regras de negócio relevantes
- <Regra 1>
- <Regra 2>`,

  "architecture": `@${BRAND.participant.name} Quero definir a arquitetura do sistema.

## 🏗 Stack e Infra
- **Backend**: <ex: Python FastAPI, Java Spring, .NET Core>
- **Frontend**: <ex: React Vite, Flutter, iOS SwiftUI>
- **Banco de dados**: <ex: PostgreSQL, MongoDB, Redis>
- **Infra / Cloud**: <ex: AWS, GCP, Azure, on-premise, Kubernetes>

## 🔌 Integrações externas
- <Sistema/API 1>: <finalidade>
- <Sistema/API 2>: <finalidade>

## 📐 Padrão arquitetural preferido
- <ex: Clean Architecture, Hexagonal, Layered CRUD, Vertical Slice>

## ⚠️ Requisitos não-funcionais críticos
- **Escala esperada**: <ex: 1k usuários/dia, picos de X req/s>
- **Segurança**: <autenticação, dados sensíveis, compliance>
- **Disponibilidade**: <SLA, tolerância a falha>`,
};

/** Pedido de nova iniciativa que o guia leva ao agente orquestrador (`/nova`, ADR-0025). */
export const NEW_INITIATIVE_PROMPT = `@${BRAND.participant.name} Quero iniciar uma nova iniciativa de delivery. Ajuda-me a definir o id, nome, prioridade e contexto para criar a entrada no initiatives.yaml.`;

export const STREAM_ICON: Record<string, string> = {
  upstream:   "🔵",
  downstream: "🟣",
  operation:  "🟢",
};

export const PRIORITY_BADGE: Record<string, string> = {
  P0: "🔴 `P0`",
  P1: "🟡 `P1`",
  P2: "⚪ `P2`",
};
