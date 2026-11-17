---
id: arch-pattern-detection
name: arch-pattern-detection
type: skill
description: >
  Heurísticas para inferir padrões arquiteturais (Hexagonal, Layered, DDD-tactical,
  MVC, MVVM, Feature-based, Vertical Slice, Clean-frontend) a partir de estrutura
  de pastas, nomes e imports. Não impõe — descobre. Usada por @arch-discoverer.
applicable_to:
  - "@arch-discoverer"
inputs:
  - estrutura de diretórios
  - imports/uses do código
outputs:
  - padrão identificado + confiança % + skill arch-* aplicável
---

# Skill: arch-pattern-detection

> **Inferência, não imposição.**
> Se o projeto está 60% layered + 30% hexagonal + 10% caos, reporte isso.

## 1. Matriz de sinais por padrão

### Hexagonal (Ports & Adapters)
- Pastas: `domain/`, `ports/in/`, `ports/out/`, `adapters/in/`, `adapters/out/`, `application/`
- Imports: `domain/` **nunca** importa `adapters/` ou framework
- Confiança alta se 3+ sinais

### Layered (Clean clássico)
- Pastas: `controller/`, `service/`, `repository/` (ou `dao/`)
- Fluxo: controller → service → repository
- Camada de domínio fraca ou inexistente
- Comum em Spring Boot, ASP.NET, NestJS, Express MVC

### DDD-tactical
- Pastas: `<context>/aggregate/`, `<context>/entity/`, `<context>/vo/`, `<context>/repository/`, `<context>/domain-event/`
- Múltiplos bounded contexts em subpastas
- Repositórios por aggregate (não por entity)
- Domain Events presentes

### MVC clássico
- Pastas: `models/`, `views/`, `controllers/`
- Framework MVC explícito (Rails, Django, ASP.NET MVC, Laravel)

### MVVM
- Pastas: `viewmodel/`, `view/`, `model/`
- Observable/binding (LiveData, StateFlow, @Observable, BehaviorSubject)
- iOS SwiftUI/UIKit, Android Compose, WPF, React+MobX

### Feature-based
- Pastas: `features/<feature-x>/`, `features/<feature-y>/`
- Cada feature contém seus próprios components/services/tests
- `shared/` ou `common/` com regras estritas
- Sem `controllers/` ou `services/` globais

### Vertical Slice (.NET style)
- Pastas: `Features/<X>/{Command,Query,Handler,Validator}.cs`
- Uso de MediatR ou similar
- Cada slice auto-contido

### Clean-frontend
- Pastas em front: `data/`, `domain/`, `presentation/`
- Inversão de dependência (presentation depende de domain, não o contrário)
- Comum em Flutter, Angular avançado

### Ad-hoc
- Nenhum dos acima com confiança > 50%
- Estrutura inconsistente / mistura caótica

## 2. Algoritmo de scoring

```
para cada padrão:
  score = 0
  para cada sinal positivo presente: score += peso(sinal)
  para cada sinal contraditório: score -= peso(sinal)
  confiança% = clamp(score / max_score, 0, 100)

reportar padrão principal (maior confiança) + secundários se > 30%
```

## 3. Anti-padrões a destacar

| Anti-padrão | Detecção |
|---|---|
| God module | dir com >5000 LOC ou >50 arquivos diretos |
| Circular deps | ciclo no grafo de imports |
| Leaky abstraction | `domain/` importa framework |
| Anemic domain | classes em `model/` só com props e get/set |
| Service explosion | >50 classes terminadas em `Service` |
| Shotgun surgery | feature exige editar >10 arquivos em pastas diferentes |

## 4. Output sugerido

```markdown
## Padrão identificado
Principal: Layered (confiança: 72%)
Secundário: parcialmente DDD (28%) — apenas no contexto `billing/`

## Sinais positivos (Layered)
- ✅ controller/ presente em todos os módulos
- ✅ service/ separado de repository/
- ✅ fluxo top-down nos imports

## Sinais contraditórios
- ❌ domain/ vazio em 4 de 6 módulos
- ❌ services importam framework diretamente

## Skill aplicável p/ Execution
- `arch-layered` (manter consistência)
- Para o contexto `billing/`: considerar evoluir p/ `arch-ddd-tactical`
```
