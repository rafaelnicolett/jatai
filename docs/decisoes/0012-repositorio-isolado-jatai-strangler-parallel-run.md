# ADR-0012: A edição aberta nasce em repositório isolado, por Strangler no nível de repositório

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- A edição aberta exige refatoração estrutural (arquivos com mais de mil linhas e
  várias responsabilidades), redesign e saneamento. O produto anterior continuava
  recebendo correções ao mesmo tempo, em cima do mesmo código.
- O repositório de onde o código saiu guardava também dependências instaladas,
  pacotes gerados e documentos de outros produtos, e tinha o histórico de commits
  de uma organização. Nada disso podia ir para um repositório público.
- Uma modernização aberta sobre o produto anterior travaria o repositório inteiro
  (lock de modernização) e misturaria duas marcas no mesmo código.

## Decisão

- Criar o repositório da Jataí a partir de um **snapshot fixado** do produto
  anterior (versão 0.9.10), mais as fontes do kit. O kit canônico fica **dentro**
  do repositório, para o build ser hermético.
- **Parallel Run** como prova de que o núcleo da metodologia não muda. Os testes
  comparam a Jataí com o produto anterior, e a única diferença permitida é a marca:
  - golden master da árvore gerada (projeto novo e existente, com Claude Code e com
    Copilot);
  - golden master do CLI;
  - testes de contrato: HTTP, MCP, protocolos, caminhos sob `.github/artifacts/` e
    schemas YAML.
- O produto anterior congela, só com correções, durante a missão. Cada correção
  feita nele entra numa lista de porte para a Jataí. Depois do lançamento, ele é
  aposentado e arquivado.
- O lock de modernização desta iniciativa vale só para a Jataí.
- A publicação usa **repositório público novo, com histórico novo**. O histórico do
  repositório de origem nunca é exportado.

## Consequências

- (+) O trabalho em andamento no produto anterior segue sem conflito, e o risco de
  regressão fica contido.
- (+) A equivalência é verificada por máquina em vez de por inspeção.
- (−) Durante a missão existem duas bases de código. O risco de divergência é
  mitigado pelo congelamento e pela lista de porte.
- (−) O golden master precisa existir **antes** de qualquer refactor.

Veja [Strangler](../metodologia/praticas/strangler.md),
[Parallel Run](../metodologia/praticas/parallel-run.md) e
[golden master](../metodologia/praticas/golden-master.md).
