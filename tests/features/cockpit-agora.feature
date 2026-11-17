# language: pt
# F4.2 (parte 2): a entrada "Agora" do Cockpit sobre o design system v2. Decisões: ADR-0022 §7 (status de trabalho),
# ADR-0024 (gates como decisão humana), G3, G9 e G15 de mod-missao-open-source. Telas: redesign/Escolhida.dc.html.
# Step definitions: webview-ui/tests/features/cockpit-agora.steps.test.tsx (modelo da tela em funções puras e os componentes no jsdom).
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:medium
Funcionalidade: Entrada "Agora" do Cockpit
  Como operador humano que conduz uma iniciativa
  Quero abrir o Cockpit e ver onde a missão está e o que espera por mim
  Para decidir sem procurar a resposta nos arquivos de estado

  @happy-path
  Cenário: O "Agora" diz onde a missão está
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    Quando o operador abre o Cockpit
    Então o "Agora" mostra a iniciativa "mod-x" na "Execução", no "Epic 0"
    E a trilha marca a "Execução" como o ponto atual

  @happy-path
  Cenário: O "Agora" lista o que espera o operador, com o gate primeiro
    Dado a iniciativa "mod-x" de modernização, ativa, com todas as tarefas fechadas e o D3 por decidir
    E um agente pediu a decisão "titularidade do código"
    E a tarefa "epic-0/task-2" está concluída e exige aprovação humana
    Quando o operador abre o Cockpit
    Então o "Agora" diz que 3 decisões esperam o operador
    E a primeira decisão é o gate "D3"

  @happy-path
  Cenário: Quando nada espera o operador, o "Agora" diz que está em dia
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    Quando o operador abre o Cockpit
    Então o "Agora" diz "Nada espera você agora"

  @happy-path
  Cenário: Um agente trabalhando aparece como atividade
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    E o agente "@migration-agent" está trabalhando na tarefa "epic-0/task-1"
    Quando o operador abre o Cockpit
    Então o "Agora" mostra "1 agente trabalhando" com o nome "@migration-agent"

  @edge
  Esquema do Cenário: Uma tarefa parada mostra a condição em texto, com o motivo
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    E a tarefa "epic-0/task-1" está "<condição>" pelo motivo "<motivo>"
    Quando o operador abre o Cockpit
    Então o quadro do "Epic 0" mostra a tarefa "epic-0/task-1" na coluna "<coluna>"
    E a tarefa diz "<texto>"

    Exemplos:
      | condição  | motivo                    | coluna | texto                                 |
      | blocked   | bloqueada por task-0      | Fila   | Bloqueado: bloqueada por task-0       |
      | failed    | o teste de contrato caiu  | Fila   | Falhou: o teste de contrato caiu      |
      | cancelled | escopo cortado pelo dono  | Feito  | Cancelado: escopo cortado pelo dono   |

  @edge
  Cenário: Um bloqueio também aparece no "Agora", com o motivo em texto
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    E a tarefa "epic-0/task-1" está "blocked" pelo motivo "bloqueada por task-0"
    Quando o operador abre o Cockpit
    Então o "Agora" lista a tarefa "task-1" como bloqueada: "bloqueada por task-0"

  @happy-path
  Cenário: Navegar para outra iniciativa não muda a iniciativa ativa
    Dado a iniciativa "mod-x" de modernização, ativa, e a iniciativa "hotfix-y" de hotfix, registrada
    Quando o operador navega para a iniciativa "hotfix-y"
    Então o Cockpit mostra a iniciativa "hotfix-y"
    E a iniciativa ativa continua sendo "mod-x"
    E nenhum pedido de troca de iniciativa ativa é enviado

  @happy-path
  Cenário: Tornar ativa é uma ação explícita
    Dado a iniciativa "mod-x" de modernização, ativa, e a iniciativa "hotfix-y" de hotfix, registrada
    Quando o operador navega para a iniciativa "hotfix-y"
    E escolhe "Tornar ativa"
    Então o pedido para tornar "hotfix-y" a iniciativa ativa é enviado

  @edge
  Cenário: A iniciativa que não é a ativa mostra o que o registro sabe e avisa do detalhe
    Dado a iniciativa "mod-x" de modernização, ativa, e a iniciativa "feat-z" de feature, sem épicos, registrada
    Quando o operador navega para a iniciativa "feat-z"
    Então o Cockpit avisa que o detalhe das fases só carrega para a iniciativa ativa
    E oferece "Tornar ativa"

  @validation
  Cenário: Sem iniciativa, o primeiro uso oferece criar uma
    Dado um workspace configurado, de projeto novo, sem nenhuma iniciativa
    Quando o operador abre o Cockpit
    Então o Cockpit explica que ainda não há iniciativa
    E oferece a ação "Nova iniciativa"

  @validation
  Cenário: Sem pasta aberta, o Cockpit oferece abrir uma pasta
    Dado que o Jataí avisa que nenhuma pasta está aberta
    Quando o operador abre o Cockpit
    Então o Cockpit diz "Nenhuma pasta aberta"
    E oferece a ação "Abrir o assistente"

  @validation
  Cenário: Sem Foundation, o Cockpit oferece começar a Descoberta
    Dado um workspace configurado, sem nenhum repositório mapeado
    Quando o operador abre a Descoberta
    Então o Cockpit explica que a Foundation ainda não começou
    E oferece a ação "Começar a Descoberta"

  @error
  Cenário: Sem resposta do State Service, a espera tem prazo e oferece tentar de novo
    Dado que o Cockpit abriu e o estado ainda não chegou
    Quando o prazo de espera passa
    Então o Cockpit explica que o estado do projeto não chegou
    E oferece a ação "Tentar de novo"
    E "Tentar de novo" pede o estado de novo

  @error
  Cenário: Uma falha numa tela não apaga o Cockpit
    Dado que uma tela do Cockpit falha ao desenhar
    Quando o Cockpit tenta mostrá-la
    Então o Cockpit mostra o erro daquela tela com a ação "Tentar de novo"
    E o resto do Cockpit continua à vista

  @happy-path
  Cenário: Uma decisão nova é anunciada uma vez, numa região viva
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    Quando um agente pede a decisão "titularidade do código"
    Então a região de anúncios diz "Nova decisão espera você: Titularidade do código"
    E o mesmo estado repetido não anuncia de novo

  @happy-path
  Cenário: O botão "Mapa" fica na barra superior e liga a troca de visão
    Dado a iniciativa "mod-x" de modernização, ativa, com D1 e D2 aprovados e o "epic-0" em andamento
    Quando o operador abre o Cockpit
    Então a barra superior tem o botão "Mapa"
    E acionar o botão "Mapa" chama a ligação da visão do mapa
