---
id: characterization-testing
name: characterization-testing
type: skill
description: >
  Testes de caracterização (Michael Feathers — Working Effectively with Legacy
  Code) — pinam o comportamento atual do sistema, mesmo se estiver errado, antes
  de qualquer refactor. Golden master, approval tests, snapshot. Usada por
  @test-backfill-agent.
applicable_to:
  - "@test-backfill-agent"
  - "@refactor-agent"
inputs:
  - código legado sem cobertura
  - seam points identificados
outputs:
  - testes que capturam comportamento atual
  - relatório de cobertura adicionada
---

# Skill: characterization-testing

> **"Tests that pin existing behavior, even if buggy."** — Michael Feathers
> Você não precisa entender o código pra testá-lo. Precisa observar o que ele faz.

## 1. Filosofia

- Antes de refatorar legado: **caracterize**.
- Não tente decidir se o comportamento é "certo" — capture o que **é**.
- Bugs viram especificação documentada (com `# BUG: caracterizado em test_x`).
- Quando o teste quebrar, você sabe o que mudou.

## 2. Técnicas

### a) Golden Master
1. Execute o sistema com input X.
2. Capture output como `expected.txt` (commit).
3. Teste compara output atual com expected.
4. Qualquer mudança quebra → análise manual.

Aplica a: batch jobs, geradores de relatório, pipelines, compiladores.

### b) Approval Tests
- Bibliotecas: ApprovalTests (Java/.NET/Python/JS).
- Output do método é serializado e comparado com `*.approved.txt`.
- Diff visual fácil de revisar.

### c) Snapshot Testing
- Jest/Vitest `toMatchSnapshot`, pytest `syrupy`.
- Ideal para UI, JSON responses, AST.

### d) Property-based subset
- Quando comportamento é simples, propriedade pode pinar (ex: idempotência, comutatividade).

## 3. Seams (Michael Feathers)

**Seam** = ponto no código onde você pode alterar comportamento **sem editar** aquele código.

| Tipo | Como |
|---|---|
| Object Seam | Injetar mock/fake via constructor |
| Preprocessing Seam | Macros (C/C++) |
| Link Seam | Substituir biblioteca em link time |
| Method Seam (Sprout/Wrap) | Sprout Method / Sprout Class para isolar mudança |

**Sprout Method** (Feathers):
1. Não consegue testar método existente?
2. Crie método novo (sprout) que faz a mudança.
3. Chame o sprout do método antigo.
4. Teste só o sprout.

## 4. Workflow recomendado

```
1. Identificar arquivo a refatorar (vindo de hotspot)
2. Mapear inputs/outputs observáveis (API, DB, files, stdout)
3. Escolher técnica (golden master para batch / approval para retorno / snapshot para UI)
4. Capturar baseline (rodar e gravar)
5. Commitar baseline como expected
6. Verificar que teste passa rodando 3x (não-determinismo?)
7. Documentar bugs caracterizados (BUG-001: comportamento inesperado X)
8. ENTÃO refatorar
```

## 5. Lidar com não-determinismo

| Fonte | Solução |
|---|---|
| Timestamps | Mockar relógio (Clock injetado) |
| UUIDs | Injetar gerador determinístico |
| Ordem de dicts/sets | Sort antes de comparar |
| Datas locais | Fixar TZ no teste |
| External calls | Stub/VCR/cassette |
| Concorrência | Single-thread no teste; ou snapshot de set ordenado |

## 6. Critérios de pronto

Antes de declarar caracterização completa para um escopo:
- [ ] Cobertura ≥ 70% do escopo (ou 100% dos caminhos críticos)
- [ ] Roda 5x seguidas sem flaky
- [ ] Bugs caracterizados explicitamente marcados
- [ ] Tempo de execução < 60s (para feedback rápido durante refactor)
- [ ] Tudo commitado antes de qualquer linha de refactor

## 7. Anti-padrões

- ❌ Refatorar e escrever teste depois ("vou ver se quebra")
- ❌ Testar implementação (vai quebrar no refactor — teste comportamento)
- ❌ Caracterizar com 5% de cobertura e refatorar mesmo assim
- ❌ Apagar bugs no expected porque "agora está certo" — fix em PR separado
- ❌ Ignorar não-determinismo ("roda de novo até passar")
