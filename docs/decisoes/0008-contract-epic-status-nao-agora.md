# ADR-0008: Contract adiado, `wave_status` continua o formato de escrita padrão

## Status

aceita. É uma decisão de fechamento: ao contrário das ADRs 0006 e 0007, esta não
propõe uma mudança de comportamento. Ela decide explicitamente **não fazer** uma
mudança agora, então não há nada a validar em uso real antes de aceitá-la.

## Contexto

Uma decisão pendente da hierarquia ([ADR-0006](0006-hierarquia-epic-feature-backlog-task.md)
e [ADR-0007](0007-toggle-hierarquia-retrocompatibilidade.md)) era quando
`wave_status` e `WaveItemStatusEntry` deixam de ser o formato de escrita **padrão**,
cedendo o lugar a `epic_status` e `TaskStatusEntry`. A leitura dos dois formatos é
permanente por desenho (ADR-0007): a pergunta aqui é só sobre o que um writer **novo**
prefere quando nada mais decide por ele.

A evidência disponível para decidir, depois de a hierarquia rodar de verdade:

- **Uma única iniciativa real**, deliberadamente uma validação e não trabalho de
  produto, usou `epic_status`. Todas as outras continuavam 100% em `wave_status`.
- A validação expôs uma fragilidade operacional real, não hipotética: um State Service
  já rodando (no Extension Host de uma janela do VS Code aberta) intercepta as
  escritas do CLI antes do fallback local, e pode ficar desatualizado em relação ao
  código-fonte por horas ou dias, até um reload. Ou seja, **nem todo caminho de
  escrita disponível na prática já sabia escrever `epic_status`**: só o binário
  recompilado sabia, e o processo já em memória, não.
- Não existia nenhum consumidor de produto (uma tela de criação de iniciativa, por
  exemplo) que oferecesse a escolha de vocabulário a uma pessoa. A única forma de uma
  iniciativa nova nascer em `epic_status` era um agente passar
  `--hierarchy epic-feature-backlog-task` explicitamente.

## Decisão

**Não trocar o padrão agora.** `wave_status` continua sendo o que
`initiatives create` e `upsert-wave-item` escrevem sem uma flag explícita, e continua
sendo o vocabulário que o modelo de ondas do hotfix e o restante da documentação de
agente apresentam primeiro. `epic_status` segue disponível, funcional e testado
([ADR-0006](0006-hierarquia-epic-feature-backlog-task.md)), mas como **opt-in
explícito**, e não como padrão.

Não fixamos uma data nem um critério numérico ("depois de N iniciativas reais") para
revisitar: seria uma previsão sem base. O critério é qualitativo: revisitar esta ADR
quando houver **evidência de uso real** (uma iniciativa de produto de verdade, e não
uma validação, escolhendo `epic_status` porque uma pessoa decidiu que o vocabulário
novo vale a pena para aquele trabalho), a favor ou contra a troca do padrão.

É o mesmo tipo de decisão do fallback permanente em YAML do CLI
([ADR-0017](0017-estado-jatai-yaml-fonte-unica-sem-sqlite.md)): não é "ainda não
decidimos", e sim "decidimos manter como está, com a justificativa registrada,
revisitável se o cenário mudar".

## Consequências

**Positivas:**
- Zero risco de regressão para as iniciativas já registradas e para qualquer outro
  workspace em produção: nenhuma delas seria afetada por uma troca de padrão que esta
  ADR explicitamente não faz.
- Os agentes continuam ensinando o caminho já validado (`wave_status`) como o primeiro,
  com o novo como alternativa documentada, sem forçar ninguém a aprender um vocabulário
  novo para tarefas comuns.
- Não trava a evolução: `epic_status` já está pronto, testado (CLI, State Service,
  HTTP e MCP) e disponível para quem quiser usá-lo de propósito. A decisão é só sobre
  o **padrão**, e não sobre a **disponibilidade**.

**Negativas:**
- A hierarquia Epic, Feature, Backlog e Task, que motivou a mudança, **não aparece
  automaticamente em nenhuma iniciativa nova** enquanto ninguém pedir explicitamente. O
  ganho de "alinhamento com o vocabulário de mercado" só se realiza com adoção
  deliberada, caso a caso.
- Existem agora dois vocabulários paralelos permanentemente no código (`wave_status` e
  `epic_status`, `WaveStatusEntry` e `EpicStatusEntry`, mesmo sendo aliases): mais uma
  coisa para quem chega entender, mitigada pela documentação cruzada.
- A fragilidade operacional encontrada (um State Service já em memória não conhece o
  vocabulário novo até um reload) significa que, mesmo que alguém decida usar
  `epic_status` de propósito, o resultado pode ser gravado em silêncio no formato
  errado se o processo do Extension Host estiver desatualizado. É um risco real, não
  coberto por teste automatizado (é um cenário de ambiente, e não de unidade), só
  documentado.

Veja [iniciativas](../metodologia/iniciativas.md#épicos-tarefas-e-o-estado-de-cada-uma).
