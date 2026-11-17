---
id: security-best-practices
name: security-best-practices
type: skill
description: >
  Padrões de segurança aplicados por @security e @devops. Cobre OWASP Top 10,
  detecção de secrets, threat modeling e checklist de hardening. Produz relatório
  estruturado em .github/artifacts/security/.
applicable_to:
  - "@security — scan completo antes de aprovar PR ou release"
  - "@devops   — hardening de pipelines e infra antes do gate G2"
inputs:
  - code/**
  - infrastructure/**
  - dependency manifests (pyproject.toml, pom.xml, package.json, etc.)
outputs:
  - .github/artifacts/security/<scan-id>.md
---

# Skill: security-best-practices

> Segurança não é fase. É gate em cada PR. Se @security não deu green, PR não merge.

---

## 1. OWASP Top 10 — checklist por camada

Para cada PR/release, verificar os itens relevantes à mudança:

### A01 — Broken Access Control
- [ ] Todos os endpoints têm verificação de autenticação **e** autorização
- [ ] Não há endpoint que retorne dados de outro tenant (multi-tenancy)
- [ ] RBAC aplicado antes da lógica de negócio, não depois
- [ ] Paths de admin não são acessíveis por roles de usuário

### A02 — Cryptographic Failures
- [ ] Senhas/API Keys nunca armazenadas em plaintext (bcrypt/argon2 com custo ≥12)
- [ ] Comunicação inter-serviços usa TLS
- [ ] Dados PII em repouso: criptografados ou mascarados em logs
- [ ] Chaves criptográficas rotacionáveis (não hardcoded)

### A03 — Injection
- [ ] Queries SQL: ORM parameterizado ou prepared statements — **nunca** f-string em SQL
- [ ] Inputs de usuário: validados por Pydantic/schema antes de qualquer processamento
- [ ] HTML output: escape automático (Jinja2 autoescaping, React JSX)
- [ ] Comandos de sistema: `subprocess` com lista (não string) + sem shell=True

### A04 — Insecure Design
- [ ] Rate limiting em todos os endpoints públicos
- [ ] Limitação de tamanho de payload (ex: upload ≤ 10 MB)
- [ ] Não há lógica de negócio crítica executada no cliente sem validação server-side

### A05 — Security Misconfiguration
- [ ] CORS configurado explicitamente (não `*` em produção)
- [ ] Debug mode / stack traces desabilitados em produção
- [ ] Headers de segurança presentes: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`
- [ ] Portas desnecessárias fechadas no IaC

### A06 — Vulnerable Components
- [ ] Dependências auditadas (ver skill `security-cve-checker`)
- [ ] Imagens Docker com base slim/distroless, não `latest`
- [ ] Sem dependências sem manutenção ativa (> 2 anos sem release)

### A07 — Authentication Failures
- [ ] JWT com expiração curta (≤ 1h access token) e refresh rotation
- [ ] Refresh tokens invalidados no logout
- [ ] Brute force protegido com exponential backoff ou lockout
- [ ] MFA disponível para ações críticas (admin, billing)

### A08 — Software and Data Integrity Failures
- [ ] Dependências com hash pinado em lock files (poetry.lock, package-lock.json)
- [ ] Sem `eval()` ou execução dinâmica de string como código
- [ ] Pipeline com verificação de assinatura de artefatos

### A09 — Security Logging and Monitoring Failures
- [ ] Eventos de autenticação logados (sucesso e falha)
- [ ] Logs não contêm secrets, tokens ou PII
- [ ] Alertas configurados para erros 4xx em massa (possível ataque)

### A10 — Server-Side Request Forgery (SSRF)
- [ ] URLs fornecidas pelo usuário nunca fazem request direto no servidor
- [ ] Allowlist de hosts externos se integração com webhooks/callbacks

---

## 2. Detecção de secrets

Padrões que NUNCA devem aparecer em código ou logs:

```
# Padrões críticos a detectar (regex)
(password|passwd|pwd)\s*=\s*['"][^'"]{4,}['"]
(secret|api_key|apikey|token)\s*=\s*['"][^'"]{8,}['"]
ghp_[A-Za-z0-9]{36}               # GitHub tokens
AKIA[0-9A-Z]{16}                   # AWS Access Key IDs
-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----
```

### Ferramentas de referência
- `gitleaks` — scan do histórico git + diff
- `trufflehog` — entropia + padrões pré-definidos
- `detect-secrets` (Yelp) — para Python

### Ação ao detectar secret
1. Não aprovar PR
2. Registrar no relatório com: arquivo, linha, tipo de secret (sem expor o valor)
3. Orientar rotação imediata da credencial exposta
4. Recomendar adição ao `.gitignore` se for arquivo de env local

---

## 3. Threat Modeling pontual (STRIDE lite)

Para mudanças que introduzem novo endpoint, integração ou fluxo de dados:

| Ameaça | Pergunta a responder |
|---|---|
| **S**poofing | Quem pode se passar por outro usuário/serviço aqui? |
| **T**ampering | Quem pode modificar os dados em trânsito ou em repouso? |
| **R**epudiation | Há log de auditoria para esta ação? |
| **I**nformation Disclosure | Quais dados sensíveis podem ser expostos por esta mudança? |
| **D**enial of Service | É possível causar DoS com este endpoint sem autenticação? |
| **E**levation of Privilege | Este endpoint pode ser usado para escalar permissões? |

Resultado do threat modeling: adicionar à seção **Riscos** do relatório de segurança.

---

## 4. Estrutura do relatório de saída

Salvar em `.github/artifacts/security/<scan-id>.md`:

```markdown
# Security Scan — <scan-id>

**Data:** <ISO>  
**Agente:** @security  
**Escopo:** <PR #N | Release vX.Y.Z | Sprint SN>  
**Resultado:** ✅ GREEN | ⚠️ AMARELO | 🚫 RED

## Resumo

| Categoria | Status | Achados |
|---|---|---|
| OWASP Top 10 | ✅/⚠️/🚫 | <n> |
| Secrets | ✅/🚫 | <n> |
| CVEs críticos | ✅/⚠️/🚫 | <n> |

## Achados

### Bloqueantes (impedem aprovação)
- [OWASP-A03] arquivo.py:42 — SQL query construída com f-string

### Não-bloqueantes (recomendações)
- [OWASP-A09] Evento de login sem log de IP de origem

## Threat Model (se aplicável)

<resultados STRIDE lite para mudanças estruturais>

## Decisão

**@security**: <APPROVED | CHANGES REQUESTED>  
Razão: <uma linha>
```

---

## 5. Regras de severidade

| Severidade | Critério | Ação |
|---|---|---|
| **Crítico** | Secret detectado, SQL injection, auth bypass | Bloquear imediatamente, não merge |
| **Alto** | CVE CVSS ≥ 9, OWASP A01-A04 violado | Bloquear PR, fix obrigatório |
| **Médio** | CVE CVSS 7-8.9, configuração subótima | Não bloqueia, recomendado corrigir no mesmo sprint |
| **Baixo** | CVE CVSS < 7, melhoria de hardening | Registrar, corrigir no próximo ciclo |
