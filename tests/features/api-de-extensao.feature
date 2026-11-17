# language: pt
# F2.5 da Missão Open Source: a API pública de extensão sobre as portas, com consentimento explícito (ADR-0023).
# Origem das regras: ADR-0015 (100% local), ADR-0016 (portas), ADR-0020 e contrato agent-activity (a lista fechada de dados).
# Step definitions: tests/features/api-de-extensao.steps.test.ts.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Conectar extensões companheiras, só com o consentimento de quem usa
  Como operador humano da metodologia
  Quero decidir, workspace a workspace, quais extensões companheiras recebem dados da Jataí
  Para que nada saia da minha máquina sem eu saber quem recebe, para onde vai e o que sai

  Contexto:
    Dado um workspace confiável com uma pasta aberta
    E a extensão companheira "Acme Companion", que declara enviar dados para "api.acme.example"

  # ── A API ──────────────────────────────────────────────────────────────────

  @happy-path
  Cenário: A extensão exporta uma API versionada com os três registros
    Quando uma extensão companheira pede a API da Jataí
    Então a API informa a versão 1
    E a API oferece o registro de telemetria, de sincronização de artefatos e de templates

  # ── Instalar não liga nada, e o pedido diz tudo ────────────────────────────

  @happy-path
  Cenário: Registrar uma conexão não liga nada sozinha
    Quando a extensão companheira registra uma conexão de telemetria
    E um agente começa a trabalhar
    Então a extensão companheira não recebe nenhum evento
    E a conexão aparece como aguardando a decisão de quem usa

  @happy-path
  Esquema do Cenário: O pedido de consentimento diz quem é, para que serve, para onde vão os dados e o que sai
    Quando a extensão companheira registra uma conexão de "<conexão>"
    Então o pedido mostra o nome "Acme Companion" e o identificador "acme.companion"
    E o pedido mostra para que a extensão serve
    E o pedido mostra que os dados vão para "api.acme.example"
    E o pedido lista o que sai: "<sai>"
    E o pedido lista o que nunca sai: "<nunca sai>"
    E o pedido diz que a decisão vale só para este workspace

    Exemplos:
      | conexão                    | sai                                                  | nunca sai                                  |
      | telemetria                 | o caminho relativo do artefato que o evento cita     | conteúdo de arquivos                       |
      | sincronização de artefatos | só os arquivos de .github/artifacts/ que você marcar | o token do servidor local                  |
      | templates                  | só o identificador do template e a versão pedida     | qualquer dado do seu workspace             |

  # ── Decidir: permitir, recusar ou deixar para depois ───────────────────────

  @happy-path
  Cenário: Permitir liga a conexão neste workspace
    Dado que a extensão companheira registrou uma conexão de telemetria
    Quando a pessoa permite no pedido
    E um agente começa a trabalhar
    Então a extensão companheira recebe o evento

  @validation
  Cenário: Recusar não incomoda de novo
    Dado que a pessoa recusou o pedido da extensão companheira
    Quando o editor abre o workspace outra vez e a extensão companheira registra a conexão de novo
    Então nenhum pedido aparece
    E a extensão companheira não recebe nenhum evento

  @edge
  Cenário: Fechar o pedido deixa a decisão para depois, sem ligar nada
    Dado que a extensão companheira registrou uma conexão de telemetria
    Quando a pessoa fecha o pedido sem decidir
    E um agente começa a trabalhar
    Então a extensão companheira não recebe nenhum evento
    E a conexão aparece como aguardando a decisão de quem usa

  @edge
  Cenário: Quem deixou para depois é perguntado de novo na próxima abertura do workspace
    Dado que a pessoa fechou o pedido da extensão companheira sem decidir
    Quando o editor abre o workspace outra vez e a extensão companheira registra a conexão de novo
    Então o pedido aparece de novo

  @validation
  Cenário: A autorização vale só para o workspace em que foi dada
    Dado que a pessoa permitiu a extensão companheira no workspace "loja"
    Quando a extensão companheira registra a mesma conexão no workspace "blog"
    Então o pedido aparece no workspace "blog"
    E a extensão companheira não recebe nenhum evento do workspace "blog"

  @happy-path
  Cenário: A autorização guardada vale na próxima abertura do workspace
    Dado que a pessoa permitiu a extensão companheira
    Quando o editor abre o workspace outra vez e a extensão companheira registra a conexão de novo
    Então nenhum pedido aparece
    E um agente que começa a trabalhar chega à extensão companheira

  # ── Revogar, desligar e a declaração que muda ──────────────────────────────

  @happy-path
  Cenário: Revogar desliga a conexão
    Dado que a pessoa permitiu a extensão companheira
    Quando a pessoa revoga a autorização em "Extensões conectadas"
    E um agente começa a trabalhar
    Então a extensão companheira não recebe nenhum evento

  @validation
  Cenário: Depois de revogar, o pedido não volta
    Dado que a pessoa revogou a autorização da extensão companheira
    Quando o editor abre o workspace outra vez e a extensão companheira registra a conexão de novo
    Então nenhum pedido aparece
    E a extensão companheira não recebe nenhum evento

  @happy-path
  Cenário: Desligar mantém a autorização, e ligar de novo não pergunta nada
    Dado que a pessoa permitiu a extensão companheira
    Quando a pessoa desliga a extensão companheira em "Extensões conectadas"
    E a pessoa liga a extensão companheira de novo em "Extensões conectadas"
    Então nenhum novo pedido aparece
    E um agente que começa a trabalhar chega à extensão companheira

  @edge
  Cenário: Se a extensão passa a declarar um destino novo, o pedido volta
    Dado que a pessoa permitiu a extensão companheira, que declarava enviar para "api.acme.example"
    Quando a extensão companheira registra a conexão declarando também o destino "painel.acme.example"
    Então o pedido aparece de novo, avisando que a declaração mudou
    E a extensão companheira não recebe nenhum evento até a pessoa decidir

  @edge
  Cenário: Descartar o registro desliga a conexão
    Dado que a pessoa permitiu a extensão companheira
    Quando a extensão companheira descarta o registro
    E um agente começa a trabalhar
    Então a extensão companheira não recebe nenhum evento

  # ── Confiança do workspace ─────────────────────────────────────────────────

  @validation
  Cenário: Em workspace não confiável o registro é ignorado
    Dado que o workspace não é confiável
    Quando a extensão companheira registra uma conexão de telemetria
    Então nenhum pedido aparece
    E "Extensões conectadas" não lista a extensão companheira
    E a extensão companheira não recebe nenhum evento

  @validation
  Cenário: Sem pasta aberta o registro é ignorado
    Dado que não há pasta aberta
    Quando a extensão companheira registra uma conexão de telemetria
    Então nenhum pedido aparece
    E "Extensões conectadas" não lista a extensão companheira

  # ── Uma extensão ligada por conexão ────────────────────────────────────────

  @happy-path
  Cenário: Com duas extensões na mesma conexão, a pessoa escolhe qual liga
    Dado que a extensão companheira está ligada na telemetria
    E que a extensão "Beta Sync" registra uma conexão de telemetria
    Quando a pessoa permite "Beta Sync" e escolhe ligá-la no lugar da outra
    E um agente começa a trabalhar
    Então só "Beta Sync" recebe o evento
    E a extensão companheira continua autorizada, mas desligada

  @edge
  Cenário: A pessoa pode permitir a segunda extensão e manter a primeira ligada
    Dado que a extensão companheira está ligada na telemetria
    E que a extensão "Beta Sync" registra uma conexão de telemetria
    Quando a pessoa permite "Beta Sync" mantendo a extensão companheira ligada
    E um agente começa a trabalhar
    Então só a extensão companheira recebe o evento
    E "Beta Sync" fica autorizada, mas desligada

  @happy-path
  Cenário: Em "Extensões conectadas" a pessoa troca a extensão que está ligada
    Dado que a extensão companheira está ligada na telemetria
    E que "Beta Sync" está autorizada, mas desligada
    Quando a pessoa liga "Beta Sync" em "Extensões conectadas"
    E um agente começa a trabalhar
    Então só "Beta Sync" recebe o evento
    E a extensão companheira aparece como autorizada e desligada

  # ── O registro tem de ser claro e verdadeiro ───────────────────────────────

  @validation
  Esquema do Cenário: Um registro com a declaração incompleta ou inválida é recusado com um erro claro
    Quando a extensão companheira registra uma conexão de telemetria <problema>
    Então o registro é recusado com um erro que cita "<campo>"
    E nenhum pedido aparece

    Exemplos:
      | problema                                  | campo                          |
      | com o nome de exibição em branco          | displayName                    |
      | com a finalidade em branco                | purpose                        |
      | sem nenhum destino                        | destinations                   |
      | com um destino escrito como endereço      | https://api.acme.example/v1    |
      | com um destino que traz a porta           | api.acme.example:8443          |
      | com um destino numérico                   | 203.0.113.7                    |
      | com um destino de uma palavra só          | intranet                       |
      | com um provedor que não sabe receber      | push                           |

  @validation
  Cenário: A extensão que registra é identificada pelo VS Code, não pelo que ela declara
    Quando a extensão companheira registra uma conexão de telemetria declarando ser a extensão "outra.extensao"
    Então o registro é recusado porque o identificador declarado não é o da extensão que chamou
    E nenhum pedido aparece

  @validation
  Cenário: Quando o VS Code não consegue dizer quem registra, o registro é recusado
    Dado que o VS Code não consegue identificar quem está registrando
    Quando uma extensão registra uma conexão de telemetria
    Então o registro é recusado com um erro que explica a identificação
    E nenhum pedido aparece

  @validation
  Cenário: A mesma extensão não registra duas vezes a mesma conexão
    Dado que a extensão companheira registrou uma conexão de telemetria
    Quando a extensão companheira registra outra conexão de telemetria sem descartar a primeira
    Então o segundo registro é recusado com um erro claro

  # ── O que cada conexão recebe ──────────────────────────────────────────────

  @happy-path
  Cenário: A telemetria entrega só os campos da lista fechada
    Dado que a extensão companheira está ligada na telemetria
    Quando chega um evento com conteúdo de arquivo, prompt e campos que o contrato não prevê
    Então a extensão companheira recebe o evento só com os campos do contrato

  @validation
  Cenário: Um e-mail que apareça num evento não chega à extensão
    Dado que a extensão companheira está ligada na telemetria
    Quando chega uma decisão em que o nome de quem decidiu é um e-mail
    Então a extensão companheira recebe a decisão sem o e-mail

  @validation
  Cenário: Um evento fora do contrato não chega à extensão
    Dado que a extensão companheira está ligada na telemetria
    Quando chega um evento de um tipo que o contrato não conhece
    Então a extensão companheira não recebe nenhum evento

  @happy-path
  Cenário: O envio de artefatos manda só os arquivos que a pessoa marcar
    Dado que a extensão companheira está ligada na sincronização de artefatos
    E que o workspace tem os artefatos "planning/mod-x/roadmap.md", "execution/relatorio.md" e "assessment/report.md"
    Quando a pessoa escolhe enviar "planning/mod-x/roadmap.md" e "execution/relatorio.md"
    Então a extensão companheira recebe esses dois arquivos, com o caminho e o conteúdo de cada um
    E o arquivo "assessment/report.md" não é enviado

  @validation
  Cenário: A lista de envio nunca oferece segredo, evento nem arquivo temporário
    Dado que a extensão companheira está ligada na sincronização de artefatos
    E que o workspace tem o token do servidor local, os eventos de atividade e um arquivo temporário
    Quando a pessoa abre o envio de artefatos
    Então a lista não oferece o token, os eventos nem o arquivo temporário

  @validation
  Cenário: Sem uma extensão ligada na sincronização, nada é oferecido para enviar
    Dado que a extensão companheira está ligada só na telemetria
    Quando a pessoa tenta enviar artefatos
    Então a pessoa é avisada de que não há serviço conectado
    E nenhum arquivo é oferecido nem enviado

  @edge
  Cenário: Cancelar a escolha dos arquivos não envia nada
    Dado que a extensão companheira está ligada na sincronização de artefatos
    E que o workspace tem os artefatos "planning/mod-x/roadmap.md", "execution/relatorio.md" e "assessment/report.md"
    Quando a pessoa abre o envio de artefatos e cancela a escolha
    Então a extensão companheira não recebe nenhum arquivo

  @happy-path
  Cenário: A fonte de templates ligada recebe só o identificador do template
    Dado que a extensão companheira está ligada na fonte de templates
    Quando o gerador pede o template da stack "python-api"
    Então a extensão companheira recebe só o identificador do template e a versão

  @validation
  Cenário: Sem autorização, o gerador não consulta a extensão e usa o scaffold local
    Dado que a extensão companheira registrou uma fonte de templates e a pessoa ainda não decidiu
    Quando o gerador pede o template da stack "python-api"
    Então a extensão companheira não é consultada
    E o gerador usa o scaffold local

  # ── O comando "Extensões conectadas" ───────────────────────────────────────

  @happy-path
  Cenário: "Extensões conectadas" lista cada extensão com a conexão e o estado
    Dado que a extensão companheira está ligada na telemetria
    E que "Beta Sync" registrou uma conexão de templates e a pessoa recusou
    Quando a pessoa abre "Extensões conectadas"
    Então a lista mostra "Acme Companion" na telemetria como ligada
    E a lista mostra "Beta Sync" nos templates como recusada

  @edge
  Cenário: Sem extensão registrada, "Extensões conectadas" explica como elas aparecem
    Dado que nenhuma extensão companheira registrou nada
    Quando a pessoa abre "Extensões conectadas"
    Então a pessoa é avisada de que não há extensão conectada

  # ── O núcleo nunca faz rede ────────────────────────────────────────────────

  @validation
  Cenário: Sem nenhuma extensão, o núcleo não abre conexão para fora
    Dado que nenhuma extensão companheira registrou nada
    Quando a atividade dos agentes passa pelo núcleo e a pessoa tenta enviar artefatos
    Então nenhuma conexão para fora da máquina é aberta

  @validation
  Cenário: Com a extensão instalada mas sem autorização, nada sai
    Dado que a extensão companheira registrou uma conexão de telemetria e a pessoa ainda não decidiu
    Quando a atividade dos agentes passa pelo núcleo
    Então nenhuma conexão para fora da máquina é aberta

  @validation
  Cenário: Com uma extensão autorizada, a saída de dados acontece só por ela
    Dado que a extensão companheira está ligada na telemetria e envia cada evento para "192.0.2.50"
    Quando a atividade dos agentes passa pelo núcleo
    Então as únicas conexões para fora da máquina são as da extensão companheira, uma por evento
