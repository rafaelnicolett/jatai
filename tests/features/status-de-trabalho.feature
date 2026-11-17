# language: pt
# F6.5 (G6 / H-GAP-07), decisão: ADR-0022. Step definitions: tests/features/status-de-trabalho.steps.test.ts.
@bc:estado @persona:agente @release:v1 @risk:high
Funcionalidade: Status de trabalho com bloqueio, falha e cancelamento
  Como agente ou humano que conduz uma iniciativa
  Quero registrar que uma fase ou um item parou, falhou ou foi cortado, sempre com o motivo
  Para que o bloqueio apareça para todos e o gate só feche com o que foi de fato fechado

  Contexto:
    Dado um workspace com a iniciativa "mod-x" ativa e a onda "wave-1" com os itens "item-1" e "item-2" pendentes

  @happy-path
  Esquema do Cenário: Registrar um status que exige motivo, com o motivo
    Quando o agente marca o item "item-1" da onda "wave-1" como "<status>" pelo motivo "<motivo>"
    Então o item "item-1" fica "<status>" com o motivo "<motivo>"

    Exemplos:
      | status    | motivo                         |
      | blocked   | bloqueada por item-2           |
      | failed    | testes de integração quebraram |
      | cancelled | escopo cortado pelo titular    |

  @validation
  Esquema do Cenário: Recusar um status que exige motivo sem o motivo
    Quando o agente marca a fase "business" da iniciativa "mod-x" como "<status>" sem motivo
    Então a resposta é um erro de uso que pede o motivo
    E nada é gravado

    Exemplos:
      | status    |
      | blocked   |
      | failed    |
      | cancelled |

  @validation
  Cenário: Recusar um status fora do vocabulário num item de onda
    Quando o agente marca o item "item-1" da onda "wave-1" como "finished"
    Então a resposta é um erro de uso de valor inválido
    E nada é gravado

  @happy-path
  Cenário: O motivo antigo sai quando o trabalho volta a andar
    Dado que a fase "business" da iniciativa "mod-x" está "blocked" pelo motivo "falta o brief"
    Quando o agente marca a fase "business" da iniciativa "mod-x" como "in-progress"
    Então a fase "business" fica "in-progress" sem motivo

  @happy-path
  Cenário: Cancelar uma iniciativa com motivo
    Quando o humano cancela a iniciativa "mod-x" pelo motivo "a prioridade mudou"
    Então a iniciativa "mod-x" fica "cancelled" com o motivo "a prioridade mudou"

  @edge
  Cenário: Status desconhecido escrito à mão é preservado, não rebaixado
    Dado que a fase "domain" foi escrita à mão com o status "planejada"
    Quando o estado é lido
    Então a fase "domain" aparece como status desconhecido com o texto "planejada"
    E o arquivo continua com "planejada"

  @happy-path
  Cenário: O Gate D3 fecha com itens cancelados e lista cada cancelamento com o motivo
    Dado que o item "item-1" está "done" e o item "item-2" está "cancelled" pelo motivo "fora do escopo"
    Quando o humano aprova o gate "d3" da iniciativa "mod-x"
    Então o gate é aprovado
    E a aprovação lista o item "item-2" cancelado pelo motivo "fora do escopo"

  @validation
  Esquema do Cenário: O Gate D3 não fecha com item bloqueado, com falha ou aberto
    Dado que o item "item-1" está "done" e o item "item-2" está "<status>"
    Quando o humano aprova o gate "d3" da iniciativa "mod-x"
    Então a resposta é um erro de uso de gate aberto que cita o item "item-2"
    E o gate "d3" continua sem registro

    Exemplos:
      | status      |
      | blocked     |
      | failed      |
      | in-progress |

  @happy-path
  Cenário: O Cockpit recebe o status e o motivo de cada fase e item da iniciativa ativa
    Dado que o item "item-1" está "blocked" pelo motivo "aguarda decisão do titular"
    Quando o Cockpit monta a visão de trabalho da iniciativa ativa
    Então a visão traz o item "item-1" como "blocked" com o motivo "aguarda decisão do titular"
