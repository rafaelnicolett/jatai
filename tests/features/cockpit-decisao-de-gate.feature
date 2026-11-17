# language: pt
# F4.2 (parte 2), G3: o painel de decisão dos gates e das decisões pedidas por agente (ADR-0024, regra de fechamento de gate-readiness).
# O lado do host (quem grava a aprovação) está em cockpit-aprovacao-no-host.feature.
# Step definitions: webview-ui/tests/features/cockpit-decisao-de-gate.steps.test.tsx (modelo da decisão e o diálogo no jsdom).
@bc:helyx-delivery-methodology @persona:operador-humano @release:v1.0 @risk:high
Funcionalidade: Decidir um gate com o checklist humano e a regra de fechamento à vista
  Como operador humano que aprova os gates da metodologia
  Quero ver o que falta para o gate fechar e marcar o meu checklist na própria decisão
  Para aprovar só quando o trabalho anterior está de fato fechado

  @validation
  Cenário: A decisão do D3 lista o que falta e o botão de aprovar fica desabilitado com o motivo
    Dado a iniciativa "mod-x" com a tarefa "epic-0/task-1" feita e a tarefa "epic-0/task-2" em andamento
    Quando o operador abre a decisão do gate "D3"
    Então a decisão lista "epic-0/task-2" como o que falta para fechar
    E o botão de aprovar fica desabilitado, dizendo que falta fechar 1 tarefa

  @edge
  Cenário: A decisão do D3 lista as tarefas canceladas com o motivo
    Dado a iniciativa "mod-x" com a tarefa "epic-0/task-1" feita e a tarefa "epic-0/task-2" cancelada pelo motivo "escopo cortado pelo dono"
    Quando o operador abre a decisão do gate "D3"
    Então a decisão lista "epic-0/task-2" como cancelada: "escopo cortado pelo dono"
    E o botão de aprovar fica habilitado

  @validation
  Cenário: A decisão do D2 lista as aprovações de Planejamento que faltam
    Dado a iniciativa "mod-x" com o roadmap aprovado e a matriz de risco ainda não aprovada
    Quando o operador abre a decisão do gate "D2"
    Então a decisão lista "risk_matrix_gate" como o que falta para fechar
    E o botão de aprovar fica desabilitado, dizendo que falta fechar 1 aprovação

  @happy-path
  Cenário: A fase em revisão mostra o checklist humano marcável
    Dado a iniciativa "loja" de entrega com a fase "business" em revisão e o checklist humano da fase todo desmarcado
    Quando o operador abre a decisão da fase "business"
    Então a decisão mostra os itens do checklist humano da fase, todos desmarcados
    E cada item pode ser marcado pelo operador

  @validation
  Cenário: A fase em revisão só aprova com os itens obrigatórios marcados
    Dado a iniciativa "loja" de entrega com a fase "business" em revisão e o checklist humano da fase todo desmarcado
    Quando o operador abre a decisão da fase "business"
    Então o botão de aprovar fica desabilitado, dizendo que falta marcar os itens obrigatórios
    Quando o operador marca todos os itens obrigatórios
    Então o botão de aprovar fica habilitado

  @validation
  Cenário: A decisão pedida por um agente pede o nome de quem decide quando o git não tem usuário
    Dado um agente pediu a decisão "titularidade do código" e o git do workspace não tem usuário
    Quando o operador registra a decisão
    Então a decisão pede o nome de quem decide antes de registrar
