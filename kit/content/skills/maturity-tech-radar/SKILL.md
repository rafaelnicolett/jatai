---
id: maturity-tech-radar
name: maturity-tech-radar
type: skill
description: >
  ThoughtWorks-style Technology Radar — classificação de tech/práticas em 4
  rings (Adopt/Trial/Assess/Hold) × 4 quadrants (Techniques/Tools/Platforms/
  Languages-Frameworks). Tier: Lightweight.
applicable_to:
  - "@maturity-assessor"
framework_id: tech-radar
tier: lightweight
inputs:
  - tech-radar.md do @tech-mapper (stack atual)
  - arch-discovery.md
  - tech-debt.md
outputs:
  - maturity-tech-radar.md com radar HTML/Markdown e movimentos sugeridos
---

# Skill: maturity-tech-radar

> **Mapa visual da estratégia de tecnologia.**
> ThoughtWorks publica desde 2010 — modelo replicado por dezenas de orgs.

## 1. Rings

| Ring | Significado | Ação |
|---|---|---|
| **Adopt** | Maduro, deve ser usado por default | Espalhar |
| **Trial** | Vale tentar em projeto real (não-crítico) | Pilotar |
| **Assess** | Vale investigar, sem comprometer ainda | POC |
| **Hold** | Evitar começar novo uso (legacy/risco) | Decommission ou containment |

## 2. Quadrants

| Quadrant | Exemplos |
|---|---|
| **Techniques** | Trunk-based, Feature flags, Event sourcing, Strangler Fig |
| **Tools** | Renovate, OpenTelemetry, Testcontainers, ArgoCD |
| **Platforms** | Kubernetes, Cloud Run, Vercel, Supabase |
| **Languages & Frameworks** | TypeScript, Rust, FastAPI, Spring Boot, Next.js |

## 3. Critérios de classificação

| Pergunta | → Ring |
|---|---|
| Usado em produção há >12 meses sem incidente sério + time treinado? | Adopt |
| Validado em piloto + dev team curioso/capaz? | Trial |
| Promissor mas sem evidência interna? | Assess |
| Causando dor / desatualizado / sem suporte? | Hold |

## 4. Algoritmo de extração (a partir do repo)

```
Tools     → manifests (package.json, pom.xml, requirements.txt)
Platforms → IaC, Dockerfile, deploy configs
Languages → arquivos por extensão
Frameworks → imports / dependencies

Ring inicial:
  - usada em > 50% dos serviços → Adopt
  - usada em 1-50% → Trial
  - referenciada em ADR/RFC sem uso ainda → Assess
  - presente mas marcada como deprecated / sem updates há > 18m → Hold
```

## 5. Output

```markdown
# Tech Radar — 2026.05

## Adopt
### Techniques
- Trunk-based development · todo time usa, sem branches longas
- Contract testing (Pact) · adotado entre 4 serviços
- Observability via OTel · 100% dos serviços

### Tools
- Renovate · auto-update em todos repos
- pytest · 8/8 serviços Python
- ESLint + Prettier · 100% do JS/TS

### Platforms
- PostgreSQL 15 · default para novos serviços
- Cloud Run · 80% dos workloads

### Languages & Frameworks
- TypeScript · default frontend
- Python 3.12 + FastAPI · default backend novo

## Trial
- Vertical Slice Architecture · piloto em billing-svc
- Event Sourcing · POC em audit-trail
- Bun runtime · piloto em 1 serviço

## Assess
- Rust · interesse em performance crítica (router gateway)
- Temporal · workflows long-running
- pgvector · embeddings inline em PG

## Hold
- jQuery · ainda em 2 admin panels → migrar para React
- MongoDB · serviço legacy, sem novos usos
- Jenkins · em decommission, migrar para GitHub Actions

## Movimentos sugeridos próximos 6 meses
1. Trial → Adopt: Pact (já validado)
2. Hold → Decommission: jQuery, Jenkins
3. Trial novos: pgvector em casos de search
```

## 6. Anti-padrões

- ❌ Adopt sem evidência de uso bem-sucedido
- ❌ Hold em tudo "antigo" — só Hold se está machucando
- ❌ Radar virar lista de wish list (Assess inflado)
- ❌ Construir uma vez e abandonar — radar é vivo (trimestral)
