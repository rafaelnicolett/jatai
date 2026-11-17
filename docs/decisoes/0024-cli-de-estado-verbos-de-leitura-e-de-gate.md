# ADR-0024: Verbos de leitura e de gate no CLI de estado, com `gate_d3`

## Status

aceita em 2026-11-15, pelo titular do projeto, com as decisões da seção "Decisões do
titular". Escrita junto com a implementação, coberta por BDD e pelo golden master do
CLI.

## Contexto

- O CLI de estado (`jatai-state`) só tinha verbos de escrita: quatro de `initiatives`
  e dois de `delivery-state`. Não havia leitura (`initiatives list` dava
  `UNKNOWN_VERB`).
- Os gates da metodologia brownfield não tinham verbo:
  - D1 (Descoberta para Planejamento) é por repositório, em
    `assessment/foundation-state.yaml`, e só o Cockpit gravava;
  - D2 (Planejamento para Execução) existia como `gate_d2` na iniciativa, escrito à
    mão;
  - D3 (Execução para Operação) não existia no código.
- Sem leitura, o agente adivinha o estado antes de agir, ou lê o YAML inteiro. Sem
  verbo de gate, a aprovação humana fica em prosa ou em edição manual, e não dá para
  distinguir a auto-certificação do agente (`approved_at`) da decisão humana.

## Decisão

**1. Leitura no CLI**, local (o YAML é a fonte, [ADR-0017](0017-estado-jatai-yaml-fonte-unica-sem-sqlite.md)),
no mesmo envelope de uma linha e com os mesmos códigos de erro:

| Verbo | Devolve | Erros |
|---|---|---|
| `initiatives get [--id <id>]` | `state` (registro inteiro) ou `initiative` | `INITIATIVE_NOT_FOUND` |
| `delivery-state get (--global \| --initiative <id>) [--phase <id>]` | `state` (arquivo) ou `phase` + `state` (a fase; o alias resolve para o id canônico) | `MISSING_SCOPE`, `PHASE_NOT_FOUND` |
| `gates get --gate d1 --repo <id>` / `--gate d2\|d3 --initiative <id>` | `record` (`null` se o gate ainda não foi registrado) | `INVALID_ENUM`, `MISSING_FLAG`, `REPO_NOT_FOUND`, `INITIATIVE_NOT_FOUND` |

O HTTP e o MCP não ganham leitura nova: `GET /initiatives` e `GET /delivery-state`
(tools `get_initiatives` e `get_delivery_state`) já entregam o mesmo dado.

**2. Aprovação humana de gate**:
`gates approve --gate d1 --repo <id> | --gate d2|d3 --initiative <id> [--approved-at <ISO>] [--by <nome>] [--note <texto>]`.
- Grava `status: approved`, `approved_at` e `human_approved_at` (mais `by` e `note`,
  se vierem).
- D1 vai em `repos.<repo>.gate_d1`; D2 e D3, em `gate_d2` e `gate_d3` da iniciativa.
- Escrita sob o lock de sempre. O CLI tenta o State Service primeiro
  (`POST /gates/approve`) e cai no fallback em YAML, como os outros verbos. Os dois
  caminhos rodam o mesmo `StateCommands`.

**3. Contrato aditivo**:
- `Initiative.gate_d3` (mesmo formato do `gate_d2`; não conta como gate de
  Planejamento);
- `human_approved_at` e `by` em `PlanningGateStatus` e no `gate_d1`;
- o artefato `gates` no despacho do CLI, e `get` nas listas de verbos.

Workspaces existentes não migram. Leitores antigos ignoram os campos novos.

## Decisões do titular (2026-11-15)

1. **Sem tool MCP de aprovação.** Gate é aprovado só por pessoa: no Cockpit (decisão
   com checklist) ou pelo CLI no terminal. Agentes leem o estado do gate, nunca
   aprovam.
2. **Aprovador registrado pelo git.** O Cockpit e o CLI gravam em `by` o `user.name`
   do git do workspace (só o nome, nunca o e-mail); `--by` passa a ser só uma
   sobrescrita explícita. Sem `user.name` configurado, a aprovação pede o nome.
3. **Regra de fechamento para D1 e D2**, no espírito do D3:
   - o D1 de um repositório só aprova com as fases do Foundation daquele repositório
     concluídas;
   - o D2 só aprova com `roadmap_gate` e `risk_matrix_gate` aprovados.
   Fora disso, o comando recusa com um erro de uso que lista o que falta.

Os itens 2 e 3 são comportamento novo: entram num PR próprio, com BDD antes.

## Consequências

- (+) Agentes leem o estado sem adivinhar, e D2 e D3 deixam de ser edição manual.
- (+) A decisão humana fica registrada à parte da auto-certificação do agente
  (`human_approved_at` × `approved_at`).
- (−) O golden master do CLI muda nas listas de artefatos e de verbos, e ganha
  cenários.
- (−) Ferramentas das versões 0.9.x do produto anterior não conhecem `gates` nem
  `gate_d3`.

Veja [gates](../metodologia/gates.md).
