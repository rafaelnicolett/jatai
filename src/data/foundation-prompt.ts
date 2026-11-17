/**
 * foundation-prompt.ts
 *
 * Fonte única do prompt que inicia/retoma o stream Foundation (brownfield).
 *
 * Antes existiam três cópias divergentes (o comando `/helyx` gravado no
 * workspace, o disparo do wizard e o do Cockpit), todas com `.github/agents/`
 * hardcoded — o que quebra no host Claude, onde os agentes vivem em
 * `.claude/agents/`. O path do agente depende do host, então o prompt é
 * **gerado**, nunca copiado.
 */

import { BRAND } from "./brand.pure";
import { deliveryAgentPath } from "../core/methodology/phase-catalog.pure";

export type HostId = "copilot" | "claude" | "opencode";

/** Onde os agentes vivem, por host. Artefatos ficam sempre em `.github/artifacts/`. */
export function agentsDirFor(host: HostId): string {
  if (host === "claude") return ".claude/agents";
  if (host === "opencode") return ".opencode/agents";
  return ".github/agents";
}

/**
 * Nome do arquivo de um agente do kit no layout do harness.
 *
 * O kit nomeia `<stream>/<id>.agent.md`; Claude/Copilot mantêm o nome e a
 * subpasta, e o OpenCode usa `<id>.md` plano (o ID do OpenCode é o caminho do
 * arquivo). A LLM Wiki (`domain/<slug>.md`) é do cliente e não passa por aqui.
 */
export function agentFileNameFor(host: HostId, agentFile: string): string {
  if (host !== "opencode") return agentFile;
  return agentFile.replace(/\.agent\.md$/, ".md").split("/").pop()!;
}

/** Caminho relativo à raiz do workspace do arquivo de um agente do kit. */
export function agentPathFor(host: HostId, agentFile: string): string {
  return `${agentsDirFor(host)}/${agentFileNameFor(host, agentFile)}`;
}

/** Caminho do agente de uma fase de delivery no harness, ou `undefined` se a fase não existe. */
export function deliveryAgentPathFor(host: HostId, phaseId: string): string | undefined {
  const rel = deliveryAgentPath(phaseId)?.replace(/^\.github\/agents\//, "");
  return rel ? agentPathFor(host, rel) : undefined;
}

/**
 * Prompt do Foundation.
 *
 * A primeira coisa que o `@assessor` faz é **montar o inventário**: um workspace
 * brownfield aponta para N repositórios, e sem `repos.yaml` não há o que
 * assessar (a pasta do workspace nasce vazia). O mesmo caminho serve para
 * adicionar um repositório depois — por isso a coleta vive aqui, e não no wizard.
 */
export function foundationPrompt(host: HostId): string {
  const assessor = agentPathFor(host, "discovery/assessor.agent.md");

  return `Inicie o stream Foundation deste workspace brownfield seguindo o protocolo do @assessor.

## Passo 0 — Inventário de repositórios (antes de qualquer análise)

Leia \`.github/artifacts/repos.yaml\`.

**Se não existir ou estiver sem repositórios**, monte o inventário agora:

1. Pergunte ao usuário, com \`AskUserQuestion\`, quais repositórios entram neste
   workspace. Para cada um colete:
   - \`url\` (git) **ou** \`path\` (repositório já presente no disco)
   - \`ref\` (branch/tag; default: branch default do remote)
   - \`scan_profile\`: \`deep\` (padrão) · \`shallow\` · \`ignore\`
2. Derive um \`id\` em kebab-case a partir do nome do repositório (vira a pasta
   \`repos/<id>/\` e a chave de todos os artefatos daquele repo).
3. Escreva \`.github/artifacts/repos.yaml\` no schema documentado em \`AGENTS.md\`.
   **Não preencha \`pinned_sha\`** — quem grava é o passo seguinte.
4. Materialize os repositórios rodando o comando **\`${BRAND.displayName}: Sincronizar
   Repositórios\`** (paleta de comandos) ou peça ao usuário que o rode.
   Ele clona com os flags corretos, grava o \`pinned_sha\` de cada repo e não
   toca nos que são \`local-path\`. **Não clone à mão**: um clone sem
   \`--filter=blob:none\` baixa gigabytes à toa, e sem \`pinned_sha\` nenhum
   finding fica ancorado a uma versão.

> Um workspace pode mapear **vários** repositórios — e **um repositório só usa
> exatamente o mesmo fluxo** (N=1). Nunca trate o caso de um repo como especial.
>
> \`repos/\` é referência agêntica: **nunca modifique** o código do cliente
> durante o Discovery (read-only).

**Se já existir com repositórios**, siga para o Passo 1.

## Passo 1 — Discovery

1. Leia \`${assessor}\` — é o coordenador do Foundation
2. Siga o protocolo passo a passo, com gates HITL obrigatórios entre cada sub-agente
3. Use \`AskUserQuestion\` em cada gate — nunca avance sem confirmação explícita
4. Apresente os achados de cada sub-agente como mensagem Markdown **antes** de
   chamar \`AskUserQuestion\`
5. Grave \`.github/artifacts/assessment/foundation-state.yaml\` após cada etapa:
   - \`agent-done\` quando o sub-agente terminar (aguardando aprovação humana)
   - \`done\` **somente** após o humano confirmar o \`human_checklist\`
6. Fases \`scope: repo\` (tech-stack, arch, coding-archaeology, quality, debt)
   rodam **uma vez por repositório**, e cada repositório tem o **seu próprio
   gate D1** — um repo grande nunca trava os outros.
   Fases \`scope: workspace\` (domain, business-context, baseline) rodam **uma
   vez**, cross-repo.
7. Ao concluir, declare o Gate D1 global e atualize \`initiatives.yaml\`.

## Retomada

Se já existe um Foundation em andamento, leia
\`.github/artifacts/assessment/foundation-state.yaml\` e retome a partir da
primeira fase incompleta — repo a repo.
`;
}

/** Conteúdo do slash command `/helyx` gravado no workspace. */
export function helyxCommandContent(host: HostId): string {
  const agent = host === "opencode" ? `agent: ${BRAND.name}\n` : "";
  return `---
description: "Iniciar ou retomar o Foundation stream (brownfield discovery)"
${agent}---
${foundationPrompt(host)}`;
}
