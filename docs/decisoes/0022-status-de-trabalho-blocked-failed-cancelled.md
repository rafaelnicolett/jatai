# ADR-0022: Status de trabalho `blocked`, `failed` e `cancelled`, validados na escrita

## Status

aceita em 2026-11-15, pelo titular do projeto, para a v1. A semântica segue o que o
design system v2 já mostra (bloqueado é condição do cartão, com o motivo em texto) e
o contrato de atividade de agente do mapa (o evento `blocked`).

## Contexto

- Cada artefato tinha um vocabulário de status próprio:
  - **fase de delivery** (`delivery-state.yaml`): `pending`, `in-progress`, `done`,
    `skipped` (`src/core/contracts/delivery-state-contract.pure.ts`,
    `DELIVERY_PHASE_STATUSES`);
  - **iniciativa** (`initiatives.yaml`): `planned`, `in-progress`, `done`, `paused`;
  - **item de onda ou tarefa** (`wave_status`, `epic_status`): **texto livre** na
    escrita (CLI, State Service e MCP);
  - **item de sprint** (`sprint-backlog`): `backlog`, `in-progress`, `review`,
    `done`, `blocked`, `descoped`;
  - **fase do Foundation**: `done`, `agent-done`, `in-progress`, `pending`.
- Um valor fora do enum era rebaixado em silêncio: uma fase virava `pending` e uma
  iniciativa virava `planned`. Em item de onda, `--status finished` era aceito na
  escrita e depois lido como `pending`.
- Faltava como dizer "parou por causa de algo" e "o agente tentou e falhou". Sem
  isso, um agente travado aparecia como pendente, o Cockpit não mostrava o bloqueio
  que o design system v2 desenhou, e o mapa não pintava a abelha parada.
- A validação já existia para fases e iniciativas: CLI (`requireEnum`), State Service
  (`validateRequiredEnum`) e MCP (`z.enum`, que entra no snapshot congelado de
  `tools/list`).

## Decisão

**1. Um vocabulário de trabalho para fase de delivery e para item de onda ou tarefa:**

| Status | Terminal | Quando | Exige |
|---|---|---|---|
| `pending` | não | ainda não começou | — |
| `in-progress` | não | alguém (agente ou pessoa) está fazendo | — |
| `blocked` | não | algo **fora** do trabalho impede o avanço: dependência, decisão, insumo | `reason` (ex.: "bloqueada por T0.2") |
| `failed` | não | a execução terminou com erro e nada foi entregue; a ação é reexecutar | `reason` |
| `done` | sim | entregue | — |
| `skipped` | sim | não se aplica por configuração, decidido pelo fluxo (ex.: projeto sem frontend) | — |
| `cancelled` | sim | uma **pessoa** decidiu não fazer (escopo cortado) | `reason` |

- `skipped` × `cancelled`: `skipped` é automático e esperado; `cancelled` é decisão
  humana registrada, com motivo.
- `blocked` × `failed`: `blocked` espera algo de fora; `failed` é uma tentativa que
  deu errado.

**2. Iniciativa** ganha `cancelled` (terminal, com `reason`). O bloqueio de uma
iniciativa é derivado dos itens dela, não é um status próprio.

**3. Gates.** Uma fase está **fechada** quando é `done`, `skipped` ou `cancelled`. Um
gate só aprova com todas as fases fechadas, e o checklist do gate lista cada
`cancelled` com o motivo, para a pessoa ver o que foi cortado. `blocked` e `failed`
sempre impedem o gate.

**4. Escrita validada nos três caminhos** (CLI, State Service e MCP), inclusive para
item de onda, que deixa de aceitar texto livre.
- Status fora do vocabulário vira erro de uso (`USAGE` no CLI, `400` no HTTP), no
  envelope existente.
- `blocked`, `failed` e `cancelled` sem `reason` também viram erro de uso.
- O motivo entra como flag ou campo opcional novo (`--reason` / `reason`): mudança
  aditiva.

**5. Leitura sem rebaixamento silencioso.** Um valor desconhecido num arquivo escrito
à mão:
- é preservado (o parser guarda o texto original);
- aparece no Cockpit como "status desconhecido: `<valor>`", com aviso;
- nunca é reescrito sem pedido explícito.

O rebaixamento para `pending` ou `planned` deixa de existir.

**6. Não muda:**
- o vocabulário do Foundation (protocolo próprio, com `agent-done`);
- o do sprint-backlog, que já tem `blocked` e `descoped`. A UI trata `descoped` como
  `cancelled`.

**7. Apresentação** (design system v2):
- `blocked` é condição do cartão: ⊘ e o motivo em `blocked-fg`, sem coluna nova;
- `failed` usa a mesma família de cor, com glifo e texto próprios ("falhou:
  <motivo>");
- `cancelled` vai para o grupo dos fechados, riscado, com o motivo.
- No mapa, `blocked` e `failed` param a abelha da ilha (o evento `blocked` do contrato
  de atividade já existe; `failed` entra como o motivo, "falhou: ...", no mesmo
  evento).

## Consequências

- (+) Bloqueio e falha ficam visíveis no Cockpit, no mapa e para os agentes, sem
  convenção paralela.
- (+) Escrever um status inválido passa a falhar na hora, em vez de corromper o estado
  em silêncio.
- (+) Aditiva para dados: todo valor válido hoje continua válido, e workspaces
  existentes não precisam migrar.
- (−) Mais restritiva na escrita de item de onda: um agente que gravava texto livre
  passa a receber erro de uso. O kit de agentes precisa citar o vocabulário.
- (−) O snapshot congelado do MCP (`tools/list`) e o golden do CLI mudam, no PR da
  implementação, autorizados por esta ADR.
- (−) Ferramentas das versões 0.9.x do produto anterior leem os status novos como
  `pending`.

A implementação é um PR de comportamento próprio, com BDD antes. Veja
[estado em arquivos](../metodologia/estado-em-arquivos.md#status-de-trabalho).
