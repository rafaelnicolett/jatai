/**
 * opencode-instructions.ts
 *
 * `AGENTS.md` do projeto greenfield no OpenCode (epic-9). O brownfield usa o
 * arquivo estático `kit/content/opencode-instructions.md`; aqui é a versão
 * gerada com a stack real do Wizard.
 */

import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";
import { entryPointParagraph } from "./entry-point";

export function opencodeAgentsReadme(state: WizardState): string {
  return `# Agents — ${state.projectName}

> Estrutura agêntica gerada pela ${BRAND.displayName} para o OpenCode.
> Agentes em [\`.opencode/agents/\`](.opencode/agents/).

## Ponto de entrada

${entryPointParagraph("opencode")}

## Onde ficam

- **Agentes:** \`.opencode/agents/<id>.md\` — o orquestrador é
  \`${BRAND.name}.md\`; os especialistas são planos (\`assessor.md\`,
  \`tech-mapper.md\`, ...), porque o ID do OpenCode é o caminho do arquivo.
- **Skills:** \`.opencode/skills/<id>/SKILL.md\`.
- **Comando:** \`/${BRAND.name}\` em
  \`.opencode/commands/${BRAND.name}.md\`.
- **MCP:** \`opencode.json\` › \`mcp.servers.${BRAND.name}\`.
- **Artefatos:** \`.github/artifacts/\` — host-neutral, como nos outros
  harnesses.

## Roteamento

O orquestrador aciona um especialista com a tool \`subagent\` e o **ID** do
agente (\`assessor\`, \`tech-mapper\`, ...). \`@assessor\` é a forma curta no
texto do kit. Nunca chame um especialista direto: o orquestrador valida os
pré-requisitos e os gates.

## Fluxo

\`\`\`
UPSTREAM (descobrir & definir)  →  GATE G1
  →  DOWNSTREAM (construir & validar)  →  GATE G2
  →  OPERATION (rodar & sustentar)
\`\`\`

## Stack

- Backend: **${state.backendStack}**
${state.frontendStack !== "none" ? `- Frontend: **${state.frontendStack}**` : ""}
- Database: ${state.database ?? "postgresql"}
- Cloud: ${state.cloud ?? "none"}
- CI/CD: ${state.cicd ?? "github-actions"}

## Skills

Carregue **apenas** as skills declaradas no corpo do agente. A permissão
\`skill\` do OpenCode também aplica essa lista.

## HITL

Pergunte no chat, com as opções numeradas, uma por linha, e **pare** antes de
seguir. O OpenCode não tem \`AskUserQuestion\` nativo. Mantenha o tracker de
fases como \`- [ ]\` / \`- [x]\` no corpo da mensagem.

## Anti-padrões

- ❌ Falar direto com especialistas (sempre via \`${BRAND.name}\`)
- ❌ Pular gate sem aprovação humana
- ❌ Carregar skill não declarada pela fase ativa
`;
}
