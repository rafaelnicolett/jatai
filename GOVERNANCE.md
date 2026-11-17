# Governança da Jataí

Este documento explica quem decide o quê na Jataí, como as decisões ficam
registradas e como alguém passa a manter o projeto. Ele descreve o começo do
projeto, com um mantenedor só, e muda por PR quando o grupo crescer.

## Princípios

- **Decisão em público.** Propostas, discussões e decisões acontecem em issues,
  PRs e ADRs. O que foi decidido em conversa privada só vale depois de
  registrado em público.
- **O núcleo da metodologia é protegido.** O que a Jataí instala e grava no
  workspace de quem usa só muda de propósito, com golden master e contratos
  provando o que mudou (ver [CONTRIBUTING.md](CONTRIBUTING.md)).
- **Nenhum dado sai da máquina.** A Jataí é 100% local e sem telemetria (ver
  [SECURITY.md](SECURITY.md)). Mudar isso é uma decisão de rumo, com ADR.
- **Português primeiro.** A documentação, a interface e o kit nascem em
  português.

## Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Quem usa | qualquer pessoa | Usa a Jataí, relata bugs, sugere melhorias e ajuda outras pessoas nas issues |
| Quem contribui | quem teve um PR aceito | Manda código, testes, documentação, agentes ou skills, seguindo o [CONTRIBUTING.md](CONTRIBUTING.md) |
| Mantenedor | pessoas listadas no [MAINTAINERS.md](MAINTAINERS.md) | Faz triagem de issues, revisa e aceita PRs, cuida da segurança e aplica o [código de conduta](CODE_OF_CONDUCT.md) |
| Mantenedor principal | o titular do projeto (o nome na [LICENSE](LICENSE)), hoje Rafael Nicoleti | Tudo o que um mantenedor faz, mais a palavra final quando não há consenso, as versões publicadas e as mudanças nesta governança |

## Como as decisões são tomadas

### No dia a dia

- **Consenso tácito.** Uma proposta numa issue ou num PR segue em frente se
  ninguém levantar uma objeção fundamentada. Objeção boa explica o problema e,
  se possível, sugere outro caminho.
- **Aceite de PR.** Um PR entra com o CI verde (nos três sistemas operacionais
  e no DCO) e com a aprovação de um mantenedor que não seja o autor do PR.
- **Enquanto houver um mantenedor só**, os PRs dele passam pelos mesmos gates
  do CI. Os que mudam contrato, regra da casa ou esta governança ficam
  abertos para comentário antes do merge.
- **Sem consenso**, o mantenedor principal decide e explica o motivo no
  próprio PR ou issue.

### Decisões que viram ADR

Uma ADR (*Architecture Decision Record*) é um registro curto de uma decisão:
o contexto, o que foi decidido e as consequências. Precisa de ADR:

- mudança de arquitetura, como uma fronteira nova entre módulos ou um formato
  novo de dado;
- mudança em contrato congelado que não seja só aditiva, como renomear ou
  remover um campo, um comando ou uma setting;
- qualquer recurso que envie dado para fora da máquina;
- mudança de licença, das regras da casa ou desta governança.

Como funciona:

1. Alguém abre um PR com a ADR em `docs/adr/NNNN-titulo-curto.md`, com o
   número seguinte ao último, nunca reaproveitado.
2. A ADR nasce com status **proposta** e é discutida no PR.
3. Aceita, o status vira **aceita** e o PR entra. A implementação vem depois,
   em PRs próprios.
4. Uma ADR aceita não é editada. Se a decisão mudar, uma ADR nova a
   **substitui**, e a antiga ganha o status "substituída pela ADR NNNN".

Formato mínimo:

```markdown
# ADR-NNNN: <decisão em poucas palavras>

## Status
proposta | aceita | substituída pela ADR-NNNN

## Contexto
<o problema e os fatos que pesam na decisão>

## Decisão
<o que foi decidido, no presente>

## Consequências
<o que melhora, o que custa, o que muda para quem usa ou contribui>
```

As ADRs que sustentam a edição aberta (licença MIT com DCO, 100% local sem
envio de dados, arquitetura-alvo e kit para os dois harnesses) ainda não estão
neste repositório. Elas entram em `docs/adr/` junto com a documentação da
metodologia. Até lá, o que elas decidiram está aplicado no
[CONTRIBUTING.md](CONTRIBUTING.md) e no [SECURITY.md](SECURITY.md).

### Versões publicadas

O mantenedor principal decide quando publicar uma versão. A versão segue o
[Versionamento Semântico](https://semver.org/lang/pt-BR/), e o que mudou fica
no [CHANGELOG.md](CHANGELOG.md).

## Como alguém vira mantenedor

Não há número mínimo de PRs nem prazo. O que conta é a confiança construída no
trabalho em público:

- contribuições aceitas ao longo do tempo, que seguem as regras da casa;
- revisões úteis nos PRs de outras pessoas;
- ajuda nas issues, inclusive com quem está chegando;
- conduta de acordo com o [código de conduta](CODE_OF_CONDUCT.md).

O caminho:

1. Um mantenedor propõe o nome numa issue, ou a própria pessoa se oferece.
2. A proposta fica aberta para comentários dos mantenedores e da comunidade.
3. O mantenedor principal decide e explica a decisão na issue.
4. Aceita, a pessoa entra no [MAINTAINERS.md](MAINTAINERS.md) por PR, com as
   áreas em que vai atuar, e recebe as permissões no repositório.

Quem mantém pode deixar o papel quando quiser: basta um PR no
[MAINTAINERS.md](MAINTAINERS.md), que move o nome para "mantenedores eméritos".
Depois de um longo período sem atividade, o mesmo pode acontecer, sempre
combinado antes com a pessoa.

## Conduta e conflito de interesse

- O [código de conduta](CODE_OF_CONDUCT.md) vale para todo mundo, inclusive
  para quem mantém.
- Quem está envolvido num relato de conduta ou tem interesse direto numa
  decisão não decide sobre ela. Com um mantenedor só, o código de conduta
  oferece um caminho que não passa por ele.

## Licença das contribuições

A Jataí usa a licença MIT. Cada contribuição entra sob essa mesma licença, e o
DCO (`Signed-off-by` em cada commit) é a declaração de quem contribui de que
pode fazer isso. Não há CLA, e ninguém cede direitos autorais.

## Mudanças nesta governança

Esta governança muda por PR neste arquivo. O PR fica aberto para comentários
antes do merge, e a decisão é do mantenedor principal enquanto o projeto
tiver um mantenedor só.
