# language: pt
# F3.5, decisão: ADR-0018 ("kit.lock.json no workspace instalado e migração por checksum").
# Step definitions: tests/features/kit-lock.steps.test.ts.
@bc:kit @persona:time-do-cliente @release:v1 @risk:high
Funcionalidade: Lock do kit que separa o que é do kit do que o time alterou
  Como time que adapta agentes e instruções do kit ao próprio projeto
  Quero que o workspace registre a versão e o checksum de cada arquivo que o kit instalou
  Para que a migração do kit atualize o que é do kit sem apagar em silêncio o que o time alterou

  @happy-path
  Esquema do Cenário: A instalação registra o que o kit instalou
    Quando o kit é instalado num workspace para o harness "<harness>"
    Então o lock do kit registra a versão do kit, a edição e o harness
    E o lock do kit tem o checksum de cada agente, skill e instrução que o kit instalou

    Exemplos:
      | harness |
      | claude  |
      | copilot |

  @happy-path
  Cenário: A migração atualiza o arquivo do kit que o time não alterou
    Dado um workspace instalado com o lock do kit
    E uma versão nova do kit que muda o agente "refactor-agent"
    Quando o kit é migrado
    Então o agente "refactor-agent" passa a ser o da versão nova
    E o lock do kit registra o checksum da versão nova

  @edge
  Cenário: A migração não sobrescreve o arquivo do kit que o time alterou e avisa
    Dado um workspace instalado com o lock do kit
    E o time alterou o agente "refactor-agent"
    E uma versão nova do kit que muda o agente "refactor-agent"
    Quando o kit é migrado
    Então o agente "refactor-agent" continua com a alteração do time
    E a versão nova do kit fica ao lado dele, para o time comparar
    E a migração avisa que o agente "refactor-agent" foi alterado pelo time

  @edge
  Cenário: A alteração do time continua protegida nas migrações seguintes
    Dado um workspace instalado com o lock do kit
    E o time alterou o agente "refactor-agent"
    Quando o kit é migrado duas vezes
    Então o agente "refactor-agent" continua com a alteração do time

  @edge
  Cenário: Um arquivo que o kit deixou de ter sai, se o time não o alterou
    Dado um workspace instalado com o lock do kit
    E o lock registra um agente "agente-descontinuado" que o kit não tem mais
    Quando o kit é migrado
    Então o agente "agente-descontinuado" sai do workspace
    E a migração avisa que ele foi removido

  @edge
  Cenário: Um arquivo que o kit deixou de ter fica, se o time o alterou
    Dado um workspace instalado com o lock do kit
    E o lock registra um agente "agente-descontinuado" que o kit não tem mais
    E o time alterou o agente "agente-descontinuado"
    Quando o kit é migrado
    Então o agente "agente-descontinuado" continua no workspace com a alteração do time

  @happy-path
  Cenário: Um workspace anterior ao lock ganha o lock na primeira migração
    Dado um workspace instalado por uma versão do kit sem lock
    Quando o kit é migrado
    Então o lock do kit passa a existir, com o checksum de cada arquivo que o kit instalou

  @validation
  Cenário: O que é do time nunca entra no lock
    Dado um workspace instalado com o lock do kit
    E o time tem agentes de domínio, skills geradas e artefatos do delivery
    Quando o kit é migrado
    Então nenhum desses arquivos aparece no lock do kit
