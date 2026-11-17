# language: pt
# F5.2 da Missão Open Source: deriveColmeia, a função pura que transforma estado e eventos no que o mapa mostra.
# Cenários tirados das 3 features v1.0 do mapa (planning/mod-missao-open-source/mapa/features/), só a parte de dado.
# A parte de tela (botão, animação, movimento reduzido, modo lista, pausa, voltar ao Cockpit) é da F5.3.
# Step definitions: tests/features/mapa-da-colmeia.steps.test.ts, sobre a função pura.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Derivar o mapa da colmeia do estado gravado e dos eventos de atividade
  Como operador humano da metodologia
  Quero que o mapa mostre a iniciativa ativa como ilhas, pontes, abelhas, guardas e potes
  Para ver num relance onde a iniciativa está e o que cada agente faz, sem o mapa inventar estado

  # ── Abrir o mapa ───────────────────────────────────────────────────────────

  @happy-path
  Cenário: Os streams viram ilhas ligadas pelos gates
    Dado que a iniciativa ativa é a modernização "Missão Open Source", com D1 e D2 aprovados
    E que a Execução da iniciativa está no "Epic 0 · Fundação"
    Quando o mapa é derivado
    Então as ilhas são "Descoberta", "Planejamento", "Execução" e "Operação"
    E as pontes "D1" e "D2" aparecem aprovadas e a ponte "D3" por construir
    E a ilha da "Execução" é onde a iniciativa está agora, no "Epic 0 · Fundação"

  @edge
  Cenário: Um stream que ainda não começou aparece adormecido
    Dado que a iniciativa ativa é a modernização "Missão Open Source", com D1 e D2 aprovados
    Quando o mapa é derivado
    Então a ilha da "Operação" aparece adormecida e acorda depois do gate "D3"
    E os agentes da "Operação" aparecem adormecidos

  @edge
  Cenário: As ilhas seguem o fluxo do tipo de iniciativa
    Dado que a iniciativa ativa é um hotfix com as etapas "Diagnóstico", "Correção" e "Validação"
    Quando o mapa é derivado
    Então as ilhas são "Diagnóstico", "Correção" e "Validação"
    E nenhuma ilha dos streams de modernização aparece

  @edge
  Cenário: Trocar de iniciativa troca o mapa inteiro
    Dado que o "@migration-agent" trabalha na "Missão Open Source"
    Quando a iniciativa ativa passa a ser o hotfix "Hotfix: tela 1 do Wizard em branco"
    Então o mapa mostra as ilhas do hotfix
    E nenhuma abelha da "Missão Open Source" continua no mapa

  @validation
  Cenário: Sem iniciativa ativa o mapa explica o que falta
    Dado que o workspace não tem iniciativa ativa
    Quando o mapa é derivado
    Então o mapa informa que não há iniciativa ativa e indica como abrir uma com o @jatai

  # ── Acompanhar os agentes ──────────────────────────────────────────────────

  @happy-path
  Cenário: Um agente que começa uma tarefa aparece como abelha na ilha do seu stream
    Quando o "@migration-agent" começa a tarefa "epic-0/task-0.2" na Execução
    Então uma abelha do "@migration-agent" trabalha na ilha da "Execução"
    E a atividade recente registra que "@migration-agent" começou

  @happy-path
  Cenário: Um subagente avisado pelo hook, sem iniciativa nem fase, aparece na iniciativa ativa
    Quando o hook avisa, sem iniciativa nem fase, que "migration-agent" começou
    Então uma abelha do "@migration-agent" trabalha na ilha da "Execução" da iniciativa ativa

  @edge
  Cenário: Dois subagentes em paralelo avisados pelo hook são duas abelhas
    Quando o hook avisa que "migration-agent" e "test-backfill-agent" começaram, sem tarefa nem fase
    Então duas abelhas trabalham na ilha da "Execução"

  @edge
  Cenário: O fim de um dos subagentes em paralelo pousa só a abelha dele
    Dado que o hook avisou que "migration-agent" e "test-backfill-agent" começaram
    Quando o hook avisa que "migration-agent" terminou, sem tarefa nem fase
    Então só a abelha do "@test-backfill-agent" continua trabalhando

  @edge
  Cenário: O fim de um subagente avisado pelo hook pousa a abelha sem acender a guarda
    Dado que o hook avisou que "migration-agent" começou
    Quando o hook avisa que "migration-agent" terminou, sem tarefa nem fase
    Então a abelha do "@migration-agent" deixa de trabalhar
    E nenhuma guarda acende

  @edge
  Cenário: Um subagente fora do elenco da metodologia aparece na ilha em que a iniciativa está
    Quando o hook avisa que "general-purpose" começou, sem tarefa nem fase
    Então uma abelha do "@general-purpose" trabalha na ilha da "Execução" da iniciativa ativa

  @happy-path
  Cenário: Um agente que termina uma tarefa pousa
    Dado que o "@migration-agent" trabalha na tarefa "epic-0/task-0.2"
    Quando o "@migration-agent" termina a tarefa "epic-0/task-0.2", que não exige aprovação
    Então a abelha do "@migration-agent" deixa de trabalhar
    E nenhuma guarda acende
    E a atividade recente registra que "@migration-agent" terminou

  @happy-path
  Cenário: A tarefa do estado em andamento também vira abelha, sem evento de início
    Dado que a tarefa "epic-0/task-0.3" está "in-progress" no estado, gravada por um agente do Copilot
    Quando o mapa é derivado
    Então uma abelha trabalha na ilha da "Execução" na tarefa "epic-0/task-0.3"

  @happy-path
  Cenário: Uma entrega concluída enche um pote que leva à evidência
    Quando o "@migration-agent" grava o artefato ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md"
    Então um pote enche na ilha da "Execução" com a evidência ".github/artifacts/execution/feature-report-jatai-f0.2-seed.md"

  @edge
  Cenário: O mesmo artefato visto pelo hook e pelo observador enche um pote só
    Quando o hook e o observador registram o mesmo artefato ".github/artifacts/execution/relatorio.md"
    Então só um pote tem a evidência ".github/artifacts/execution/relatorio.md"
    E a atividade recente mostra a gravação uma vez

  @happy-path
  Cenário: A guarda acende quando a tarefa terminada exige aprovação humana
    Dado que a tarefa "epic-0/task-0.2" exige aprovação humana
    Quando o "@migration-agent" termina a tarefa "epic-0/task-0.2"
    Então a guarda da ilha da "Execução" acende e avisa que "epic-0/task-0.2" espera o operador

  @happy-path
  Cenário: A guarda acende quando uma decisão humana é pedida
    Quando a decisão "titularidade do código" da tarefa "epic-0/task-0.1" é pedida ao operador
    Então a guarda da ilha da "Execução" acende com o motivo "titularidade do código"

  @happy-path
  Cenário: A decisão tomada apaga a guarda e registra quem decidiu
    Dado que a decisão "titularidade do código" da tarefa "epic-0/task-0.1" foi pedida
    Quando "Pessoa Fictícia" toma a decisão
    Então nenhuma guarda fica acesa
    E a atividade recente registra a decisão tomada por "Pessoa Fictícia"

  @edge
  Esquema do Cenário: Bloqueio e falha param a abelha com o motivo
    Dado que a tarefa "epic-0/task-0.2" está "<status>" no estado, com o motivo "<motivo>"
    Quando o mapa é derivado
    Então a abelha da tarefa "epic-0/task-0.2" aparece parada na "Execução" com o motivo "<mostrado>"

    Exemplos:
      | status  | motivo                 | mostrado                       |
      | blocked | bloqueada por T0.1     | bloqueada por T0.1             |
      | failed  | suíte de testes caiu   | falhou: suíte de testes caiu   |

  @edge
  Esquema do Cenário: A ilha registra a atividade de qualquer harness
    Quando o "@migration-agent" grava o artefato "repos/jatai/README.md" capturado pelo "<harness>"
    Então a ilha da "Execução" registra a atividade

    Exemplos:
      | harness     |
      | claude-code |
      | copilot     |
      | mcp         |

  @validation
  Cenário: O mapa mostra só metadados da atividade
    Quando chega um evento de artefato com conteúdo de arquivo e metadados fora da lista
    Então o mapa mostra só o agente, a ilha e o caminho do artefato
    E nenhum conteúdo do artefato aparece no mapa

  @error
  Cenário: Um evento ilegível é ignorado sem derrubar o mapa
    Dado um mapa já derivado
    Quando chega um evento sem agente e de tipo desconhecido
    Então o mapa derivado de novo é o mesmo de antes
    E o evento ilegível não aparece na atividade recente

  # ── Detalhes da ilha ───────────────────────────────────────────────────────

  @happy-path
  Cenário: A ilha mostra quem trabalha ali e quem está na fila
    Dado que o "@migration-agent" trabalha na Execução
    Quando o mapa é derivado
    Então a ilha da "Execução" mostra o "@migration-agent" trabalhando agora
    E a ilha da "Execução" mostra o "@test-backfill-agent" na fila

  @happy-path
  Cenário: As entregas do Planejamento levam aos artefatos
    Dado que o Planejamento produziu "roadmap.md" e "risk-matrix.md"
    Quando o mapa é derivado
    Então a ilha do "Planejamento" tem os potes de "roadmap.md" e "risk-matrix.md"
