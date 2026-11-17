# language: pt
# F3.5 (G7), decisão: ADR-0025. Step definitions: tests/features/mcp-no-kit.steps.test.ts.
@bc:kit @persona:time-do-cliente @release:v1 @risk:high
Funcionalidade: Servidor MCP do estado instalado pelo kit nos dois harnesses
  Como time que conduz o delivery com a Jataí no Claude Code ou no Copilot
  Quero que o kit instale e configure no workspace o servidor MCP do estado
  Para que os agentes leiam e gravem o estado pelas tools MCP, com lock e validação, nos dois harnesses

  @happy-path
  Esquema do Cenário: A instalação configura o servidor MCP nos dois harnesses
    Quando o kit é instalado num projeto "<modo>" para o harness "<harness>"
    Então o servidor MCP do kit fica na pasta de scripts do workspace
    E a configuração MCP do Claude Code declara o servidor da marca pelo caminho relativo ao workspace
    E a configuração MCP do Copilot declara o servidor da marca pelo caminho relativo ao workspace

    Exemplos:
      | modo       | harness |
      | brownfield | claude  |
      | brownfield | copilot |
      | greenfield | claude  |
      | greenfield | copilot |

  @happy-path
  Cenário: A migração leva o servidor MCP a um workspace instalado antes dele
    Dado um workspace instalado por uma versão do kit sem servidor MCP
    Quando o kit é migrado
    Então o servidor MCP do kit fica na pasta de scripts do workspace
    E as duas configurações MCP declaram o servidor da marca

  @edge
  Cenário: A migração preserva os servidores MCP que o time já declarou
    Dado um workspace cujas duas configurações MCP declaram o servidor "banco-do-time"
    Quando o kit é migrado
    Então as duas configurações continuam declarando "banco-do-time" exatamente como estava
    E as duas configurações passam a declarar também o servidor da marca

  @edge
  Cenário: A migração atualiza a entrada da marca sem duplicá-la
    Dado um workspace cuja configuração MCP do Claude Code declara o servidor da marca com um caminho antigo
    Quando o kit é migrado duas vezes
    Então a configuração MCP do Claude Code declara o servidor da marca uma vez só, pelo caminho do kit

  @error
  Cenário: Uma configuração MCP que não é JSON puro não é sobrescrita
    Dado um workspace cuja configuração MCP do Copilot tem comentários
    Quando o kit é migrado
    Então a configuração MCP do Copilot continua byte a byte como estava
    E a configuração MCP do Claude Code declara o servidor da marca

  @happy-path
  Cenário: O servidor MCP do kit é o build da fonte atual
    Quando o servidor MCP é construído a partir da fonte
    Então o resultado é byte a byte o servidor que o kit leva

  @validation
  Cenário: O servidor MCP do kit não fala com a rede externa
    Dado o servidor MCP que o kit leva
    Então ele só cita hosts da allowlist de zero egress
