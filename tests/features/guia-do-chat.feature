# language: pt
# F3.7 (ADR-0025): o participante de chat vira guia. Step definitions: tests/features/guia-do-chat.steps.test.ts.
@bc:chat @persona:usuario @release:v1 @risk:medium
Funcionalidade: Guia de chat que mostra onde a iniciativa está e encaminha para o agente jatai
  Como quem conduz uma iniciativa
  Quero perguntar ao guia onde estou e o que vem agora
  Para seguir com o agente jatai, sem confundir o guia com ele

  @happy-path
  Cenário: O guia tem nome próprio, diferente do agente
    Quando a extensão declara o participante de chat
    Então o usuário chama o guia por um nome que não é o do agente jatai

  @happy-path
  Cenário: O guia mostra a fase atual e explica o próximo passo
    Dado a iniciativa "loja-demo" ativa na fase "business"
    Quando o usuário pergunta ao guia onde está
    Então o guia mostra a fase "business" com o agente "@business"
    E diz o que o agente entrega e o que falta para a fase ser aprovada
    E oferece continuar com o agente jatai

  @happy-path
  Cenário: Continuar com o agente jatai leva o pedido ao agente, não ao guia
    Dado a iniciativa "loja-demo" ativa na fase "business"
    Quando o usuário escolhe continuar com o agente jatai
    Então o chat abre no agente jatai com o pedido de continuar com "@business"

  @validation
  Cenário: O guia não aciona agentes nem grava arquivos
    Dado a iniciativa "loja-demo" ativa na fase "business"
    Quando o usuário pede ao guia que escreva o business brief
    Então nenhum arquivo do workspace muda
    E o guia responde como guia, sem assumir a persona do agente da fase

  @happy-path
  Cenário: Sem iniciativa, o guia explica que o trabalho começa no agente jatai
    Dado um workspace sem iniciativas
    Quando o usuário pergunta ao guia onde está
    Então o guia explica que quem abre a iniciativa é o agente jatai

  @happy-path
  Cenário: O Foundation de um workspace novo começa no agente jatai
    Quando a extensão inicia o Foundation de um workspace Copilot
    Então o chat abre no agente jatai com o pedido do Foundation
