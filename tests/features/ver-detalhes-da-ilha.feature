# language: pt
# F5.3 da Missão Open Source: os detalhes de uma ilha, o modo lista e o movimento reduzido.
# Os 6 primeiros cenários são os da F5.1 (planning/mod-missao-open-source/mapa/features/helyx-delivery-methodology/),
# sem mudança de palavra. Os acrescentados na F5.3 vêm depois da linha marcada.
# Step definitions: webview-ui/tests/map-detalhes.steps.test.tsx.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:medium
Funcionalidade: Ver os detalhes de uma ilha
  Como operador humano da metodologia
  Quero abrir uma ilha do mapa e ver quem trabalha ali
  Para entender as responsabilidades, o passo atual e as entregas daquele stream

  Contexto:
    Dado que a iniciativa ativa é a modernização "Missão Open Source"
    E que o operador está acompanhando o mapa da colmeia

  @happy-path
  Cenário: A ilha mostra quem trabalha ali
    Quando o operador abre os detalhes da ilha da "Execução"
    Então os detalhes listam o agente "@migration-agent" com a responsabilidade "semear repos/jatai"
    E os detalhes mostram o "@migration-agent" como "trabalhando agora"
    E os detalhes mostram o "@test-backfill-agent" como "na fila"

  @happy-path
  Cenário: A ilha abre o inventário de processos e o elenco
    Quando o operador abre os detalhes da ilha da "Descoberta"
    Então os detalhes mostram o progresso dos processos da ilha
    E o processo "Tech Stack" mostra a persona "Meli"
    E o elenco mostra "Meli" e o arquétipo "A Cartógrafa"
    E o processo explica por que ele existe

  @happy-path
  Cenário: Cada entrega leva à sua evidência
    Dado que o Planejamento produziu "roadmap.md" e "risk-matrix.md"
    Quando o operador abre os detalhes da ilha do "Planejamento"
    Então os detalhes listam as entregas "roadmap.md" e "risk-matrix.md"
    E cada entrega leva ao artefato correspondente

  @happy-path
  Cenário: A guarda acesa leva à decisão no Cockpit
    Dado que a guarda da ilha da "Execução" está acesa pela decisão "F0.1 · titularidade do código"
    Quando o operador abre a decisão a partir da guarda
    Então o diálogo de decisão do Cockpit abre com o contexto da "F0.1"
    E o mapa não registra nenhuma decisão por conta própria

  @edge
  Cenário: Uma ilha adormecida explica quando acorda
    Quando o operador abre os detalhes da ilha da "Operação"
    Então os detalhes informam que a ilha acorda depois do gate "D3"
    E os detalhes mostram os agentes da Operação como "adormecidos"

  @edge
  Cenário: O operador acompanha a iniciativa pelo modo lista
    Dado que o operador prefere o modo lista
    Quando o operador abre o mapa da colmeia
    Então o mapa aparece como uma lista de streams com agentes, estado e entregas
    E a lista traz as mesmas informações das ilhas

  @validation
  Cenário: Com movimento reduzido o estado continua visível
    Dado que o sistema do operador pede movimento reduzido
    Quando o agente "@migration-agent" começa a tarefa "T0.2.2" na Execução
    Então nenhuma abelha se move no mapa
    E a ilha da "Execução" mostra o "@migration-agent" como "trabalhando agora"

  # ── Acrescentados na F5.3 ──────────────────────────────────────────────────

  @happy-path
  Cenário: A ilha mostra o passo atual e o que falta para o gate
    Dado que a Execução está no "Epic 0 · Fundação" e o gate "D3" ainda tem tarefas abertas
    Quando o operador abre os detalhes da ilha da "Execução"
    Então os detalhes mostram o passo atual "Epic 0 · Fundação"
    E os detalhes listam o que falta para o gate "D3"

  @edge
  Cenário: As ilhas se navegam pelo teclado
    Quando o operador navega pelas ilhas com as setas
    Então o foco passa de ilha em ilha, na ordem do fluxo
    E Enter abre os detalhes da ilha que tem o foco

  @edge
  Cenário: Esc fecha os detalhes e devolve o foco à ilha
    Dado que o operador abriu os detalhes da ilha da "Execução"
    Quando o operador aperta Esc
    Então os detalhes fecham
    E o foco volta para a ilha da "Execução"

  @edge
  Cenário: A escolha entre mapa e lista é lembrada
    Dado que o operador escolheu o modo lista
    Quando o operador fecha o mapa e abre de novo
    Então o mapa aparece como uma lista de streams com agentes, estado e entregas

  @edge
  Cenário: Com leitor de tela o mapa abre em modo lista
    Dado que o sistema do operador informa que há um leitor de tela
    E que o operador nunca escolheu entre mapa e lista
    Quando o operador abre o mapa da colmeia
    Então o mapa aparece como uma lista de streams com agentes, estado e entregas

  @edge
  Cenário: A escolha entre cena de dia e de noite é lembrada
    Dado que o operador escolheu a cena de dia
    Quando o operador fecha o mapa e abre de novo
    Então o mapa aparece com a paleta de dia

  @validation
  Cenário: A cena de dia mostra o mesmo estado que a de noite
    Dado que o operador escolheu a cena de dia
    Quando o operador abre o mapa da colmeia
    Então a cena de dia mostra as mesmas ilhas, pontes e abelhas que a de noite
