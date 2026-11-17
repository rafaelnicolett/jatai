# Gates de Qualidade — orbita

Os gates são **obrigatórios** e validados pelos Guardians antes de cada transição de stream.

## G1: Upstream → Downstream

**Trigger**: `@sprint-planner` declara `exit_contract` cumprido

**Validadores**:
- `@stream-align` — valida alinhamento de negócio (BDD ↔ PRD, métricas rastreáveis)
- `@arch-cross` — valida coerência técnica cross-stack (arquitetura ddd-tactical aplicada)

**Artefatos obrigatórios**:
- `.github/artifacts/business-brief.md`
- `.github/artifacts/prd.md`
- `docs/domain/bounded-contexts.md`
- `features/**/*.feature` (pelo menos 1 cenário)
- `api/openapi.yaml` (contrato completo)
- `.github/artifacts/sprint-backlog.yaml`

**Output**: `.github/artifacts/gates/g1-<timestamp>.md` (aprovado/rejeitado + motivos)

---

## G2: Downstream → Operation

**Trigger**: `@sprint-runner` confirma merge de todos os PRs da sprint

**Validadores**:
- `@stream-align` — valida rastreabilidade (código ↔ BDD ↔ PRD)
- `@arch-cross` — valida conformidade arquitetural (backend ddd-tactical, frontend clean-frontend)

**Artefatos obrigatórios**:
- Código implementado conforme arquitetura escolhida
- Testes passando (unit + integration mínimo 80% coverage)
- PRs aprovados pelo `@reviewer`
- Build verde no CI/CD

**Output**: `.github/artifacts/gates/g2-<timestamp>.md`

---

**Os gates NÃO são opcionais.** Se falhar, o `@maestro` reabre a fase anterior.
