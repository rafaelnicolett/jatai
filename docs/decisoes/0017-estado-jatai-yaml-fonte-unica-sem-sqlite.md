# ADR-0017: Estado da Jataí, YAML como única fonte, sem espelho SQLite e com lock que não bloqueia o editor

## Status

aceita em 2026-11-14, pelo titular do projeto.

O produto anterior mantinha um espelho do estado em SQLite, que a Jataí não herda.

## Contexto

- No produto anterior, o estado em YAML era espelhado num SQLite (`sql.js`), e esse
  espelho não tinha nenhum leitor.
- O Cockpit lia o estado fazendo HTTP para o próprio processo.
- Existiam três clientes HTTP quase iguais.
- As escritas do Cockpit e do chat não usavam o lock de arquivo. Só o CLI e o
  servidor usavam, então a escrita concorrente não tinha coordenação.
- O `sleepSync` usava `Atomics.wait` na thread principal. No Extension Host, isso
  pode bloquear todas as extensões por até cerca de 6 segundos.

## Decisão

- `initiatives.yaml`, `foundation-state.yaml`, `delivery-state.yaml` e os demais
  arquivos de estado são a fonte da verdade. Os contratos ficam congelados.
- Um `StateCommands` único na camada de aplicação, usado por CLI, MCP, servidor e
  Cockpit.
- Um `StateServiceClient` único. O Cockpit lê no próprio processo.
- Lock assíncrono no Extension Host. Um lint restringe `Atomics.wait` ao CLI.
- Não ter o espelho SQLite nem o repositório de escrita dupla. O comportamento
  observável fica idêntico, garantido pelos contratos HTTP, MCP e CLI e pelo golden
  de bytes do YAML.
- O CLI continua tentando o State Service primeiro e caindo no YAML direto, sob o
  mesmo lock. O caminho em YAML é permanente: o uso principal do CLI é um agente no
  terminal, sem garantia de que o editor esteja aberto.

## Consequências

- (+) Menos código, sem dependência wasm no pacote e sem congelamento do editor.
- (+) Todas as escritas passam pelo mesmo lock.
- (−) Se surgirem consultas pesadas no futuro, será preciso reintroduzir um índice. A
  decisão será revisitada nesse caso.

Veja [estado em arquivos](../metodologia/estado-em-arquivos.md).
