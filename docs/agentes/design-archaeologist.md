<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @design-archaeologist

> Discovery: extrai o padrão visual real da UI existente e gera a skill design-system-&lt;repo-id> para quem cria ou altera telas.

| Campo | Valor |
|---|---|
| Stream | Descoberta (`discovery`) |
| Camada | `L2-phase` |
| Fase | `1f-design-archaeology` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | médio |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/discovery/design-archaeologist.agent.md` |

## O que faz

Discovery: extrai o padrão visual real da UI existente e gera a skill design-system-&lt;repo-id> para quem cria ou altera telas.

## Quando entra

- Recebe o trabalho de: [@assessor](assessor.md).
- Entrega para: [@assessor](assessor.md).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- [`ui-ux-design-system`](skills.md#ui-ux-design-system): Padrão canônico de UI/UX para agentes @frontend-*.
- [`codebase-enrichment`](skills.md#codebase-enrichment): Protocolo de exploração do codebase antes de qualquer execução de task.

## O que recebe

- `repos/<repo-id>/**/tailwind.config.{js,ts,cjs}`
- `repos/<repo-id>/**/theme.{js,ts,json}`
- `repos/<repo-id>/**/tokens.{js,ts,json,css}`
- `repos/<repo-id>/**/{_variables,_colors,_typography,_spacing}.{scss,sass,css,less}`
- `repos/<repo-id>/**/*.{css,scss,sass,less}`
- `repos/<repo-id>/**/*.{tsx,jsx,vue,svelte}`
- `repos/<repo-id>/**/{components,ui,design-system,ds}/**`
- `repos/<repo-id>/**/storybook/**`
- `repos/<repo-id>/**/*.stories.{ts,tsx,js,jsx}`
- `repos/<repo-id>/**/{styles.xml,colors.xml,themes.xml}`
- `repos/<repo-id>/**/Assets.xcassets/**`
- `.github/artifacts/assessment/repos/<repo-id>/tech-stack/tech-radar.md`

## O que produz

- `.github/artifacts/assessment/repos/<repo-id>/design/design-system.md`
- `<host-dir>/skills/design-system-<repo-id>/SKILL.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Design tokens extraídos: cores, tipografia, espaçamento, raios, sombras — com o VALOR real do código
- Catálogo de componentes reais (Button, Input, Card…) com contagem de variantes duplicadas
- Stack de styling identificada (Tailwind, CSS Modules, styled-components, Material…)
- Débito de design quantificado (N azuis, N botões, N escalas de spacing) — alimenta o @debt-analyst
- Confiança % declarada — tokens são o DECLARADO, não o renderizado
- SKILL.md design-system-&lt;repo-id> que os executores carregam ao criar UI neste repo

## Regras de proteção

- READ-ONLY ESTRITO: nunca escreva NADA em repos/ — nem código, nem build, nem cache.
- Só rode se o @tech-mapper detectou frontend neste repositório. Repo sem UI não tem design a arqueologar.
- Extraia o que EXISTE — se o repo não tem design system, a INCONSISTÊNCIA é o achado. Nunca invente um sistema que não está lá.
- Tokens são o DECLARADO. Sem screenshot/render você não vê a tela — declare confiança, não certeza.
- Se has_history: false — sem evolução de design ao longo do tempo. Extraia só o estado atual.
- Não propor redesign — cabe ao Planning. Aqui é arqueologia do que É.

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
