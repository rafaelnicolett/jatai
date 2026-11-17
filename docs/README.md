# Documentação da Jataí

O índice da documentação pública da Jataí: o método, os agentes, as decisões que
moldaram o código e o guia para contribuir com o kit. Tudo em português.

## Comece por aqui

- **[A metodologia](metodologia/README.md):** o método de entrega em quatro etapas,
  com os pontos de aprovação humana (os gates) e o estado em arquivos.
- **[O workspace demo](../demo/README.md):** um projeto de exemplo, todo inventado, que
  você gera com `npm run demo` e abre para ver o método funcionando.

## A metodologia

| Documento | O que explica |
|---|---|
| [Visão geral](metodologia/README.md) | a ideia em quatro etapas e o que a Jataí nunca faz |
| [As quatro etapas](metodologia/streams.md) | Descoberta, Planejamento, Execução e Operação, com os agentes de cada uma |
| [Gates](metodologia/gates.md) | D1, D2 e D3: o que cada um exige, quem aprova e como |
| [Estado em arquivos](metodologia/estado-em-arquivos.md) | onde fica cada informação, quem escreve e o vocabulário de status |
| [Agentes](metodologia/agentes.md) | o orquestrador, os papéis e as regras de conversa |
| [Projeto existente ou novo](metodologia/brownfield-e-greenfield.md) | as duas portas de entrada |
| [OpenCode](metodologia/opencode.md) | o harness OpenCode: instalação, `/jatai`, MCP, atividade e problemas comuns |
| [Humano no circuito](metodologia/humano-no-circuito.md) | o que é sempre seu e quando um agente para |
| [Iniciativas](metodologia/iniciativas.md) | feature, modernização e hotfix, épicos e tarefas |
| [Práticas de mudança segura](metodologia/praticas/README.md) | Strangler, Expand-Contract, Parallel Run, BDD, testes de caracterização e golden master |
| [Glossário](metodologia/glossario.md) | as palavras que aparecem nos arquivos |

As práticas, uma por uma:
[Strangler](metodologia/praticas/strangler.md),
[Expand-Contract](metodologia/praticas/expand-contract.md),
[Parallel Run](metodologia/praticas/parallel-run.md),
[BDD](metodologia/praticas/bdd.md),
[testes de caracterização](metodologia/praticas/testes-de-caracterizacao.md) e
[golden master](metodologia/praticas/golden-master.md).

## Agentes e skills

| Documento | O que traz |
|---|---|
| [Catálogo de agentes](agentes/README.md) | um índice por etapa e uma ficha por agente, geradas do kit |
| [Catálogo de skills](agentes/skills.md) | as skills por família, com quem as usa |
| [Criar agentes e skills](criar-agentes-e-skills.md) | o formato, o manifesto, as conferências e como propor no PR |

O catálogo é gerado do frontmatter de `kit/` por `npm run docs:agents`, e o CI
reprova qualquer diferença entre ele e o kit.

## Decisões e arquitetura

| Documento | O que traz |
|---|---|
| [Decisões de arquitetura](decisoes/README.md) | as ADRs públicas, com o índice e a leitura por tema |
| [Arquitetura](arquitetura.md) | o desenho do código: o núcleo, a casca, as fronteiras e a rede de segurança |

## API e integrações

| Documento | O que traz |
|---|---|
| [API de extensão](api-de-extensao.md) | como uma extensão companheira se conecta, o consentimento por workspace, as três portas e o que cada uma pode receber |

## Marca

- [Identidade visual](identidade-visual.md): o símbolo, as cores, a tipografia e a voz.

## Para contribuir

O [CONTRIBUTING.md](../CONTRIBUTING.md) traz o ambiente, o `npm run ci:local` e as
regras da casa. O [GOVERNANCE.md](../GOVERNANCE.md) explica como as decisões são
tomadas e quando uma mudança precisa de ADR.

## Como esta pasta é mantida

A documentação fica no repositório, e muda por PR, como o código. O que é gerado
(`agentes/`) não se edita à mão. Duas conferências protegem o resto: um teste confere
que todo link resolve e que nenhum documento cita contato ou dado pessoal, e o
`content-scan` do CI reprova conteúdo proibido.
