# language: pt
# F4.2 (parte 2), ADR-0024 (decisões do titular de 2026-11-15): o Cockpit aprova gate pelo mesmo caso de uso do CLI e do State Service,
# com o nome do git, a regra de fechamento e o lock. O painel que o operador vê está em cockpit-decisao-de-gate.feature.
# Step definitions: tests/features/cockpit-aprovacao-no-host.steps.test.ts (o host do Cockpit com as portas do VS Code trocadas por dublês).
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Aprovar gate pelo Cockpit em nome de quem decide
  Como humano que aprova gates no Cockpit
  Quero que a aprovação registre o meu nome do git e só aceite o gate com o trabalho anterior fechado
  Para que a decisão fique rastreável e nenhum gate feche pelo atalho do painel

  Contexto:
    Dado um workspace com a iniciativa "mod-x" e o repositório "api" no Foundation

  @happy-path
  Cenário: Aprovar o D2 pelo Cockpit registra o nome do git de quem decide
    Dado que o git do workspace tem o usuário "Pessoa Fictícia"
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o Cockpit pede a aprovação do gate "d2" da iniciativa "mod-x"
    Então a resposta do Cockpit diz que o gate foi aprovado por "Pessoa Fictícia"
    E o gate "d2" da iniciativa "mod-x" fica aprovado por "Pessoa Fictícia"

  @validation
  Cenário: Sem nome no git, o Cockpit recebe o pedido do nome antes de aprovar
    Dado que o git do workspace não tem usuário
    E que o roadmap e a matriz de risco da iniciativa "mod-x" estão aprovados
    Quando o Cockpit pede a aprovação do gate "d2" da iniciativa "mod-x"
    Então a resposta do Cockpit pede o nome de quem aprova
    E o gate "d2" da iniciativa "mod-x" continua sem registro

  @happy-path
  Cenário: Aprovar o D1 pelo Cockpit grava quem aprovou e o evento sob o lock do estado
    Dado que o git do workspace tem o usuário "Pessoa Fictícia"
    E que todas as fases do Foundation do repositório "api" estão concluídas
    Quando o Cockpit aprova o gate D1 do repositório "api"
    Então o Gate D1 do repositório "api" fica aprovado por "Pessoa Fictícia"
    E o evento de aprovação é gravado com o nome de quem aprovou, na pasta de eventos

  @validation
  Cenário: Aprovar o D1 pelo Cockpit com fase do Foundation aberta é recusado
    Dado que o git do workspace tem o usuário "Pessoa Fictícia"
    E que as fases "quality" e "debt" do Foundation do repositório "api" ainda não estão concluídas
    Quando o Cockpit aprova o gate D1 do repositório "api"
    Então a resposta do Cockpit lista as fases "quality" e "debt" como o que falta
    E o Gate D1 do repositório "api" continua pendente

  @happy-path
  Cenário: O operador marca um item do checklist humano de uma fase da entrega
    Dado a iniciativa "mod-x" ativa, com a fase "business" em andamento
    Quando o Cockpit marca o item "problem-section" do checklist humano da fase "business"
    Então o item "problem-section" fica marcado no estado da iniciativa "mod-x"

  @happy-path
  Cenário: O operador registra a decisão pedida por um agente em seu nome
    Dado que o git do workspace tem o usuário "Pessoa Fictícia"
    E um agente pediu a decisão "titularidade do código" para a tarefa "epic-0/task-1"
    Quando o Cockpit registra a decisão "sou o titular" para a tarefa "epic-0/task-1"
    Então a decisão é gravada por "Pessoa Fictícia", como decisão humana
    E a decisão pedida deixa de esperar o operador

  @validation
  Cenário: Sem nome no git, registrar a decisão pede o nome
    Dado que o git do workspace não tem usuário
    E um agente pediu a decisão "titularidade do código" para a tarefa "epic-0/task-1"
    Quando o Cockpit registra a decisão "sou o titular" para a tarefa "epic-0/task-1"
    Então a resposta do Cockpit pede o nome de quem decide
    E a decisão pedida continua esperando o operador
