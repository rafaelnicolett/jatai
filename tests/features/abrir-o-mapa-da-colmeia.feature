# language: pt
# F5.3 da Missão Open Source: a vista do mapa da colmeia dentro do Cockpit.
# Os 6 primeiros cenários são os da F5.1 (planning/mod-missao-open-source/mapa/features/helyx-delivery-methodology/),
# sem mudança de palavra. Os acrescentados na F5.3 vêm depois da linha marcada.
# Step definitions: webview-ui/tests/map-abrir.steps.test.tsx.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:medium
Funcionalidade: Abrir o mapa da colmeia
  Como operador humano da metodologia
  Quero ver a iniciativa ativa como um mapa de ilhas e pontes
  Para saber num relance em que stream ela está e quais gates já foram vencidos

  @happy-path
  Cenário: O mapa desenha os streams como ilhas ligadas pelos gates
    Dado que a iniciativa ativa é a modernização "Missão Open Source"
    E que a Descoberta e o Planejamento da iniciativa estão concluídos
    E que a Execução da iniciativa está no "Epic 0 · Fundação"
    Quando o operador abre o mapa da colmeia
    Então o mapa mostra as ilhas "Descoberta", "Planejamento", "Execução" e "Operação"
    E as pontes dos gates "D1" e "D2" aparecem aprovadas
    E a ponte do gate "D3" aparece por construir
    E a ilha da "Execução" aparece como o lugar onde a iniciativa está agora

  @happy-path
  Cenário: O operador volta ao Cockpit no mesmo ponto
    Dado que o operador está no mapa com os detalhes da ilha da "Execução" abertos
    Quando o operador volta ao Cockpit
    Então o Cockpit mostra a iniciativa "Missão Open Source"
    E o épico em destaque no Cockpit é o "Epic 0 · Fundação"

  @edge
  Cenário: Um stream que ainda não começou aparece adormecido
    Dado que a iniciativa ativa é a modernização "Missão Open Source"
    E que o gate "D3" ainda não foi aprovado
    Quando o operador abre o mapa da colmeia
    Então a ilha da "Operação" aparece adormecida
    E a ilha da "Operação" informa que acorda depois do gate "D3"

  @edge
  Cenário: As ilhas seguem o fluxo do tipo de iniciativa
    Dado que a iniciativa ativa é um hotfix com as etapas "Diagnóstico", "Correção" e "Validação"
    Quando o operador abre o mapa da colmeia
    Então o mapa mostra as ilhas "Diagnóstico", "Correção" e "Validação"
    E o mapa não mostra as ilhas dos streams de modernização

  @edge
  Cenário: Trocar de iniciativa troca o mapa inteiro
    Dado que o operador está no mapa da iniciativa "Missão Open Source"
    E que existe também a iniciativa "Hotfix: tela 1 do Wizard em branco"
    Quando o operador escolhe a iniciativa "Hotfix: tela 1 do Wizard em branco"
    Então o mapa passa a mostrar as ilhas e as pontes dessa iniciativa
    E nenhuma abelha da "Missão Open Source" continua no mapa

  @validation
  Cenário: Sem iniciativa ativa o mapa explica o que falta
    Dado que o workspace não tem iniciativa ativa nem Foundation
    Quando o operador abre o mapa da colmeia
    Então o mapa informa que não há iniciativa ativa
    E o mapa indica como abrir uma iniciativa com o @jatai

  @happy-path
  Cenário: Sem iniciativa, mas com o Foundation em andamento, o mapa mostra a descoberta do brownfield
    Dado um workspace sem iniciativa ativa e com o Foundation em andamento
    Quando o operador abre o mapa da colmeia
    Então a ilha da "Descoberta" aparece como a etapa atual
    E o cabeçalho diz "Descoberta do brownfield"
    E o mapa não mostra o aviso de "Sem iniciativa ativa"

  # ── Acrescentados na F5.3 ──────────────────────────────────────────────────

  @happy-path
  Cenário: O mapa abre na iniciativa que o Cockpit está vendo
    Dado que o Cockpit está vendo a iniciativa "Hotfix: tela 1 do Wizard em branco"
    E que a iniciativa ativa do registro é a "Missão Open Source"
    Quando o operador abre o mapa pelo botão "Mapa"
    Então o mapa mostra as ilhas e as pontes dessa iniciativa
    E a iniciativa ativa do registro continua a "Missão Open Source"

  @edge
  Cenário: Escolher outra iniciativa no mapa é só olhar, como no Cockpit
    Dado que o operador está no mapa da iniciativa "Missão Open Source", que é a ativa do registro
    Quando o operador escolhe a iniciativa "Hotfix: tela 1 do Wizard em branco" no seletor do mapa
    Então o mapa e o Cockpit passam a ver a mesma iniciativa
    E a iniciativa ativa do registro continua a "Missão Open Source"
    E nenhuma mensagem para trocar a iniciativa ativa vai ao host

  @edge
  Cenário: Uma falha ao desenhar o mapa não apaga o painel
    Dado que o registro da iniciativa tem um item que o mapa não consegue ler
    Quando o operador abre o mapa
    Então o mapa informa, com o motivo em texto, que falhou ao desenhar
    E informa que nada foi gravado
    E o operador volta ao Cockpit pelo botão "Voltar ao Cockpit"

  @happy-path
  Cenário: O botão Mapa da barra superior abre o mapa
    Dado que o operador está no Cockpit da iniciativa "Missão Open Source"
    Quando o operador aperta o botão "Mapa" da barra superior
    Então o mapa da colmeia aparece no lugar do Cockpit

  @edge
  Cenário: Esc volta ao Cockpit
    Dado que o operador está no mapa da colmeia sem nenhuma ilha aberta
    Quando o operador aperta Esc
    Então o Cockpit volta a aparecer

  @edge
  Cenário: A cena do mapa cabe em qualquer largura sem encolher o texto
    Dado que o operador está no mapa da colmeia
    Quando o painel do Cockpit muda de largura
    Então a cena inteira continua visível, escalada para caber
    E o nome de cada ilha continua legível, sem encolher junto
