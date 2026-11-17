# ADR-0014: Licença MIT, DCO e liberação de titularidade antes de publicar

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- O código, o kit de agentes e a documentação da metodologia vão ser abertos sob uma
  licença permissiva.
- A titularidade do código precisa ser confirmada antes de licenciar, porque a
  história dele passou por outros repositórios.
- Não pode ser publicado:
  - conteúdo de terceiro sem licença compatível;
  - dado de cliente ou de empresa;
  - fixtures de teste com conteúdo interno.
- Situação das dependências embarcadas:
  - não há copyleft obrigatório;
  - `jszip` é MIT/GPL, e a opção MIT precisa ser declarada;
  - algumas dependências exigem atribuição, e os bundles perdem os avisos dos
    pacotes.

## Decisão

- Licença **MIT** para o código, o kit (agentes e skills) e a documentação da
  metodologia.
- **Pré-condição de publicação** (e não de trabalho local):
  - declaração de titularidade assinada pelo titular;
  - remoção de todo conteúdo de terceiro e de todo dado real;
  - fixtures 100% sintéticas.
- **DCO** (`Signed-off-by`) para contribuições, em vez de CLA.
- `THIRD_PARTY_NOTICES` gerado no build a partir do lockfile e dos metafiles.
- No CI: gate de licença, varredura de segredos e varredura de conteúdo proibido.
- Histórico novo no repositório público ([ADR-0012](0012-repositorio-isolado-jatai-strangler-parallel-run.md)).

## Consequências

- (+) Base jurídica limpa para a comunidade e para empresas adotarem.
- (+) A varredura no CI impede a reintrodução de dado real ou de conteúdo de
  terceiro.
- (−) A publicação depende de uma decisão humana fora do código (a titularidade).
  Ela pode atrasar o lançamento mesmo com toda a parte técnica pronta.

O [CONTRIBUTING.md](../../CONTRIBUTING.md) explica como assinar os commits.
