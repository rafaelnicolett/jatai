# Criar agentes e skills

O kit é o coração da Jataí: são os agentes e as skills que a extensão instala no
projeto de quem a usa, para o Claude Code, para o GitHub Copilot e para o OpenCode.
Este guia mostra onde cada coisa mora, qual é o formato, como conferir o seu trabalho
e como propor o agente ou a skill num PR.

Antes de começar, leia o [CONTRIBUTING.md](../CONTRIBUTING.md) e a
[metodologia](metodologia/README.md): um agente novo precisa se encaixar numa etapa
e respeitar os gates. O [catálogo](agentes/README.md) mostra os agentes que já
existem, para você não duplicar um.

## Antes de escrever: abra uma issue

Abra uma issue com o template de feature e a área "kit", e conte:

- que problema o agente ou a skill resolve, e para quem;
- em que etapa e fase ele atua, e com quais agentes conversa;
- se é para projeto novo (greenfield), projeto existente (brownfield) ou os dois;
- como funciona nos três harnesses. Um agente que só funciona num deles ainda não
  está pronto.

Espere o aceite antes de escrever. A estrutura do kit pode mudar, e a conversa na
issue evita que você escreva no lugar errado.

## Onde as coisas moram

Tudo vive em `kit/`, a **fonte única**. As edições que a extensão lê são geradas
dele e não vão para o git.

| Caminho | O que é |
|---|---|
| `kit/content/agents/<etapa>/<id>.agent.md` | um agente, em pastas por etapa: `discovery`, `planning`, `execution`, `operation` e as do projeto novo |
| `kit/content/skills/<id>/SKILL.md` | uma skill, numa pasta com o nome dela |
| `kit/variants/<edição>/agents/...` | o arquivo que muda de uma edição para outra (os agentes de Operação, por exemplo) |
| `kit/kit.manifest.yaml` | o manifesto: o que cada edição recebe |
| `kit/content/skills/registry.yaml` | o mapa de agentes, skills e artefatos do projeto novo |
| `kit/schema/agent.schema.json` e `skill.schema.json` | os schemas do frontmatter |
| `kit/scripts/` | os bundles versionados do CLI de estado e do servidor MCP |
| `dist/kit/` | as edições geradas: **nunca edite à mão** |

## O agente

Um agente é um arquivo Markdown com um **frontmatter** em YAML e um corpo com as
instruções. O frontmatter é validado pelo `kit/schema/agent.schema.json`:

| Campo | Regra |
|---|---|
| `name` | obrigatório. Em agente de fase, é igual ao `id` |
| `description` | obrigatório, com pelo menos 20 caracteres. Diz **quando usar** o agente |
| `id` | opcional, em minúsculas e hífens (`^[a-z0-9][a-z0-9-]*$`) |
| `layer` | `L1-stream`, `L2-phase`, `L2-guardian`, `L2-sidecar` ou `L2-domain` |
| `stream` | `foundation`, `discovery`, `planning`, `execution`, `upstream`, `downstream`, `operation`, `guardian`, `sidecar` ou `domain` |
| `scope` | `repo`, `workspace` ou `context` |
| `receives_from`, `delivers_to`, `escalates_to` | listas de agentes |
| `inputs`, `outputs` | o que lê e o que grava |
| `exit_contract`, `guard_rails` | listas de texto: o que precisa valer para passar adiante, e o que o agente não faz |
| `uses_skills` | as skills que ele carrega |
| `token_budget` | `low`, `medium` ou `high` |

Uma chave fora da lista reprova (`additionalProperties: false`), então um erro de
digitação não passa em silêncio.

No OpenCode, o mesmo agente chega como `<id>.md` plano em `.opencode/agents/`:
o ID do agente é o caminho do arquivo, e a subpasta do stream viraria parte do ID
(`discovery/assessor`). O adaptador achata o arquivo e remove `model` e os campos
do Copilot; escreva o agente no formato do kit, sem se preocupar com o layout.

Um exemplo mínimo e válido:

```markdown
---
id: revisor-de-adr
name: revisor-de-adr
description: "Planning: revisa as ADRs propostas e aponta o que falta antes do gate D2."
layer: L2-phase
stream: planning
scope: workspace
receives_from: [maestro]
delivers_to: [maestro]
escalates_to: [maestro]
inputs:
  - docs/adr/*.md
outputs:
  - .github/artifacts/planning/adr-review.md
exit_contract:
  - "Cada ADR proposta tem contexto, decisão e consequências"
guard_rails:
  - "Nunca edite uma ADR aceita"
uses_skills:
  - docs-writer
token_budget: low
---

# @revisor-de-adr

Instruções do agente, em português e na segunda pessoa.
```

O orquestrador pode ser citado pelo nome da marca (`jatai`) ou pelo apelido
`maestro`, que o lint aceita. Escreva o nome da marca sempre como `{{brand.name}}` e
`{{brand.displayName}}`: um literal de marca reprova o lint de marca.

Algumas regras de conteúdo valem para todo agente do kit:

- **Um repositório por vez**, nos agentes que atuam em código: nunca edite fora do
  repositório alvo.
- **Escreva no padrão que a Descoberta encontrou**, e não no que você prefere.
- **Diga o que o agente não faz** em `guard_rails`, e o que precisa valer em
  `exit_contract`. É o que a [conversa entre agentes](metodologia/agentes.md) usa.
- **Nada de dado real nem de conteúdo de terceiro**, e texto em português.

## A skill

Uma skill é uma pasta com um `SKILL.md`. O frontmatter, validado pelo
`kit/schema/skill.schema.json`, exige `id`, `name`, `type: skill` e `description`
(com pelo menos 20 caracteres), e o `name` precisa ser **igual ao nome da pasta**:

```markdown
---
id: revisao-de-adr
name: revisao-de-adr
type: skill
description: "Como revisar uma ADR proposta: o que conferir e como registrar o parecer."
applicable_to:
  - "@revisor-de-adr"
---

# Skill: revisao-de-adr
```

`applicable_to`, `inputs` e `outputs` são opcionais. Uma skill só entra no contexto de
um agente que a declara em `uses_skills`: sem essa declaração, ninguém a carrega.

## O manifesto

O `kit/kit.manifest.yaml` diz o que cada edição (`greenfield` e `brownfield`) recebe.
Um arquivo novo precisa entrar nele, senão não chega a ninguém:

```yaml
editions:
  brownfield:
    units:
      - agents/planning                          # uma pasta inteira de kit/content/
      - { from: variants/brownfield/agents/maestro.agent.md, to: agents/maestro.agent.md }
    skills:
      - revisao-de-adr                           # copia kit/content/skills/revisao-de-adr/
```

Uma unidade em texto simples é relativa a `kit/content/`. Quando a edição muda o
arquivo, use `{ from, to }` com o caminho em `kit/variants/`. Duas unidades que
escrevem o mesmo destino são um erro. Uma skill nova do projeto novo entra também no
`kit/content/skills/registry.yaml`.

## Conferir antes do PR

```bash
npm run build:kit                  # gera as edições em dist/kit/ a partir de kit/
node scripts/kit-lint.js           # frontmatter e referências
node scripts/brand-lint.mjs        # nenhum literal de marca
npm run docs:agents                # regera o catálogo em docs/agentes/
npx vitest run --no-cache tests/kit-lint.test.ts tests/skills-declared-vs-packaged.test.ts
npx vitest run --no-cache tests/golden
```

O `kit-lint` (que também roda no build e no CI) confere, para cada agente e skill de
cada edição:

1. o YAML do frontmatter é válido;
2. o frontmatter cumpre o JSON Schema (o validador é mínimo e só aceita as palavras
   que o próprio schema usa);
3. `name` é igual a `id` no agente, e igual ao nome da pasta na skill;
4. toda referência resolve **na mesma edição**: `uses_skills` aponta para uma skill
   empacotada nela, e `receives_from`, `delivers_to`, `escalates_to` e `loop_with`
   apontam para agentes dela. As skills geradas por repositório
   (`coding-guidelines-<repo-id>` e `design-system-<repo-id>`) não existem no pacote e
   são ignoradas, assim como o orquestrador e os alvos de gate.

Uma referência quebrada reprova com o arquivo e a chave. O lint tem uma lista de
exceções (`KNOWN_BROKEN`), e ela está vazia e deve continuar vazia: conserte a
referência.

## O golden master reage

Um agente ou uma skill nova **muda o que a Jataí instala**, então o golden master do
gerador muda. É esperado. A regra é a de sempre ([golden master](metodologia/praticas/golden-master.md)):

1. rode `npx vitest run --no-cache tests/golden` e veja a falha;
2. confira que a diferença é só o seu arquivo novo (e a linha dele no lock do kit);
3. regrave só o grupo do gerador:

```bash
UPDATE_GOLDEN=1 npx vitest run --no-cache tests/golden/generator.golden.test.ts
git diff --stat -- tests/golden/__golden__
```

4. explique no PR cada arquivo que mudou no diff do golden.

O `npm run ci:local` confere também que o seu arquivo vai no `.vsix`.

## Propor no PR

Abra o PR com o checklist abaixo, e assine os commits (`git commit -s`):

- [ ] a issue foi aceita, e o PR a cita;
- [ ] o agente ou a skill está em `kit/content/` (ou em `kit/variants/`);
- [ ] o manifesto o recebe nas edições certas, e o registry foi atualizado, se for do
  projeto novo;
- [ ] `description` diz quando usar, e `guard_rails` e `exit_contract` estão
  preenchidos;
- [ ] `npm run build:kit`, o `kit-lint` e o lint de marca estão limpos;
- [ ] funciona nos três harnesses: Claude Code e Copilot (`.agent.md`, com a subpasta do stream) e OpenCode (`.md` plano, sem `.agent`). Quando o texto depende de um
  deles, diz qual;
- [ ] o golden do gerador foi regravado, com o diff explicado;
- [ ] `npm run docs:agents` foi rodado, e o catálogo está no PR;
- [ ] texto em português, sem dado real e sem conteúdo de terceiro;
- [ ] uma linha em "Não lançado" do [CHANGELOG.md](../CHANGELOG.md), escrita para quem
  usa.

Quem mantém o projeto revisa assim que puder. O que mudar contrato congelado ou a
regra de um gate precisa de uma ADR antes ([GOVERNANCE.md](../GOVERNANCE.md)).
