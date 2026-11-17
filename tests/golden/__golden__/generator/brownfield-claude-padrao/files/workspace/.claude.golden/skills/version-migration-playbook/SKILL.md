---
id: version-migration-playbook
name: version-migration-playbook
type: skill
description: >
  Playbook de upgrades de versão major em runtimes/frameworks comuns: Java
  8→21, Spring Boot 2→3, Python 2→3, Node 14→20, .NET Framework→.NET 8, React
  classes→hooks. Sempre via Expand-Contract + characterization tests. Usada
  por @migration-agent.
applicable_to:
  - "@migration-agent"
  - "@modernization-planner"
inputs:
  - tech-radar.md (versões atuais e target)
  - cobertura mínima de characterization tests
outputs:
  - plano de migração passo-a-passo com rollback
---

# Skill: version-migration-playbook

> **Toda migração é Expand-Contract.**
> Nunca substitua a versão antiga sem antes coexistir com a nova.

## 1. Princípios universais

1. **Pre-flight**: cobertura ≥ 70% no escopo
2. **Read release notes**: breaking changes oficiais
3. **Dependency tree first**: deps que ainda não suportam target = bloqueio
4. **Branch by Abstraction** se houver troca de lib junto
5. **Steps incrementais**: 1 versão por vez (8→11→17→21, não 8→21)
6. **CI dual**: rodar pipeline na versão antiga E nova até cutover
7. **Feature flags** para isolar comportamento novo

## 2. Java 8 → 21

### Pulos seguros
- 8 → 11 → 17 → 21 (LTS por LTS)

### Quebras críticas
| De | Para | Quebras |
|---|---|---|
| 8 | 11 | `javax.xml.bind` removido (use Jakarta XML Bind), `sun.*` proibido, módulos JPMS |
| 11 | 17 | `sealed`, `pattern matching`, deprecated `Applet`, GC mudanças |
| 17 | 21 | virtual threads (opt-in), pattern matching switch, removed `SecurityManager` |

### Steps
1. Atualizar Gradle/Maven (Maven 3.9+, Gradle 8+)
2. Atualizar plugins do build (surefire, failsafe, compiler)
3. Trocar `javax.*` → `jakarta.*` se Spring Boot 3
4. Substituir `sun.*` por APIs públicas
5. CI matrix nas duas versões
6. Subir versão LTS por LTS

## 3. Spring Boot 2.7 → 3.x

### Pré-requisito
- Java 17+ obrigatório

### Quebras críticas
- Jakarta EE 9 (`javax.*` → `jakarta.*`)
- Spring Security 6: `WebSecurityConfigurerAdapter` deprecated
- `application.properties` keys renomeadas
- Trace via Micrometer Tracing (não Spring Cloud Sleuth)
- Hibernate 6 (HQL stricter)

### Steps
1. Migrar Java para 17
2. Rodar `spring-boot-migrator` ou OpenRewrite recipe
3. Renomear `javax.*` → `jakarta.*` em todo o código
4. Atualizar Security config (SecurityFilterChain bean)
5. Atualizar properties (use `spring-boot-properties-migrator`)
6. Substituir Sleuth → Micrometer Tracing
7. Validar Hibernate (HQL queries)

## 4. Python 2 → 3

> Suporte oficial Python 2 acabou em 2020. Migração é mandatória.

### Steps
1. `python -m future` ou `2to3` para análise inicial
2. Garantir todas deps suportam Py3 (pip-compile dual)
3. Migrar arquivo por arquivo com `from __future__ import`
4. Strings → bytes/str distinction obrigatória
5. `print` statement → função
6. Division: `/` agora é float, `//` é integer
7. Dict views (.keys() não é list)
8. Substituir `dict.iteritems()` → `items()`
9. Excepções: `except Exception as e`
10. CI rodando em ambos até cutover

## 5. Node 14 → 20

### Quebras críticas
| De | Para | Quebras |
|---|---|---|
| 14 | 18 | OpenSSL 3.0 (legacy ciphers fora), fetch built-in, undici |
| 18 | 20 | `--watch` mode, `node:` prefix obrigatório em alguns contextos |

### Steps
1. Atualizar `engines` em package.json
2. Atualizar deps com `npm-check-updates`
3. Substituir libs deprecated (`request` → `undici`/`fetch`)
4. Testar OpenSSL: remover ciphers legados
5. CI matrix 14 + 20 → cutover

## 6. .NET Framework 4.x → .NET 8

> Caminho longo; via .NET Standard 2.0 ou diretamente?

### Steps
1. Inventário com `try-convert` da Microsoft
2. Identificar deps Windows-only (System.Web, WCF Server, WF) — sem equivalência
3. Strangler Fig: novos endpoints em .NET 8, antigos no Framework
4. Substituir `System.Web` → `Microsoft.AspNetCore`
5. Substituir `app.config` → `appsettings.json`
6. Substituir DI custom → `Microsoft.Extensions.DependencyInjection`
7. Migrar EF6 → EF Core (cuidado: comportamentos divergentes)

## 7. React Classes → Hooks (mesmo runtime)

### Steps por componente
1. Trocar `componentDidMount` → `useEffect([])`
2. `componentDidUpdate` → `useEffect([deps])`
3. `componentWillUnmount` → return de `useEffect`
4. `this.state` → `useState`
5. `this.props` → argumentos
6. HOCs → custom hooks
7. Testes: trocar enzyme por testing-library

## 8. Schema/DB migrations (Expand-Contract)

```
1. EXPAND: adicionar nova coluna/tabela (nullable)
2. BACKFILL: popular dado (batch)
3. DUAL-WRITE: app escreve nos dois
4. SHADOW-READ: app lê do novo, compara com antigo (logging)
5. SWITCH-READ: app lê só do novo
6. STOP DUAL-WRITE: app escreve só no novo
7. CONTRACT: drop do antigo (após N dias/release)
```

## 9. Plano de rollback obrigatório

Para cada step, documente:

```markdown
- Step: ...
- Risco: ...
- Sinal de falha: ...
- Comando de rollback: ...
- Tempo máximo de detecção: ...
- Owner: ...
```

## 10. Anti-padrões

- ❌ Big bang upgrade (8 → 21 num PR só)
- ❌ Migrar dep antes de ter cobertura
- ❌ Cutover sem dual-write/shadow-read em DB
- ❌ Pular LTS intermediário "pra ir mais rápido"
- ❌ Migrar sem ler release notes
