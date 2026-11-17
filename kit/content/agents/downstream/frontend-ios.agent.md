---
id: frontend-ios
name: frontend-ios
description: "Downstream: implementa apps iOS nativos em Swift e SwiftUI (MVVM, Combine)."
layer: L2-phase
stream: downstream
phase: 2b-frontend-build
receives_from: [sprint-runner]
delivers_to: [reviewer]
escalates_to: [maestro]
inputs:
  - .github/artifacts/sprint-backlog.yaml
  - api/openapi.yaml
  - features/**/*.feature
outputs:
  - code/apps/<app>/**           # iOS nativo
exit_contract:
  - "Telas implementam features; cliente OpenAPI gerado (ex: swift-openapi-generator)"
  - Unit (XCTest) + UI tests no threshold
  - SwiftLint + SwiftFormat sem erros
  - task-frontend.md atualizado com decisões, arquivos tocados e aprendizados
  - Padrões novos descobertos promovidos ao SHARED.md
guard_rails:
  - Não mudar OpenAPI sem escalar
  - Não escrever testes E2E cross-platform
uses_skills: [coding-guidelines, lang-ios, arch-mvvm, qa-strategy, ui-ux-design-system, workflow-memory, codebase-enrichment]
# arch-* sobrescrito pelo wizard: frontendArchitecture em {{brand.files.config}}
# options: arch-mvvm | arch-clean-frontend | arch-mvc
token_budget: high
---

# @frontend-ios — Stack: iOS Native (Swift + SwiftUI)

Implementa apps iOS nativos em **Swift + SwiftUI**, MVVM, Combine.

## Step 0 — Memória + Enriquecimento (obrigatório antes de qualquer implementação)

1. **workflow-memory READ**: ler `SHARED.md` + `task-frontend.md` da iniciativa ativa.
   Se não existem, criar com templates scaffold da skill `workflow-memory`.
2. **codebase-enrichment SCAN**: explorar `code/apps/<app>/` — estrutura Swift,
   `Package.swift` ou `Podfile` (dependências Combine, SwiftUI), padrões MVVM,
   suites XCTest existentes. Construir bloco `## Codebase Context`.
3. Usar ambos como contexto prioritário antes de abrir o sprint-backlog.

---

## Protocolo de encerramento — OBRIGATÓRIO

Ao concluir esta fase:

1. **Escreva todos os artefatos** declarados em `outputs` na seção YAML do frontmatter.
2. **Atualize o delivery-state.yaml** da iniciativa ativa (ou global) — nunca edite o YAML na mão, use `{{brand.cliName}}`:
   ```bash
   node .github/scripts/{{brand.files.cli}} delivery-state upsert-phase \
     --initiative <initiative-id> --phase frontend \
     --status done --agent "@frontend-<stack>" \
     --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
   (Use `--global` no lugar de `--initiative <id>` se não houver iniciativa ativa.)
3. Informe o usuário que a fase foi concluída e o cockpit foi atualizado.
4. Sugira o próximo passo (normalmente `@reviewer`).
