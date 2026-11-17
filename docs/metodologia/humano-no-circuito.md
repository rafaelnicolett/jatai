# Humano no circuito

A Jataí não "gera código sozinha". Ela é um método de entrega em que os agentes
trabalham e uma pessoa decide nos pontos certos. Esta página junta tudo o que fica
com você, e o que os agentes são proibidos de fazer no seu lugar.

## O que é sempre seu

| Decisão | Onde acontece | Como fica registrado |
|---|---|---|
| Aprovar um gate (D1, D2 ou D3) | no Cockpit ou pelo CLI | `status: approved`, com `human_approved_at`, `by` e uma nota |
| Confirmar o fim de uma fase | na conversa com o orquestrador | a fase sai de `agent-done` para `done` |
| Aprovar uma tarefa que exige aprovação | no Cockpit | `human_approved_at` na tarefa |
| Decidir uma questão de negócio ou de escopo | quando o agente a pede | um evento de decisão pedida e outro de decisão tomada, com o seu nome |
| Cortar escopo | ao cancelar uma tarefa | `cancelled`, com o motivo |
| Escolher o que investigar | ao montar o inventário | `scan_profile` de cada repositório |

Os agentes leem o estado dos gates e das aprovações. Não existe caminho para um
agente aprová-los: nenhuma tool do servidor MCP aprova gate.

## Como a pergunta chega

A pergunta nunca é uma caixa genérica de "OK ou Cancelar". Ela é específica, vem no
contexto certo e oferece saídas claras. Por exemplo:

> O `@arch-discoverer` terminou `biblioteca-api`: arquitetura em camadas, 84% de
> confiança, 2 anti-padrões encontrados. Confirma o achado para fechar o gate D1
> deste repositório?
>
> 1. Confirmar e aprovar o D1
> 2. Quero ver o diagrama antes
> 3. Rodar `@arch-discoverer` de novo

O orquestrador nunca bombardeia você com decisões: faz no máximo **uma** pergunta
de desambiguação por vez. O padrão é sempre o mesmo, e só a pergunta muda: a
Descoberta pede a confirmação de um achado, o Planejamento pede a aprovação de um
roteiro, e a Execução, quando a mudança cruza dois repositórios, pode perguntar a
ordem de merge.

## Quando o agente para

Um agente para, e espera você, em quatro situações:

- **Terminou uma fase** (`agent-done`): o trabalho está pronto, falta a sua
  confirmação para ele valer.
- **Precisa de uma decisão** que não é dele: uma regra de negócio, um corte de
  escopo, uma troca de padrão. Ele registra o pedido, com o motivo, e a guarda
  acende no mapa: uma decisão espera você.
- **Está bloqueado** (`blocked`): algo de fora impede o avanço, como uma tarefa
  que ainda não foi aprovada. O motivo fica no estado.
- **Falhou** (`failed`): a tentativa deu errado e nada foi entregue. O motivo fica
  no estado, e a decisão de reexecutar, mudar a abordagem ou cancelar é sua.

No Cockpit e no mapa, tudo isso aparece como "o que espera você". Comece por aí em
cada sessão: é a lista curta do que realmente precisa da sua decisão agora.

## Boas práticas

- **Nunca aprove um gate sem entender o motivo.** Se a pergunta não fizer sentido,
  peça para rodar de novo ou para ver o artefato antes.
- **Leia os achados críticos e altos** antes do D1. Esse é o momento mais barato do
  processo para pegar um engano de um agente, muito mais barato do que descobrir
  depois do refactor feito.
- **Escreva a nota da aprovação**: o que você revisou e por quê. Em seis meses ela
  é a resposta para "quem aprovou isto, e com base em quê?".
- **Comece pequeno.** Um repositório em `deep`, o resto em `shallow` ou `ignore`, e
  expanda depois.
- **Fale sempre com o orquestrador**, mesmo quando falar direto com um agente
  parecer mais rápido. É ele que confere os pré-requisitos.

## Quem aprovou

O nome que fica no registro é o `user.name` do git do workspace, nunca o seu
e-mail. Se ele não estiver configurado, a Jataí pede o nome na hora da aprovação.
Nada do que você aprova sai da sua máquina.

Para ver todas essas situações num projeto de exemplo, abra o
[workspace demo](../../demo/README.md): ele tem uma tarefa esperando aprovação, uma
bloqueada, uma que falhou, uma cancelada e uma decisão pedida e tomada.
