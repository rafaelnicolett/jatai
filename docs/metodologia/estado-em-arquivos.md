# Estado em arquivos

Na Jataí, o arquivo é a fonte da verdade. O que os agentes descobrem e o que você
decide ficam em `.github/artifacts/`, em YAML e Markdown, dentro do próprio
projeto. O Cockpit, o mapa e o chat são janelas sobre esses arquivos: se o arquivo
diz uma coisa e a tela mostra outra, é um bug, não um cache desatualizado.

Isso traz três ganhos:

- **auditável**: `git diff` e `git blame` mostram quem mudou o quê e quando;
- **portátil**: o mesmo estado serve ao Claude Code, ao GitHub Copilot e a quem lê
  sem nenhuma ferramenta;
- **retomável**: se você parar no meio, o arquivo sabe onde você parou. Nunca
  recomece do zero por insegurança.

## O que fica onde

| Arquivo | O que guarda | Quem escreve |
|---|---|---|
| `jatai.config.yaml` | o host de IA, a versão do kit e o modo do projeto | a instalação do kit |
| `.github/artifacts/repos.yaml` | o inventário de repositórios e o que a Descoberta aprendeu de cada um | a Descoberta |
| `.github/artifacts/assessment/` | os relatórios da Descoberta e o `foundation-state.yaml` (fases e D1) | os agentes da Descoberta |
| `.github/artifacts/initiatives.yaml` | as iniciativas, qual está ativa, os gates D2 e D3, épicos ou ondas e tarefas | o CLI, o MCP e o Cockpit |
| `.github/artifacts/initiatives/<id>/delivery-state.yaml` | o estado das fases de entrega de uma iniciativa | o CLI, o MCP e o Cockpit |
| `.github/artifacts/planning/<iniciativa>/` | o roadmap e a matriz de risco | os agentes do Planejamento |
| `docs/adr/` | as decisões de arquitetura | `@adr-recorder` e você |
| `.github/artifacts/execution/` | um relatório por agente e por tarefa | os agentes da Execução |
| `.github/artifacts/operations/` e `incidents/` | a esteira, a saúde dos serviços, incidentes e post-mortems | os agentes da Operação |
| `.github/artifacts/runs/*.jsonl` | a atividade dos agentes, um evento por linha | os agentes, os hooks e o estado |
| `.github/kit.lock.json` | o que o kit instalou, com checksum | a instalação e a migração do kit |

Os caminhos e os formatos desses arquivos são um contrato: só mudam de forma
aditiva e com uma ADR, porque outras ferramentas e workspaces já existentes
dependem deles.

## Quem escreve o estado

Agentes não editam `initiatives.yaml` nem `delivery-state.yaml` à mão. Eles passam
por uma ferramenta que faz o merge estrutural e valida o que entra:

- o **CLI de estado** (`jatai-state`), instalado em `.github/scripts/`, com os
  artefatos `initiatives`, `delivery-state` e `gates`. Toda saída é uma linha JSON,
  e o código de saída diz se foi sucesso, erro de uso ou erro interno;
- o **servidor MCP**, instalado pelo kit e configurado em `.mcp.json` (Claude Code)
  e `.vscode/mcp.json` (Copilot), que expõe as mesmas operações como tools;
- o **State Service** local, que roda na extensão, escuta só em `127.0.0.1` e entrega
  mudanças ao Cockpit por eventos.

Todos usam o mesmo caso de uso e o mesmo **lock de arquivo**, então duas escritas
ao mesmo tempo não corrompem nada. Se o State Service não estiver no ar, o CLI
grava direto no YAML, sob o mesmo lock. A razão para a regra é prática: editar o
arquivo de iniciativas na mão arrisca duplicar uma chave, e uma chave duplicada
derruba a leitura do arquivo inteiro para todas as iniciativas.

Nada disso sai da sua máquina. O servidor só fala com o `localhost`, e a Jataí não
envia telemetria.

## Status de trabalho

Uma fase de entrega e uma tarefa usam o mesmo vocabulário de sete status:

| Status | Fechado | Quando | Pede motivo |
|---|---|---|---|
| `pending` | não | ainda não começou | não |
| `in-progress` | não | alguém, agente ou pessoa, está fazendo | não |
| `blocked` | não | algo de fora impede o avanço: dependência, decisão, insumo | sim |
| `failed` | não | a execução terminou com erro e nada foi entregue; é para reexecutar | sim |
| `done` | sim | entregue | não |
| `skipped` | sim | não se aplica por configuração, decidido pelo fluxo | não |
| `cancelled` | sim | uma pessoa decidiu não fazer, e o escopo foi cortado | sim |

Duas distinções ajudam. `skipped` é automático e esperado, e `cancelled` é uma
decisão humana registrada com motivo. `blocked` espera algo de fora, e `failed` é
uma tentativa que deu errado.

A escrita é validada: um status fora desse vocabulário, ou `blocked`, `failed` ou
`cancelled` sem `reason`, é um erro de uso, e nada é gravado. A leitura é
tolerante, mas honesta: um valor desconhecido, escrito à mão, é preservado e
aparece como "status desconhecido", com aviso. Ele nunca é rebaixado em silêncio
para `pending`.

A iniciativa também pode ser `cancelled`, com motivo. O bloqueio de uma iniciativa
não é um status: ele é derivado das tarefas dela.

## Atividade dos agentes

Entre um gate e outro, os agentes escrevem em `.github/artifacts/runs/` uma linha
JSON por evento: um agente começou, avançou, terminou, gravou um artefato, ficou
bloqueado, ou uma decisão foi pedida ou tomada. É o que dá vida ao Cockpit e ao
mapa entre dois gates, e é efêmero: se a pasta sumir, o estado durável continua
inteiro e só se perde o histórico de atividade. Por isso `runs/` fica fora do git
por padrão.

Os eventos guardam **só metadados**: o agente, a etapa, o caminho de um artefato,
uma frase de até 140 caracteres e, em `metadata`, apenas `reason`, `task`, `path`
e `count`. Nenhum evento carrega conteúdo de arquivo, prompt, diff ou saída de
ferramenta. O [workspace demo](../../demo/README.md) traz um histórico completo
para você ver como é.
