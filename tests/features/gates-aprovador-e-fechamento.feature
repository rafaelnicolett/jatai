# language: pt
# ADR-0024, decisões do titular de 2026-11-15, itens 2 e 3: o aprovador vem do git e D1 e D2 têm regra de fechamento.
# O item 1 (sem tool MCP de aprovação) também tem cenário aqui e um teste de contrato em tests/contract/mcp-tools.contract.test.ts.
# Step definitions: tests/features/gates-aprovador-e-fechamento.steps.test.ts (o CLI de estado roda como subprocesso).
@bc:estado @persona:operador-humano @release:v1 @risk:high
Funcionalidade: Aprovar gates em nome de quem decide e só com o trabalho anterior fechado
  Como humano que aprova os gates da metodologia
  Quero que a aprovação registre o meu nome do git e só aceite um gate com o trabalho anterior fechado
  Para que a decisão humana fique rastreável e nenhum gate feche com trabalho pendente

  Contexto:
    Dado um workspace com a iniciativa "mod-x" e o repositório "api" no Foundation

  @happy-path
  Cenário: Quem aprova é o usuário do git do workspace
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o humano aprova o gate "d2" da iniciativa "mod-x" sem dizer quem aprova
    Então o gate "d2" da iniciativa "mod-x" fica aprovado por "Pessoa Fictícia"
    E o e-mail do git não aparece no estado gravado

  @happy-path
  Cenário: Quem aprova pode ser informado explicitamente
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o humano aprova o gate "d2" da iniciativa "mod-x" em nome de "Outra Pessoa"
    Então o gate "d2" da iniciativa "mod-x" fica aprovado por "Outra Pessoa"

  @validation
  Cenário: Sem usuário no git, a aprovação pede o nome de quem aprova
    Dado que o git do workspace não tem usuário
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o humano aprova o gate "d2" da iniciativa "mod-x" sem dizer quem aprova
    Então a resposta é um erro de uso que pede o nome de quem aprova
    E o gate "d2" da iniciativa "mod-x" continua sem registro

  @validation
  Cenário: Pelo State Service, sem nome conhecido, o Cockpit recebe o pedido do nome
    Dado que o git do workspace não tem usuário
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o Cockpit pede a aprovação do gate "d2" da iniciativa "mod-x" sem dizer quem aprova
    Então a resposta pede o nome de quem aprova, para o Cockpit perguntar
    E o gate "d2" da iniciativa "mod-x" continua sem registro

  @happy-path
  Cenário: O D1 de um repositório aprova com as fases do Foundation dele concluídas
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que todas as fases do Foundation do repositório "api" estão concluídas
    Quando o humano aprova o gate "d1" do repositório "api"
    Então o Gate D1 do repositório "api" fica aprovado por "Pessoa Fictícia"

  @validation
  Cenário: O D1 com fase do Foundation aberta é recusado com a lista do que falta
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que as fases "quality" e "debt" do Foundation do repositório "api" ainda não estão concluídas
    Quando o humano aprova o gate "d1" do repositório "api"
    Então a resposta é um erro de uso que lista as fases "quality" e "debt"
    E o Gate D1 do repositório "api" continua pendente

  @edge
  Cenário: A fase de design não segura o D1 de um repositório sem frontend
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que o repositório "api" não tem frontend
    E que todas as fases do Foundation do repositório "api" estão concluídas, menos a de design
    Quando o humano aprova o gate "d1" do repositório "api"
    Então o Gate D1 do repositório "api" fica aprovado por "Pessoa Fictícia"

  @validation
  Esquema do Cenário: O D2 só aprova com o roadmap e a matriz de risco aprovados
    Dado que o git do workspace tem o usuário "Pessoa Fictícia", com e-mail
    E que o roadmap da iniciativa "mod-x" está "<roadmap>" e a matriz de risco está "<riscos>"
    Quando o humano aprova o gate "d2" da iniciativa "mod-x" sem dizer quem aprova
    Então a resposta é um erro de uso que lista "<falta>"
    E o gate "d2" da iniciativa "mod-x" continua sem registro

    Exemplos:
      | roadmap  | riscos   | falta                          |
      | pendente | aprovada | roadmap_gate                   |
      | aprovado | ausente  | risk_matrix_gate               |
      | ausente  | ausente  | roadmap_gate, risk_matrix_gate |

  @validation
  Cenário: Nenhuma ferramenta de agente aprova gate
    Quando um agente lista as ferramentas do servidor MCP de estado
    Então nenhuma ferramenta aprova gate
