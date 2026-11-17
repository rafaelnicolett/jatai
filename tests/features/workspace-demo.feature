# language: pt
# F7.4 da Missão Open Source: o workspace demo fictício. Gerado em `.demo/` por `npm run demo`
# (scripts/demo-build.mjs), a partir do instalador real do kit e das fixtures de `demo/`.
# Step definitions: tests/features/workspace-demo.steps.test.ts.
@bc:demo @persona:quem-contribui @release:v1 @risk:medium
Funcionalidade: Workspace demo fictício, gerado a partir do kit
  Como quem contribui ou documenta a Jataí
  Quero um projeto de exemplo completo e sem nenhum dado real
  Para tirar prints e GIFs, rodar testes de ponta a ponta e ver o mapa se mexendo sem expor o trabalho de ninguém

  Contexto:
    Dado uma pasta vazia

  @happy-path
  Cenário: O demo nasce do instalador real do kit, com as fixtures por cima
    Quando o demo é gerado nessa pasta
    Então a pasta tem o kit do brownfield instalado para o Claude Code
    E a pasta tem os dois repositórios fictícios e o estado da metodologia do demo

  @happy-path
  Cenário: Gerar o demo de novo na mesma pasta dá o mesmo histórico de atividade
    Dado que o demo já foi gerado nessa pasta
    Quando o demo é gerado de novo nessa pasta
    Então o histórico de atividade é idêntico ao da primeira geração

  @validation
  Cenário: O demo não apaga uma pasta que não é de um demo gerado
    Dado que a pasta já tem um arquivo que não é do demo
    Quando o demo é gerado nessa pasta
    Então a geração recusa e diz o que fazer
    E o arquivo que já existia continua lá

  @happy-path
  Cenário: A Descoberta está concluída nos dois repositórios e o Gate D1 foi aprovado
    Quando o demo é gerado nessa pasta
    Então o inventário traz os repositórios "biblioteca-api" e "biblioteca-web"
    E todas as fases da Descoberta estão concluídas nos dois repositórios
    E o Gate D1 de cada repositório está aprovado por "Pessoa Exemplo"

  @happy-path
  Cenário: O demo traz três iniciativas e a feature em Execução é a ativa
    Quando o demo é gerado nessa pasta
    Então as iniciativas são uma feature em Execução, um hotfix concluído e uma modernização em Planejamento
    E a feature em Execução é a iniciativa ativa

  @happy-path
  Esquema do Cenário: A feature ativa tem uma tarefa em cada estado de trabalho
    Quando o demo é gerado nessa pasta
    Então a feature ativa tem uma tarefa no estado "<estado>"
    E a tarefa tem motivo registrado: <motivo>

    Exemplos:
      | estado      | motivo |
      | done        | não    |
      | in-progress | não    |
      | pending     | não    |
      | blocked     | sim    |
      | failed      | sim    |
      | cancelled   | sim    |
      | skipped     | não    |

  @happy-path
  Cenário: Os gates D1 e D2 estão aprovados por Pessoa Exemplo e o D3 está pendente
    Quando o demo é gerado nessa pasta
    Então o CLI lê o Gate D2 da feature ativa como aprovado por "Pessoa Exemplo"
    E o CLI lê o Gate D3 da feature ativa como pendente
    E o CLI lê o Gate D3 do hotfix como aprovado por "Pessoa Exemplo"

  @happy-path
  Cenário: Cada iniciativa tem o seu estado de entrega, e o CLI o lê
    Quando o demo é gerado nessa pasta
    Então o CLI lê o estado de entrega de cada uma das três iniciativas
    E o estado de entrega da feature ativa mostra a falha e o bloqueio com motivo

  @happy-path
  Cenário: Ler o estado do demo pelo CLI não altera nenhum arquivo
    Quando o demo é gerado nessa pasta
    Então o CLI lê as iniciativas, o estado de entrega e os gates
    E nenhum arquivo do demo muda

  @happy-path
  Cenário: Todo YAML de estado do demo é lido sem erro pelos leitores da Jataí
    Quando o demo é gerado nessa pasta
    Então os leitores de repositórios, Foundation, iniciativas, estado de entrega e grafo de dependências não acusam erro

  @happy-path
  Cenário: Cada linha do histórico de atividade segue o contrato agent-activity
    Quando o demo é gerado nessa pasta
    Então toda linha do histórico é um evento válido do contrato, com os campos obrigatórios
    E o campo de metadados só usa chaves da lista fechada
    E nenhuma mensagem passa de 140 caracteres

  @happy-path
  Cenário: O histórico conta uma história de algumas horas, a partir de uma data fixa
    Quando o demo é gerado nessa pasta
    Então todos os horários do histórico caem no mesmo dia fixo, em ordem crescente em cada arquivo
    E a história dura algumas horas

  @happy-path
  Cenário: O histórico passa pelos quatro streams e pelos gates, com decisão, bloqueio e falha
    Quando o demo é gerado nessa pasta
    Então o histórico tem atividade na Descoberta, no Planejamento, na Execução e na Operação
    E o histórico registra a aprovação dos gates D1, D2 e D3
    E o histórico tem uma decisão pedida e tomada, um bloqueio e uma falha

  @validation
  Cenário: O histórico cita só caminhos de artefatos que existem no demo, nunca conteúdo
    Quando o demo é gerado nessa pasta
    Então todo caminho citado no histórico é relativo à raiz e existe no demo
    E nenhum evento carrega conteúdo de arquivo

  @validation
  Cenário: O demo só tem uma pessoa, a Pessoa Exemplo, e nenhum contato
    Quando o demo é gerado nessa pasta
    Então o único nome de pessoa nas fixtures é "Pessoa Exemplo"
    E nenhum e-mail ou telefone aparece nas fixtures

  @validation
  Cenário: As fixtures não fixam a marca e o workspace gerado não deixa marca sem resolver
    Quando o demo é gerado nessa pasta
    Então nenhuma fixture escreve o nome da marca nem o de uma marca anterior
    E nenhum arquivo do workspace gerado tem placeholder de marca sem resolver

  @validation
  Cenário: O demo fica fora do git e fora do pacote da extensão
    Então a pasta do demo gerado está no .gitignore
    E a pasta das fixtures e a do demo gerado estão no .vscodeignore

  @happy-path
  Cenário: A reprodução ao vivo acrescenta eventos válidos sem apagar o histórico
    Dado que o demo já foi gerado nessa pasta
    Quando a reprodução ao vivo roda nessa pasta, sem esperar entre os eventos
    Então o histórico da feature ganha eventos novos válidos, com o horário de agora
    E os eventos que já existiam continuam como estavam
