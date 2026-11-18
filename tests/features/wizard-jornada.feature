# language: pt
# F4.3 (Wizard como jornada guiada) e G9 (primeiro uso), ADR-0019, ADR-0025, ADR-0015.
# Step definitions: webview-ui/tests/wizard-jornada.steps.test.tsx. Elas rodam o fluxo do Wizard
# e a sessão do host juntos, sem o VS Code, e conferem o que a pessoa vê e ouve no leitor de tela.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:medium
Funcionalidade: Jornada guiada de preparação da Jataí
  Como pessoa que vai usar a Jataí pela primeira vez
  Quero ser conduzida do convite até o primeiro passo no agente jatai, só pelo teclado se eu preferir
  Para saber o que será escrito, onde e por quê, antes de qualquer arquivo mudar

  @happy-path
  Cenário: A abertura diz o que a Jataí vai fazer e o que não vai fazer
    Quando a pessoa abre a jornada
    Então a Jataí diz que vai instalar agentes, skills e instruções na pasta escolhida
    E diz que nada sai do computador
    E diz que os repositórios existentes não são alterados
    E diz que nada é escrito antes da revisão

  @happy-path @bug:L6
  Cenário: Escolher projeto existente leva direto aos passos do projeto existente
    Dado que a pessoa chegou à escolha do modo
    Quando ela escolhe "Projeto existente" e avança
    Então a Jataí troca a jornada para o projeto existente de uma só vez
    E nenhum passo do projeto novo aparece antes do passo do harness

  @edge @bug:GAP-20
  Cenário: É possível voltar à escolha do modo e trocar de ideia
    Dado que a pessoa escolheu "Projeto existente" e está no passo do harness
    Quando ela volta à escolha do modo e escolhe "Projeto novo"
    Então a Jataí troca a jornada para o projeto novo
    E a pessoa segue pelos passos do projeto novo

  @edge @bug:GAP-20
  Cenário: Recarregar a janela do Wizard devolve a pessoa ao passo em que estava
    Dado que a pessoa informou o nome "loja-demo" e escolheu o harness "Claude Code"
    Quando a janela do Wizard é recarregada
    Então a pessoa volta ao mesmo passo
    E o nome "loja-demo" e o harness "Claude Code" continuam preenchidos

  @happy-path
  Esquema do Cenário: Cada harness mostra o que instala e onde
    Dado que a pessoa chegou ao passo do harness
    Quando ela olha a opção "<harness>"
    Então a Jataí lista que o agente jatai, a entrada da metodologia, fica em "<entrada>"
    E que as skills ficam em "<skills>"
    E que as instruções ficam em "<instrucoes>"
    E que o servidor MCP fica em "<mcp>"

    Exemplos:
      | harness        | entrada                       | skills          | instrucoes                      | mcp              |
      | Claude Code    | .claude/agents/jatai.agent.md | .claude/skills/ | CLAUDE.md e AGENTS.md           | .mcp.json        |
      | GitHub Copilot | .github/agents/jatai.agent.md | .github/skills/ | .github/copilot-instructions.md e AGENTS.md | .vscode/mcp.json |
      | OpenCode       | .opencode/agents/jatai.md      | .opencode/skills/ | AGENTS.md                     | opencode.json    |

  @happy-path
  Cenário: Claude e OpenCode instalam atividade (hooks/plugin), e o chat da extensão é o guia
    Dado que a pessoa chegou ao passo do harness
    Quando ela compara as opções "Claude Code", "GitHub Copilot" e "OpenCode"
    Então "Claude Code" e "OpenCode" listam atividade, em ".claude/settings.json" e ".opencode/plugins/jatai-activity.ts"
    E a Jataí diz que o chat da extensão, o guia, leva ao agente jatai
    E nenhum texto cita o chat antigo da extensão

  @validation @bug:H-BUG-20
  Esquema do Cenário: Nome de projeto inválido é recusado na hora, com um nome sugerido
    Dado que a pessoa está no passo do projeto novo
    Quando ela informa o nome "<nome>"
    Então a Jataí diz que o nome só aceita letras minúsculas, números e hífen
    E sugere o nome "<sugestao>"
    E a pessoa não consegue avançar até corrigir

    Exemplos:
      | nome      | sugestao  |
      | Loja Demo | loja-demo |
      | Meu App!  | meu-app   |
      | ação      | acao      |

  @happy-path
  Cenário: Nome de projeto válido deixa seguir
    Dado que a pessoa está no passo do projeto novo
    Quando ela informa o nome "loja-demo" e a ideia do produto
    Então a pessoa consegue avançar

  @validation @bug:H-BUG-25
  Cenário: Trocar a stack do backend refaz a prévia da estrutura
    Dado que a pessoa chegou à revisão com o backend "FastAPI"
    Quando ela volta, escolhe o backend "Spring Boot" e chega de novo à revisão
    Então a Jataí pede uma prévia nova para o backend "Spring Boot"
    E a pessoa só consegue instalar depois que a prévia nova chega

  @validation @bug:H-BUG-52
  Cenário: Sem a pasta do workspace não dá para seguir, e a Jataí diz por quê
    Dado que a pessoa escolheu "Projeto existente" e chegou ao passo da pasta
    Quando ela ainda não escolheu nenhuma pasta
    Então a pessoa não consegue avançar
    E a Jataí diz que falta escolher a pasta do workspace

  @happy-path
  Cenário: A Jataí explica que os repositórios entram depois, pelo agente jatai
    Dado que a pessoa escolheu "Projeto existente" e escolheu a pasta
    Quando ela chega ao passo dos repositórios
    Então a Jataí diz que o agente jatai pergunta quais repositórios entram
    E diz que os repositórios ficam em "repos/" e não são alterados

  @happy-path
  Cenário: Os frameworks de maturidade partem do DORA 4 Keys
    Dado que a pessoa chegou ao passo dos frameworks de maturidade
    Quando ela soma o framework "Tech Radar"
    Então os frameworks escolhidos são "DORA 4 Keys" e "Tech Radar"

  @validation
  Cenário: Sem pasta aberta, a Jataí pergunta onde criar o projeto
    Dado que nenhuma pasta está aberta no editor
    Quando a pessoa chega ao passo do local do projeto novo
    Então a Jataí pede que ela escolha onde criar
    E a pessoa não consegue avançar antes de escolher
    E a Jataí não propõe a pasta pessoal como lugar do projeto

  @validation
  Cenário: Sem pasta aberta e sem lugar escolhido, a Jataí não cria o projeto na pasta pessoal
    Dado que nenhuma pasta está aberta no editor
    E que o estado do projeto novo está completo, sem lugar escolhido
    Quando o Wizard pede para criar o projeto
    Então a Jataí recusa e pede que a pessoa escolha onde criar
    E nenhuma geração é iniciada

  @happy-path
  Cenário: Com uma pasta aberta, o projeto nasce dentro dela e a pessoa pode escolher outro lugar
    Dado que a pasta "/trabalho/oficina" está aberta no editor
    Quando a pessoa chega ao passo do local do projeto novo com o nome "loja-demo"
    Então a Jataí mostra que o projeto nasce em "/trabalho/oficina/loja-demo"
    E a pessoa pode escolher outro lugar

  @edge
  Cenário: Com mais de uma pasta aberta, a Jataí avisa que a v1 usa uma pasta por janela
    Dado que duas pastas estão abertas no editor
    Quando a pessoa chega ao passo do local do projeto novo
    Então a Jataí avisa que a v1 trabalha com uma pasta por janela
    E diz que usa a primeira pasta aberta

  @happy-path
  Cenário: A revisão lista o que será escrito e onde, e nada é escrito enquanto a pessoa revisa
    Dado que a pessoa preencheu todos os passos do projeto existente com o harness "Claude Code"
    Quando ela chega à revisão
    Então a Jataí lista o que será escrito, com a pasta de destino
    E nenhum arquivo do workspace muda até ela confirmar

  @happy-path
  Cenário: Durante a instalação a Jataí mostra que está trabalhando e anuncia o resultado
    Dado que a pessoa confirmou a revisão do projeto existente
    Quando a instalação termina com sucesso
    Então a Jataí anuncia que a instalação terminou
    E o Wizard mostra o passo "Pronto"

  @error @bug:H-BUG-20
  Cenário: Falha da instalação devolve a pessoa à revisão, com o motivo e a opção de tentar de novo
    Dado que a pessoa confirmou a revisão do projeto existente
    Quando a instalação falha com o motivo "disco cheio"
    Então a Jataí anuncia a falha com o motivo "disco cheio"
    E a pessoa pode tentar de novo ou voltar à revisão

  @error @bug:H-BUG-20
  Cenário: Pasta recusada pela Jataí leva a pessoa de volta ao passo da pasta, com o motivo
    Dado que a pessoa confirmou a revisão do projeto existente numa pasta que já tem conteúdo
    Quando a Jataí recusa a pasta com o motivo "Pasta não está vazia"
    Então a pessoa volta ao passo da pasta
    E vê o motivo "Pasta não está vazia" junto da pasta
    E o avanço volta a ficar disponível, sem ficar preso em "Instalando…"

  @happy-path
  Esquema do Cenário: O Pronto aponta o próximo passo no harness escolhido
    Dado que a instalação terminou com o harness "<harness>"
    Quando a pessoa lê o passo "Pronto"
    Então a Jataí manda entrar pelo agente jatai no chat do "<harness>"

    Exemplos:
      | harness        |
      | Claude Code    |
      | GitHub Copilot |
      | OpenCode       |

  @happy-path
  Cenário: O Pronto oferece abrir o Cockpit quando a pasta instalada é a pasta aberta
    Dado que a instalação terminou na pasta que está aberta no editor
    Quando a pessoa pede para abrir o Cockpit
    Então o Wizard pede ao editor que abra o Cockpit

  @edge
  Cenário: O Pronto pede para abrir a pasta quando ela não é a pasta aberta
    Dado que a instalação terminou numa pasta diferente da que está aberta no editor
    Quando a pessoa lê o passo "Pronto"
    Então a Jataí pede que ela abra a pasta instalada antes de seguir
    E não oferece abrir o Cockpit

  @happy-path
  Cenário: A jornada inteira se conclui só pelo teclado
    Dado que a pessoa usa só o teclado
    Quando ela escolhe o modo com as setas, avança com Enter e volta com Esc
    Então cada escolha é feita por um grupo de opções que se percorre com as setas
    E Enter avança quando o passo permite
    E Esc volta ao passo anterior

  @happy-path
  Cenário: Ao trocar de passo, o foco vai para o título do passo
    Dado que a pessoa está num passo da jornada
    Quando ela avança para o passo seguinte
    Então o foco do teclado fica no título do novo passo

  @happy-path
  Cenário: O progresso e os erros são anunciados a quem usa leitor de tela
    Dado que a pessoa usa um leitor de tela
    Quando a instalação começa e depois falha
    Então o progresso é anunciado numa região de avisos educados
    E o erro é anunciado como alerta

  @validation
  Cenário: O foco visível, o alto contraste e o movimento reduzido são respeitados
    Dado que a jornada é desenhada com o design system da Jataí
    Quando a pessoa usa alto contraste ou pede menos movimento
    Então todo controle tem foco visível
    E as cores do sistema valem no alto contraste
    E nada se move quando o movimento reduzido está ligado

  @happy-path @bug:G9
  Cenário: Numa pasta que não é da Jataí, a barra lateral convida a começar
    Dado que a pasta aberta não é um workspace da Jataí
    Quando a pessoa abre a barra lateral da Jataí
    Então a barra lateral oferece "Começar com a Jataí"

  @happy-path @bug:G9
  Cenário: Sem pasta aberta, a barra lateral oferece abrir uma pasta ou criar um projeto novo
    Dado que nenhuma pasta está aberta no editor
    Quando a pessoa abre a barra lateral da Jataí
    Então a barra lateral oferece "Abrir uma pasta" e "Criar um projeto novo"

  @edge @bug:G9
  Cenário: Num workspace da Jataí, o convite não aparece
    Dado que a pasta aberta é um workspace da Jataí
    Quando a extensão termina de iniciar
    Então o convite para começar fica escondido

  @edge @bug:G9
  Cenário: Quando a pasta vira workspace da Jataí, o convite some sem recarregar a janela
    Dado que a pasta aberta não é um workspace da Jataí
    Quando a instalação cria o arquivo de configuração na pasta aberta
    Então o convite para começar some

  @edge @bug:BUG-53
  Cenário: Pedir para começar duas vezes seguidas abre um só Wizard
    Dado que a pasta aberta não é um workspace da Jataí
    Quando a pessoa pede para começar com a Jataí duas vezes seguidas
    Então existe um só painel do Wizard
