---
id: docs-writer
name: docs-writer
type: skill
description: >
  Padrões de escrita de documentação. Cobre ADRs, CHANGELOG,
  PRDs, feature-list e documentação geral. Garante consistência e rastreabilidade
  entre artefatos. Usada por @docs, @product e @business.
applicable_to:
  - "@docs    — ADRs, CHANGELOG, docs técnicos sob demanda"
  - "@product — prd.md, feature-list.md"
  - "@business— business-brief.md"
inputs:
  - artefato origem (código, PR, feature, decisão)
outputs:
  - docs/**
  - CHANGELOG.md
  - .github/artifacts/*.md
---

# Skill: docs-writer

> Documento sem vínculo com artefato é ficção. Todo doc referencia a origem.

---

## 1. ADR — Architecture Decision Record

Caminho canônico: `docs/adr/<NNNN>-<slug>.md`
Numeração: sequencial, 4 dígitos, sem reutilizar IDs.

### Template

```markdown
# ADR-<NNNN> — <Título em 5-8 palavras>

**Status:** proposed | accepted | deprecated | superseded-by ADR-<NNNN>  
**Data:** YYYY-MM-DD  
**Autores:** @<agente> / <humano>  
**Contexto de iniciativa:** <initiative_id> (opcional)

## Contexto

<O que motivou esta decisão? Qual problema estávamos resolvendo?
Máx. 3 parágrafos. Sem jargão técnico desnecessário.>

## Decisão

<O que decidimos fazer? Uma frase clara no presente: "Adotamos X porque Y.">

## Consequências

### Positivas
- <benefício 1>

### Negativas / trade-offs
- <custo/limitação 1>

### Neutras
- <impacto que não é positivo nem negativo, mas relevante>

## Alternativas consideradas

| Alternativa | Por que descartada |
|---|---|
| <opção A> | <motivo> |
| <opção B> | <motivo> |

## Referências

- [<nome>](<link>) — <por que relevante>
```

### Regras de ADR
- Status `proposed` → discutir antes de implementar
- Status `accepted` → implementação pode prosseguir
- Nunca editar um ADR accepted — criar novo ADR que supersede
- ADR de infra/arquitetura: sempre linkado no `delivery-state.yaml` da iniciativa

---

## 2. CHANGELOG.md — Keep a Changelog

Formato: [keepachangelog.com](https://keepachangelog.com) + Conventional Commits.

### Estrutura do arquivo

```markdown
# Changelog

Todas as mudanças notáveis neste projeto.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento em [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added
- <feature adicionada>

### Changed
- <comportamento modificado>

### Deprecated
- <feature que será removida>

### Removed
- <feature removida>

### Fixed
- <bug corrigido>

### Security
- <correção de segurança — sempre inclui CVE-ID se aplicável>

## [X.Y.Z] — YYYY-MM-DD

...

[Unreleased]: https://github.com/org/repo/compare/vX.Y.Z...HEAD
[X.Y.Z]: https://github.com/org/repo/compare/vX.Y.Z-1...vX.Y.Z
```

### Regras do CHANGELOG
- Entradas escritas para o **usuário final**, não para o desenvolvedor
- Cada entry vinculada a PR ou issue: `(#42)`
- `Security` section primeiro se houver patch de CVE
- `@docs` atualiza `[Unreleased]` após cada PR mergeado
- `@release` move `[Unreleased]` para `[vX.Y.Z]` na release

---

## 3. business-brief.md — (@business)

Caminho: `.github/artifacts/business-brief.md`

```markdown
# Business Brief — <nome do produto/iniciativa>

**Versão:** 1.x  
**Data:** YYYY-MM-DD  
**Autores:** @business

## Problema

<Qual dor de mercado ou oportunidade estamos endereçando?
Evidências: dados, pesquisa, feedback de clientes.>

## Público-alvo

| Persona | Dor principal | Comportamento atual |
|---|---|---|
| <nome> | <dor> | <workaround hoje> |

## Proposta de valor

<Uma frase: Para <persona>, que <problema>, o <produto> é um <categoria>
que <benefício>. Diferente de <alternativa>, nosso produto <diferencial>.>

## Objetivos de negócio

| Objetivo | Métrica | Meta | Prazo |
|---|---|---|---|
| <objetivo> | <KPI> | <valor> | <data> |

## Restrições e riscos

- <restrição regulatória, técnica, orçamentária>

## Critério de sucesso mínimo (MVP)

<O que o usuário consegue fazer ao fim do MVP que não conseguia antes?>
```

---

## 4. prd.md — (@product)

Caminho: `.github/artifacts/prd.md`

```markdown
# PRD — <nome>

**Versão:** 1.x  
**Data:** YYYY-MM-DD  
**Origem:** business-brief.md

## Contexto (do Brief)

<Resumo em 2-3 linhas referenciando o brief>

## Objetivos do produto

| Objetivo | Métrica | Meta |
|---|---|---|

## Público & jornadas

### <Persona 1>
Jornada: <passo 1> → <passo 2> → <resultado>

## Escopo

### In
- <o que faz parte>

### Out (explícito)
- <o que NÃO faz parte — evita scope creep>

## Features priorizadas

Ver `feature-list.md`.

## Riscos do produto

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|

## Critérios de aceitação de alto nível

- <comportamento observável pelo usuário>
```

---

## 5. feature-list.md — (@product)

Caminho: `.github/artifacts/feature-list.md`

```markdown
# Feature List — <produto>

**Versão:** 1.x  
**Data:** YYYY-MM-DD

## Legenda de prioridade
P0 = Bloqueador de lançamento | P1 = Importante | P2 = Nice-to-have

| ID | Feature | Persona | Hipótese | Métrica de sucesso | Prioridade |
|---|---|---|---|---|---|
| F-<domínio>-<NN> | <nome curto> | <persona> | Se <ação>, então <resultado> | <métrica> | P0/P1/P2 |
```

### Regras de feature-list
- ID segue padrão: `F-BKD-01` (backend), `F-FE-01` (frontend), `F-INT-01` (integração)
- Toda feature tem hipótese mensurável — sem hipótese, não entra na lista
- Rastreável de volta ao business-brief (campo `Persona` e `Métrica`)

---

## 6. Documentação técnica geral (@docs)

### Quando criar doc vs. ADR

| Tipo de conteúdo | Artefato |
|---|---|
| Decisão de arquitetura irreversível | ADR |
| Decisão de implementação local | comentário no código |
| Guia de uso de um componente/API | `docs/<componente>.md` |
| Onboarding de novo desenvolvedor | `docs/README.md` |
| Diagrama de fluxo/sequência | `docs/architecture/sequences/<nome>.md` |

### Tom e estilo
- Segunda pessoa: "Você precisa de X" em vez de "O desenvolvedor precisa"
- Verbos no imperativo para instrução: "Execute", "Configure", "Verifique"
- Máx. 3 níveis de heading (`##`, `###`, `####`)
- Código sempre em bloco com linguagem declarada
- Sem frases passivas: "É necessário fazer" → "Faça"
