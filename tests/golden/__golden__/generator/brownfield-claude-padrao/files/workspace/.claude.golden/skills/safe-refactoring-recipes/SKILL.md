---
id: safe-refactoring-recipes
name: safe-refactoring-recipes
type: skill
description: >
  Catálogo de receitas de refactoring (Fowler — Refactoring 2nd ed.) com
  protocolo test-first. Cada receita: motivação, mecânica passo-a-passo,
  rollback. Aplicável a qualquer linguagem. Usada por @refactor-agent.
applicable_to:
  - "@refactor-agent"
  - "@migration-agent"
inputs:
  - código com cobertura de characterization tests
outputs:
  - refactor incremental, cada passo commitado
---

# Skill: safe-refactoring-recipes

> **"Pre-condition: tests in place."** — Martin Fowler
> Nunca refatore sem rede.

## 1. Protocolo geral

```
1. Tests passam (verde)
2. Aplique 1 step da mecânica
3. Compile / lint
4. Tests passam (verde)
5. Commit (atômico — 1 step = 1 commit)
6. Próximo step
```

**Se ficou vermelho**: reverta o último step (não tente "consertar").

## 2. Receitas — Composing Methods

### Extract Method
- **Quando**: bloco com comentário explicando o que faz; bloco usado em ≥ 2 lugares.
- **Mecânica**:
  1. Criar método novo, nome reflete intenção (não implementação)
  2. Copiar bloco
  3. Resolver vars locais (parâmetros ou retorno)
  4. Substituir bloco original por chamada
  5. Tests / commit

### Inline Method
- **Quando**: método trivial não agrega clareza.
- **Mecânica**: substituir chamadas pelo corpo; deletar método.

### Extract Variable
- **Quando**: expressão complexa em condição/cálculo.
- **Mecânica**: introduzir variável `final/const` com nome significativo.

### Replace Temp with Query
- **Quando**: temp local pode virar método (reutilizável).

## 3. Receitas — Moving Features

### Move Method / Move Field
- **Quando**: método usa mais a outra classe do que a própria.
- **Mecânica**:
  1. Verificar deps do método
  2. Criar método na classe destino
  3. Original delega para destino (compatibilidade)
  4. Atualizar callers
  5. Inline o delegate
  6. Commit por etapa

### Extract Class
- **Quando**: classe com 2 responsabilidades.

### Inline Class
- **Quando**: classe não justifica existência.

## 4. Receitas — Organizing Data

### Rename Variable / Field / Method / Class
- **Mecânica**: usar refactor da IDE (semântico) ou:
  1. Criar novo com nome novo
  2. Antigo delega para novo
  3. Atualizar callers
  4. Remover antigo
- **Importante**: 1 rename = 1 commit.

### Replace Magic Number with Symbolic Constant

### Encapsulate Field / Encapsulate Collection

## 5. Receitas — Simplifying Conditionals

### Decompose Conditional
- **Quando**: condicional grande e/ou condição complexa.
- **Mecânica**: extract method para condição, then-branch, else-branch.

### Consolidate Conditional Expression
- **Quando**: várias checagens levam ao mesmo resultado.

### Replace Conditional with Polymorphism
- **Quando**: switch sobre type code.
- **Mecânica**: hierarquia + cada caso vira override.

### Replace Nested Conditional with Guard Clauses
- **Quando**: pirâmide de ifs.

### Introduce Null Object / Special Case

## 6. Receitas — Making Method Calls Simpler

### Rename Method (semântica)
### Separate Query from Modifier
### Parameterize Method
### Replace Parameter with Explicit Methods
### Preserve Whole Object
### Replace Constructor with Factory Method

## 7. Receitas — Dealing with Generalization

### Pull Up Method / Push Down Method
### Extract Superclass / Extract Interface
### Replace Inheritance with Delegation
### Replace Delegation with Inheritance

## 8. Pré-condições obrigatórias

| Condição | Por quê |
|---|---|
| Tests cobrindo escopo (≥70%) | Detectar regressão |
| Tests passam antes de começar | Baseline limpo |
| Branch dedicado | Isolamento |
| Commits atômicos por step | Rollback granular |
| Build/lint rodando local | Feedback rápido |
| PR pequena (≤ 400 LOC) | Reviewability |

## 9. Sinais para PARAR

- Step falhou → reverta, não tente consertar
- Você está modificando comportamento (não é refactor — é feature)
- Cobertura caiu → adicione testes antes de continuar
- Você não consegue explicar a próxima receita → estude antes
- PR passou de 400 LOC → mergeie o que tem, abra outro

## 10. Anti-padrões

- ❌ Refactor + feature na mesma PR
- ❌ Steps grandes ("vou refatorar essa classe inteira")
- ❌ Commits "WIP" não atômicos
- ❌ Refactor "estético" sem driver (hotspot ou bug)
- ❌ Mudar interface pública sem deprecation
