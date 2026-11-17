# ADR-0016: Arquitetura-alvo da Jataí, núcleo funcional e casca imperativa

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- A base herdada do produto anterior era em camadas no host (55%), com uma ilha
  hexagonal (20%), e organizada por feature no webview (85%).
- Arquivos grandes demais, com várias responsabilidades cada um:
  - o gerador de estrutura: 2.012 linhas, em 8 blocos de responsabilidade;
  - o controller do Wizard: 1.576 linhas, com HTML, CSS e JS num template literal;
  - o participante de chat: 991 linhas, sem nenhum teste;
  - o repositório de estado em SQLite: 846 linhas;
  - o `extension.ts`: 774 linhas.
- Outros problemas estruturais:
  - seis catálogos de fase divergentes;
  - três singletons de módulo;
  - 72 linhas de `if claude/copilot`;
  - cerca de 2 mil linhas de código morto;
  - o design system do webview importava store e features;
  - um ciclo de importação entre duas features.
- O domínio é um catálogo mais a transformação de YAML. Hexagonal ou DDD completo
  seria cerimônia sem retorno.

## Decisão

- **Núcleo funcional + casca imperativa**, com portas só nas bordas (fs, http, git,
  o modelo de linguagem do VS Code e a UI).
- Pacotes:
  - `core`: puro. Catálogo da metodologia, contratos, caminhos de artefato, parsers
    e writers, schemas, protocolos e `Brand`.
  - `state`, `kit`, `generator`, `cli`, `mcp`.
  - `vscode`: adaptadores finos e uma composição explícita das dependências.
  - `webview`: os apps Cockpit e Wizard, com o design system como folha.
- Estágio intermediário: **monólito modular**, com as mesmas fronteiras como pastas.
  A separação física em npm workspaces só acontece quando as regras estiverem em
  `error`.
- Fitness functions no CI (dependency-cruiser e ESLint):
  - `no-vscode-outside-extension`, `core-is-pure`, `core-is-root`, `state-no-upward`;
  - `mcp-only-client` ([ADR-0004](0004-mcp-fronteira-obrigatoria-agente-estado.md)),
    `cli-no-generator`, `webview-only-core`;
  - `ds-is-leaf`, `no-cross-feature`, `no-deep-imports`, `no-circular`, `no-orphans`;
  - testes de arquitetura: ids de comando, caminhos de artefato, exaustividade de
    protocolo e metafile dos bundles;
  - `size-limit`.
- Refactor só com rede de segurança:
  - golden master e testes de contrato antes;
  - receitas de Fowler;
  - um passo por PR;
  - correção de bug nunca dentro de refactor.

## Consequências

- (+) Arquivos pequenos e coesos, testáveis sem o VS Code. Quem chega da comunidade
  entende onde cada coisa mora.
- (+) As regras impedem regressão arquitetural depois que a missão acabar.
- (−) Durante a transição convivem barrels de re-export (Branch by Abstraction), até
  os caminhos antigos saírem.

A [arquitetura](../arquitetura.md) descreve o resultado.
