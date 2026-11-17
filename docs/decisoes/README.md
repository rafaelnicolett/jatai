# Decisões de arquitetura

As decisões que moldaram a Jataí, uma por arquivo, no formato de ADR
(*Architecture Decision Record*): o contexto, o que foi decidido e as consequências.
Quem lê uma ADR entende por que o código é como é, e o que ainda pode mudar.

Esta pasta é uma **cópia curada** do registro de decisões do projeto: o texto foi
revisto para quem lê o repositório aberto. Nomes e números internos saíram, e nada da
decisão foi trocado. A numeração é a do registro original, por isso alguns números
não aparecem (0003, 0005, 0009 a 0011 e 0021): são decisões que não se aplicam a este
repositório, porque são do produto anterior ou de um modo online que a v1 não tem.

## Índice

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-fluxos-de-delivery-por-tipo-de-iniciativa.md) | Fluxos de delivery diferentes por tipo de iniciativa | proposta |
| [0002](0002-operacoes-como-painel-continuo.md) | Operações é um painel contínuo, não uma fase de iniciativa | proposta |
| [0004](0004-mcp-fronteira-obrigatoria-agente-estado.md) | Tools MCP locais como única fronteira entre o agente e o State Service | proposta |
| [0006](0006-hierarquia-epic-feature-backlog-task.md) | Hierarquia Epic, Feature, Backlog e Task no lugar de Wave e Item | proposta |
| [0007](0007-toggle-hierarquia-retrocompatibilidade.md) | Rollout por uma setting, com retrocompatibilidade permanente de leitura | proposta |
| [0008](0008-contract-epic-status-nao-agora.md) | Contract adiado: `wave_status` continua o formato de escrita padrão | aceita |
| [0012](0012-repositorio-isolado-jatai-strangler-parallel-run.md) | A edição aberta nasce em repositório isolado, por Strangler no nível de repositório | aceita |
| [0013](0013-marca-jatai-simbolo-guarda-marca-como-dado.md) | Marca Jataí, símbolo Guarda e marca como dado | aceita |
| [0014](0014-licenca-mit-dco-liberacao-de-titularidade.md) | Licença MIT, DCO e liberação de titularidade antes de publicar | aceita |
| [0015](0015-v1-aberta-local-sem-envio-de-dados.md) | Escopo da v1 aberta: 100% local e sem envio de dados por padrão | aceita |
| [0016](0016-arquitetura-alvo-nucleo-funcional-casca-imperativa.md) | Arquitetura-alvo: núcleo funcional e casca imperativa | aceita |
| [0017](0017-estado-jatai-yaml-fonte-unica-sem-sqlite.md) | Estado em YAML como única fonte, sem espelho SQLite | aceita |
| [0018](0018-kit-de-agentes-fonte-unica-multi-harness.md) | Kit de agentes como fonte única, com adaptadores por harness | aceita |
| [0019](0019-wizard-app-react-no-webview.md) | Wizard como app React no webview, com o design system do Cockpit | aceita |
| [0020](0020-mapa-isometrico-tempo-real-eventos-de-agente.md) | Mapa isométrico em tempo real sobre eventos de atividade de agente | aceita |
| [0022](0022-status-de-trabalho-blocked-failed-cancelled.md) | Status de trabalho `blocked`, `failed` e `cancelled`, validados na escrita | aceita |
| [0023](0023-api-de-extensao-portas-com-consentimento.md) | API pública de extensão sobre as portas, com consentimento explícito | aceita |
| [0024](0024-cli-de-estado-verbos-de-leitura-e-de-gate.md) | Verbos de leitura e de gate no CLI de estado, com `gate_d3` | aceita |
| [0025](0025-mcp-no-kit-e-agente-jatai-como-entrada-nos-dois-harnesses.md) | Servidor MCP instalado pelo kit e o agente `jatai` como entrada | aceita |
| [0026](0026-opencode-como-terceiro-harness.md) | OpenCode como terceiro harness nativo (agentes, skills, comandos, MCP e atividade) | aceita |

## Por tema

- **O que a Jataí é e o que ela não faz:** 0012 (repositório e histórico novos),
  0013 (nome e marca), 0014 (licença), 0015 (100% local, sem envio de dados).
- **Como o código é organizado:** 0016 (núcleo e casca), 0017 (o estado em YAML),
  0004 e 0025 (o servidor MCP), 0019 (o Wizard).
- **A metodologia nos arquivos:** 0001 (fluxo por tipo de iniciativa), 0002 (a
  Operação), 0006 a 0008 (épicos e tarefas), 0022 (status de trabalho), 0024 (o CLI
  de estado e os gates).
- **O kit e a extensão:** 0018 (o kit), 0023 (a API para outras extensões), 0026
  (o OpenCode como terceiro harness).
- **O mapa:** 0020 (eventos de atividade e o mapa em tempo real).

## Como propor uma decisão nova

Uma ADR nasce como proposta, num PR, e entra quando é aceita. Uma ADR aceita não é
editada: se a decisão mudar, uma nova a substitui, e a antiga ganha o status
"substituída pela ADR-NNNN". O [GOVERNANCE.md](../../GOVERNANCE.md) diz quando uma
mudança precisa de ADR e qual é o formato mínimo.
