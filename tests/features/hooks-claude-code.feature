# language: pt
# F5.2 (fonte "hooks do kit" do contrato agent-activity), instalada pelo kit na F3.5.
# Contrato: .github/artifacts/planning/mod-missao-open-source/mapa/contrato-agent-activity.md §4.
# Step definitions: tests/features/hooks-claude-code.steps.test.ts.
@bc:kit @persona:time-do-cliente @release:v1 @risk:medium
Funcionalidade: Hooks do Claude Code que registram a atividade dos agentes
  Como time que acompanha o delivery no mapa da colmeia
  Quero que o kit registre no Claude Code quando um agente começa, termina e grava um artefato
  Para que o mapa mostre quem está trabalhando e o que foi entregue, sem depender de o agente lembrar de avisar

  @happy-path
  Esquema do Cenário: A instalação no Claude Code registra os hooks de atividade de agente
    Quando o kit é instalado num projeto "<modo>" para o Claude Code
    Então os hooks do projeto chamam o registro de atividade no início e no fim de cada subagente
    E os hooks do projeto chamam o registro de atividade quando um arquivo é gravado

    Exemplos:
      | modo       |
      | brownfield |
      | greenfield |

  @edge
  Cenário: A instalação no Copilot não cria configuração do Claude Code
    Quando o kit é instalado num projeto "brownfield" para o Copilot
    Então o workspace não ganha configuração de projeto do Claude Code

  @happy-path
  Esquema do Cenário: Início e fim de subagente viram eventos com o nome do agente
    Dado um workspace com os hooks do kit
    Quando o Claude Code avisa o "<aviso>" do agente "feature-adder"
    Então o registro de atividade recebe o evento "<evento>" do agente "feature-adder" vindo do "claude-code"

    Exemplos:
      | aviso          | evento        |
      | SubagentStart  | agent-started |
      | SubagentStop   | agent-done    |

  @happy-path
  Cenário: A gravação de um artefato vira evento com o caminho relativo ao workspace
    Dado um workspace com os hooks do kit
    Quando o agente "feature-adder" grava ".github/artifacts/execution/feature-report-app.md"
    Então o registro de atividade recebe o evento "artifact-written" do agente "feature-adder" com o caminho ".github/artifacts/execution/feature-report-app.md"

  @edge
  Esquema do Cenário: Gravações fora dos artefatos do delivery não viram evento
    Dado um workspace com os hooks do kit
    Quando o agente "feature-adder" grava "<arquivo>"
    Então o registro de atividade não recebe nada

    Exemplos:
      | arquivo                                      |
      | repos/app/src/Main.java                      |
      | .github/artifacts/runs/mod-x/events.jsonl    |
      | .github/artifacts/.state-service/server.json |

  @edge
  Cenário: A migração preserva o que o time configurou no Claude Code
    Dado um workspace cuja configuração de projeto do Claude Code tem permissões e um hook do time
    Quando o kit é migrado duas vezes
    Então as permissões e o hook do time continuam exatamente como estavam
    E os hooks do kit aparecem uma vez só

  @error
  Cenário: Uma configuração do Claude Code que não é JSON puro não é sobrescrita
    Dado um workspace cuja configuração de projeto do Claude Code não é JSON puro
    Quando o kit é migrado
    Então a configuração de projeto do Claude Code continua byte a byte como estava

  @error
  Cenário: O hook nunca atrapalha o agente
    Dado um workspace com os hooks do kit em que o registro de atividade falha
    Quando o Claude Code avisa o "SubagentStart" do agente "feature-adder"
    Então o hook termina sem erro
