# ADR-0004: Tools MCP locais como única fronteira entre o agente e o State Service

## Status

proposta.

## Contexto

O State Service expõe uma API HTTP local, e surge a questão de como os agentes devem
falar com ela. O padrão que já existia era indireto: os agentes nunca tocam
`initiatives.yaml` nem `delivery-state.yaml`. O orquestrador já proibia isso
explicitamente ("nunca edite `initiatives.yaml` na mão") e exigia passar pelo CLI de
estado, que faz o merge estrutural correto.

O requisito do titular: o agente **não** deve acessar a API local diretamente. Deve
existir uma camada de tools MCP local, que o agente usa, e é essa camada que fala com
a API.

## Decisão

Nenhum agente chama a API do State Service diretamente, nem por `curl`, nem por um
cliente HTTP embutido numa skill ou num prompt. Toda interação entre o agente e o
estado passa por um **servidor MCP de tools local**, que traduz cada chamada de tool
numa chamada HTTP interna ao State Service. É uma camada anticorrupção (Anti-Corruption
Layer) entre o vocabulário do agente (ferramentas nomeadas, com schemas de entrada e
saída estáveis) e a forma real da API, que pode evoluir sem quebrar o contrato do
agente.

Isso generaliza o padrão que já existia entre o agente e o CLI de estado. A troca é de
processo e de protocolo, e não de conceito: o agente sempre teve uma fronteira de
ferramenta, nunca acesso direto ao arquivo. Os arquivos de agente passam a instruir o
uso das ferramentas MCP como caminho primário.

## Consequências

**Positivas:**
- O contrato do agente fica estável mesmo que a forma da API mude: só o servidor MCP
  precisa ser atualizado.
- A superfície de acesso à API fica auditável e nomeada: um conjunto finito de tools,
  cada uma com um schema, em vez de chamadas HTTP livres dentro de um prompt.
- Reaproveita a disciplina já validada (o agente nunca edita YAML na mão): é uma
  extensão natural, e não uma mudança de cultura.

**Negativas:**
- Mais uma peça de infraestrutura local para manter (o servidor MCP, com testes e
  versionamento de tool próprios).
- Precisa de revisão de segurança antes de expor qualquer coisa além do `localhost`:
  é uma superfície nova de ataque.

O kit instala e configura o servidor nos dois harnesses
([ADR-0025](0025-mcp-no-kit-e-agente-jatai-como-entrada-nos-dois-harnesses.md)), e uma
regra de arquitetura ([ADR-0016](0016-arquitetura-alvo-nucleo-funcional-casca-imperativa.md))
garante que só o cliente do State Service fale com ele.
