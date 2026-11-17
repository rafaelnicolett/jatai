---
id: commit-assistant
name: commit-assistant
type: skill
description: >
  Conventional Commits, Semantic Versioning e Release Notes para o @release.
  Define as regras de bump de versão, formato de commits, geração de tag e
  estrutura das release notes publicadas.
applicable_to:
  - "@release — criação de tag semver, release notes e publicação de artefato"
inputs:
  - CHANGELOG.md
  - git log (commits desde a última tag)
  - .github/artifacts/sprint-backlog.yaml
outputs:
  - tag vX.Y.Z
  - release notes (GitHub Release / arquivo)
---

# Skill: commit-assistant

> Tag sem release notes é ruído. Release notes sem semver é caos.

---

## 1. Conventional Commits — formato obrigatório

Todos os commits do projeto seguem [Conventional Commits v1.0](https://www.conventionalcommits.org/pt-br/v1.0.0/).

### Estrutura

```
<type>(<scope>): <descrição>

[corpo opcional — após linha em branco]

[footers opcionais — BREAKING CHANGE, Closes #N]
```

### Types permitidos

| Type | Impacto semver | Quando usar |
|---|---|---|
| `feat` | **minor** | Nova funcionalidade para o usuário |
| `fix` | **patch** | Correção de bug para o usuário |
| `perf` | **patch** | Melhoria de performance sem nova feature |
| `refactor` | nenhum* | Reestruturação sem mudança de comportamento |
| `docs` | nenhum* | Somente documentação |
| `test` | nenhum* | Adição/correção de testes |
| `chore` | nenhum* | Build, deps, CI — sem mudança de produto |
| `ci` | nenhum* | Mudanças em pipeline |
| `revert` | depende | Reversão de commit anterior |
| `BREAKING CHANGE` | **major** | Footer ou `!` no type — ex: `feat!:` |

*nenhum = não bumpa versão automaticamente, mas pode ser incluído no changelog.

### Scopes recomendados por camada

| Scope | Exemplos |
|---|---|
| `api` | `feat(api): add POST /tenants/{id}/invitations` |
| `auth` | `fix(auth): rotate refresh token on each use` |
| `db` | `chore(db): add migration for api_keys table` |
| `ui` | `feat(ui): add dark mode toggle to settings` |
| `infra` | `ci(infra): add Terraform staging deploy stage` |
| `security` | `fix(security): patch CVE-2026-XXXX in requests` |
| `deps` | `chore(deps): bump pydantic from 2.5.0 to 2.7.0` |

### Exemplos corretos

```
feat(api): add bulk template import endpoint

Allows uploading up to 50 templates in a single request.
Validation runs per-template; partial success is reported.

Closes #142
```

```
fix(auth): prevent session fixation on login

Session ID was not rotated after successful authentication.
Now issues new session token post-login.

Closes #187
BREAKING CHANGE: existing sessions invalidated on deploy
```

---

## 2. Semantic Versioning — regras de bump

Versão no formato `MAJOR.MINOR.PATCH` seguindo [semver.org](https://semver.org/lang/pt-BR/).

### Algoritmo de bump

```
1. Há algum commit com BREAKING CHANGE footer ou type!?
   → MAJOR bump (X+1.0.0)
   → SOMENTE com aprovação explícita do @maestro

2. Há algum commit com type feat (sem breaking change)?
   → MINOR bump (X.Y+1.0)

3. Há algum commit com type fix, perf, security fix?
   → PATCH bump (X.Y.Z+1)

4. Somente docs/chore/ci/refactor/test?
   → Sem bump automático (release opcional: X.Y.Z-rc.N ou manter)
```

### Versões de pré-release

| Sufixo | Quando usar |
|---|---|
| `v1.2.0-alpha.1` | Feature incompleta, não testada |
| `v1.2.0-beta.1` | Feature completa, em validação com usuários |
| `v1.2.0-rc.1` | Release candidate — só bug fixes críticos |

### Versão 0.x
- `0.MINOR.PATCH` — API pública ainda instável, breaking changes esperados
- Migrar para `1.0.0` somente quando API pública for estável e documentada

---

## 3. Protocolo de release (@release)

### Pré-condições (verificar antes de criar a tag)

- [ ] Gate G2 aprovado por `@stream-align` e `@arch-cross`
- [ ] CI verde no branch principal (todos os stages passando)
- [ ] `@security` green (scan de CVEs limpo)
- [ ] `CHANGELOG.md` com seção `[Unreleased]` preenchida
- [ ] Sem PR aberto com label `do-not-merge`

### Passos

```
1. Determinar o tipo de bump (seção 2)
2. Calcular nova versão: <current-version> → <new-version>
3. Atualizar CHANGELOG.md:
   - Renomear [Unreleased] → [vX.Y.Z] — YYYY-MM-DD
   - Criar nova seção [Unreleased] vazia acima
   - Adicionar link de comparação no rodapé
4. Criar commit de release:
   chore(release): bump version to vX.Y.Z
5. Criar tag anotada:
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
6. Publicar GitHub Release com release notes geradas
7. Publicar artefato (Docker image, npm package, VS Code extension, etc.)
```

---

## 4. Release Notes — template

```markdown
## vX.Y.Z — YYYY-MM-DD

### ✨ Novidades

- **<Feature principal>**: <descrição de 1-2 frases no vocabulário do usuário>
  → PR #N

### 🐛 Correções

- **<Bug corrigido>**: <o que foi corrigido e qual era o impacto>
  → PR #N

### 🔒 Segurança

- Patch para CVE-XXXX-YYYY em `<pacote>` (CVSS X.X)
  → PR #N

### ⚠️ Breaking Changes

> **Ação necessária** antes de atualizar:

- **<mudança>**: <o que muda e como migrar>

### 📦 Dependências atualizadas

- `<pacote>`: X.Y.Z → X.Y.Z+1

---

**Instalação / Atualização:**
\`\`\`
<comando de instalação/atualização>
\`\`\`

**Artefato:** [Download vX.Y.Z](<link>)
```

### Regras de release notes
- Linguagem do **usuário final**, não do desenvolvedor
- Breaking changes com instrução de migração — sem exceção
- Links diretos para cada PR mencionado
- Sem commits de `chore`/`ci`/`docs` nas release notes (ruído)
- Seção `🔒 Segurança` sempre primeiro se houver patch de CVE

---

## 5. Publicação de artefato por tipo

| Tipo de artefato | Onde publicar | Comando |
|---|---|---|
| Docker image | GHCR / Docker Hub | `docker push <registry>/<image>:<tag>` |
| Python package | PyPI | `poetry publish` |
| npm package | npm registry | `npm publish --tag latest` |
| VS Code extension | VS Code Marketplace | `vsce publish` |
| GitHub Release | GitHub | via API ou `gh release create` |

### Verificação pós-publicação
- Confirmar que a tag existe no repositório remoto
- Confirmar que o artefato está acessível no registry/store
- Registrar no `delivery-state.yaml`:
  ```yaml
  phases:
    release:
      status: done
      tag: vX.Y.Z
      artifact_url: <link>
      completed_at: <ISO>
  ```
