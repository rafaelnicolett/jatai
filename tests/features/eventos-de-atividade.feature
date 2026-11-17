# language: pt
# F5.2 da Missão Open Source: o contrato agent-activity (ADR-0020), extensão aditiva de RunEvent.
# Desenho: .github/artifacts/planning/mod-missao-open-source/mapa/contrato-agent-activity.md.
# Step definitions: tests/features/eventos-de-atividade.steps.test.ts.
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Registrar a atividade dos agentes como eventos, nos dois harnesses
  Como operador humano da metodologia
  Quero que toda atividade de agente e toda mudança de estado vire um evento padronizado
  Para acompanhar o trabalho em tempo real, no Claude Code e no Copilot, sem expor conteúdo

  # ── O contrato ─────────────────────────────────────────────────────────────

  @happy-path
  Esquema do Cenário: Cada tipo de evento do contrato volta igual depois de gravado e lido
    Quando um evento "<tipo>" da iniciativa "mod-x" é gravado com os campos do contrato
    Então a leitura devolve o mesmo evento "<tipo>", com os mesmos campos

    Exemplos:
      | tipo               |
      | agent-started      |
      | agent-progress     |
      | agent-done         |
      | artifact-written   |
      | gate-approved      |
      | item-approved      |
      | blocked            |
      | decision-requested |
      | decision-made      |

  @validation
  Cenário: Campos fora do contrato são descartados antes de gravar
    Quando um evento chega com um campo desconhecido e com metadados fora da lista fechada
    Então o evento gravado não tem o campo desconhecido
    E os metadados gravados têm só "reason", "task", "path" e "count"

  @validation
  Cenário: A mensagem passa de 140 caracteres e é cortada na escrita
    Quando um evento chega com uma mensagem de 200 caracteres
    Então a mensagem gravada tem 140 caracteres

  @validation
  Cenário: Um evento sem tipo conhecido é recusado na escrita
    Quando um agente tenta gravar um evento do tipo "agent.exploded"
    Então a gravação é recusada com um erro de uso
    E nenhum evento é gravado

  @validation
  Cenário: O caminho do artefato é relativo ao workspace e nunca sai dele
    Quando um agente tenta gravar um artefato com o caminho "../fora/segredo.txt"
    Então a gravação é recusada com um erro de uso
    E nenhum evento é gravado

  # ── A fonte principal: o estado ────────────────────────────────────────────

  @happy-path
  Cenário: Mudar o status de uma tarefa grava um evento da tarefa
    Quando a tarefa "wave-1/item-1" da iniciativa "mod-x" passa a "in-progress"
    Então um evento da tarefa "wave-1/item-1" da iniciativa "mod-x" é gravado em até 1 segundo
    E o evento aponta o arquivo de estado, sem o conteúdo dele

  @happy-path
  Cenário: Aprovar um gate grava o evento de gate aprovado com quem aprovou
    Quando o humano "Pessoa Fictícia" aprova o gate "d3" da iniciativa "mod-x"
    Então um evento "gate-approved" da iniciativa "mod-x" é gravado por "Pessoa Fictícia", como humano

  @edge
  Cenário: Uma escrita de estado recusada não grava evento
    Quando a tarefa "wave-1/item-1" da iniciativa "mod-x" passa a "blocked" sem motivo
    Então a gravação é recusada com um erro de uso
    E nenhum evento é gravado

  # Decisão humana só entra pelo estado: os canais de agente (CLI runs append, MCP) não registram decision-made.
  @happy-path
  Cenário: Uma decisão humana registrada pelo estado grava quem decidiu
    Dado que o git do workspace tem o usuário "Pessoa Fictícia"
    Quando o humano registra a decisão "titular definido" da tarefa "epic-0/task-0.1" da iniciativa "mod-x"
    Então um evento "decision-made" da tarefa "epic-0/task-0.1" é gravado por "Pessoa Fictícia", como humano

  @validation
  Cenário: Sem o nome de quem decide, a decisão não é registrada
    Dado que o git do workspace não tem usuário
    Quando o humano registra a decisão "titular definido" da tarefa "epic-0/task-0.1" da iniciativa "mod-x"
    Então a gravação é recusada com um erro de uso que pede o nome de quem decide
    E nenhum evento é gravado

  # ── Hooks, CLI e MCP ───────────────────────────────────────────────────────

  # Os hooks do kit (frente K) chamam: runs append --event-type <tipo> --agent-id <id> --artifact-path <path> --harness claude-code.
  # O aviso do Claude Code não traz iniciativa nem fase: quem mostra resolve pela iniciativa ativa.
  @happy-path
  Cenário: O hook do Claude Code registra o início de um subagente pelo CLI, no formato do kit
    Quando o hook registra pelo CLI, sem iniciativa nem fase, que "migration-agent" começou
    Então um evento "agent-started" de "migration-agent", capturado pelo "claude-code", é gravado sem iniciativa

  @happy-path
  Cenário: O hook do Claude Code registra um artefato gravado pelo subagente
    Quando o hook registra pelo CLI que "migration-agent" gravou o artefato ".github/artifacts/execution/relatorio.md"
    Então um evento "artifact-written" com o caminho ".github/artifacts/execution/relatorio.md", capturado pelo "claude-code", é gravado

  @edge
  Cenário: O CLI chamado pelo hook grava no projeto do Claude Code, mesmo rodando de uma subpasta
    Dado que o Claude Code informa a pasta do projeto
    Quando o hook roda o CLI a partir de uma subpasta do projeto
    Então o evento é gravado no projeto informado pelo Claude Code, e não na subpasta

  @validation
  Cenário: O CLI não registra um evento que só um humano pode registrar
    Quando um agente tenta registrar pelo CLI um evento "gate-approved"
    Então a gravação é recusada com um erro de uso
    E nenhum evento é gravado

  @edge
  Cenário: A ferramenta MCP acha o State Service do projeto do Claude Code
    Dado que o Claude Code informa a pasta do projeto e o State Service está no ar nela
    Quando um agente registra pela ferramenta MCP, com o servidor MCP rodando de outra pasta
    Então o evento é gravado no projeto informado pelo Claude Code

  @happy-path
  Cenário: Um agente registra atividade pela ferramenta MCP
    Dado que o State Service está no ar
    Quando um agente registra pela ferramenta MCP que gravou o artefato "execution/relatorio.md"
    Então um evento "artifact-written", capturado pelo "mcp", é gravado com o caminho "execution/relatorio.md"

  # ── O observador de artefatos (fallback do Copilot) ────────────────────────

  @happy-path
  Cenário: Gravar um artefato gera o evento de artefato gravado
    Quando um agente do Copilot grava o artefato ".github/artifacts/execution/relatorio.md"
    Então depois de meio segundo sem nova gravação um evento "artifact-written", capturado pelo "watcher", é gravado
    E o evento aponta ".github/artifacts/execution/relatorio.md", sem o conteúdo

  @edge
  Cenário: Gravações seguidas do mesmo artefato viram um evento só
    Quando um agente do Copilot grava o artefato ".github/artifacts/execution/relatorio.md" 3 vezes seguidas
    Então só um evento "artifact-written" é gravado para esse artefato

  @edge
  Cenário: O observador ignora os eventos, o State Service e os arquivos temporários
    Quando arquivos são gravados em ".github/artifacts/runs/", em ".github/artifacts/.state-service/" e como temporários de escrita
    Então nenhum evento do observador é gravado

  # ── Escrita sob lock e leitura incremental ─────────────────────────────────

  @happy-path
  Cenário: Produtores gravando ao mesmo tempo não perdem eventos
    Quando dois processos gravam 50 eventos cada na iniciativa "mod-x" ao mesmo tempo
    Então o arquivo de eventos da iniciativa tem os 100 eventos, um por linha, todos legíveis

  @edge
  Cenário: O arquivo de eventos da iniciativa roda ao chegar a 5.000 eventos
    Dado que o arquivo de eventos da iniciativa "mod-x" tem 5.000 eventos
    Quando mais um evento da iniciativa "mod-x" é gravado
    Então o arquivo cheio é guardado com os 5.000 eventos
    E o novo evento abre um arquivo novo da iniciativa

  @happy-path
  Cenário: A leitura só lê o que foi acrescentado desde a última vez
    Dado que o Cockpit já leu os eventos do workspace
    Quando um evento novo é acrescentado
    Então a próxima leitura lê só os bytes do evento novo
    E devolve os mesmos eventos que uma leitura completa
