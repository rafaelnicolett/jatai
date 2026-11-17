# language: pt
# F5.3 da Missão Open Source: o mapa da colmeia ao vivo, na tela.
# Os 9 primeiros cenários são os da F5.1 (planning/mod-missao-open-source/mapa/features/helyx-delivery-methodology/),
# sem mudança de palavra. Os acrescentados na F5.3 vêm depois da linha marcada.
# A derivação do que o mapa mostra (ilhas, abelhas, guardas, potes) já é coberta em mapa-da-colmeia.feature (F5.2).
# Step definitions: webview-ui/tests/map-tempo-real.steps.test.tsx.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Acompanhar os agentes em tempo real no mapa
  Como operador humano da metodologia
  Quero ver os agentes trabalhando no mapa enquanto o trabalho acontece
  Para saber o que está em curso e quando um gate espera por mim

  Contexto:
    Dado que a iniciativa ativa é a modernização "Missão Open Source"
    E que o operador está acompanhando o mapa da colmeia

  @happy-path
  Cenário: Um agente que começa uma tarefa aparece como abelha na ilha do seu stream
    Quando o agente "@migration-agent" começa a tarefa "T0.2.1" na Execução
    Então uma abelha do "@migration-agent" aparece na ilha da "Execução" em até 1 segundo
    E a atividade recente registra que "@migration-agent" começou "T0.2.1"

  @happy-path
  Cenário: Um agente que termina uma tarefa pousa
    Dado que o agente "@migration-agent" está trabalhando na tarefa "T0.2.1"
    Quando o agente "@migration-agent" termina a tarefa "T0.2.1"
    Então a abelha do "@migration-agent" deixa de aparecer como trabalhando
    E a atividade recente registra que "@migration-agent" terminou "T0.2.1"

  @happy-path
  Cenário: Uma entrega concluída enche um pote
    Quando o agente "@migration-agent" grava o artefato "execution/feature-report-jatai-f0.2-seed.md"
    Então um pote de mel enche na ilha da "Execução"
    E o pote leva à evidência "execution/feature-report-jatai-f0.2-seed.md"

  @happy-path
  Cenário: A guarda acende quando um agente aguarda aprovação
    Quando o agente "@migration-agent" termina a tarefa "T0.2.1", que exige aprovação humana
    Então a guarda da ilha da "Execução" acende
    E o mapa avisa o operador que "T0.2.1" espera por ele

  @happy-path
  Cenário: A guarda acende quando uma decisão humana é pedida
    Quando a decisão "F0.1 · titularidade do código" é pedida ao operador
    Então a guarda da ilha da "Execução" acende com o motivo "titularidade do código"

  @edge
  Esquema do Cenário: O mapa acompanha a atividade nos dois harnesses
    Dado que o workspace usa o harness "<harness>"
    Quando o agente "@migration-agent" grava o artefato "repos/jatai/README.md"
    Então a ilha da "Execução" registra a atividade em até <atraso>

    Exemplos:
      | harness        | atraso     |
      | Claude Code    | 1 segundo  |
      | GitHub Copilot | 5 segundos |

  @edge
  Cenário: Eventos que chegam com o mapa pausado aparecem na ordem ao retomar
    Dado que o operador pausou o mapa
    E que chegaram 3 eventos de atividade enquanto o mapa estava pausado
    Quando o operador retoma o mapa
    Então o mapa mostra os 3 eventos na ordem em que aconteceram

  @validation
  Cenário: O mapa mostra só metadados da atividade
    Quando o agente "@security-auditor" grava um artefato que contém credenciais
    Então o mapa mostra apenas o agente, o stream e o caminho do artefato
    E nenhum conteúdo do artefato aparece no mapa

  @error
  Cenário: Um evento ilegível é ignorado sem derrubar o mapa
    Quando chega um evento de atividade sem agente e de tipo desconhecido
    Então o mapa continua mostrando o estado anterior
    E o evento ilegível não aparece na atividade recente

  # ── Acrescentados na F5.3 ──────────────────────────────────────────────────

  @edge
  Cenário: Quando ninguém trabalha, nada se move
    Dado que nenhum agente está trabalhando
    Quando o operador acompanha o mapa
    Então nada se move no mapa

  @edge
  Cenário: Com trinta agentes trabalhando o mapa fica dentro do orçamento de animação
    Dado que trinta agentes estão trabalhando ao mesmo tempo
    Quando o operador acompanha o mapa
    Então cada agente é uma abelha com uma única animação de voo
    E o total de nós animados fica abaixo de sessenta
    E as asas das abelhas deixam de bater, mas o voo continua
    E com poucas abelhas as asas batem

  @edge
  Esquema do Cenário: Uma abelha bloqueada ou que falhou para, com o motivo em texto
    Dado que a tarefa "T0.2" da Execução está "<estado>", com o motivo "<motivo>"
    E que o agente "@migration-agent" trabalhava nela
    Quando o operador acompanha o mapa
    Então a abelha do "@migration-agent" fica parada na ilha da "Execução"
    E o mapa mostra "<texto>" escrito, e não só em cor

    Exemplos:
      | estado    | motivo               | texto                         |
      | bloqueada | bloqueada por T0.1   | Bloqueado: bloqueada por T0.1 |
      | falhou    | suíte de testes caiu | Falhou: suíte de testes caiu  |

  @edge
  Cenário: O mapa pausado informa quantos eventos esperam
    Dado que o operador pausou o mapa
    Quando chegam 3 eventos de atividade
    Então o mapa informa "pausado · 3 novos"
    E a cena continua como estava

  @validation
  Cenário: O leitor de tela é avisado de uma decisão nova
    Quando a decisão "F0.1 · titularidade do código" é pedida ao operador
    Então o leitor de tela é avisado de que "Nova decisão espera você: titularidade do código"

  @validation
  Esquema do Cenário: O leitor de tela é avisado de bloqueio e de falha
    Quando o agente "@migration-agent" fica "<estado>" na tarefa "T0.2", com o motivo "<motivo>"
    Então o leitor de tela é avisado de que "<aviso>"

    Exemplos:
      | estado    | motivo               | aviso                                                              |
      | bloqueada | bloqueada por T0.1   | Bloqueio na Execução: @migration-agent, bloqueada por T0.1         |
      | falhou    | suíte de testes caiu | Falha na Execução: @migration-agent, suíte de testes caiu          |

  @validation
  Cenário: Muitos eventos seguidos viram um aviso só para o leitor de tela
    Quando chegam 8 eventos de atividade em 2 segundos
    Então o leitor de tela recebe no máximo um aviso nesse intervalo
