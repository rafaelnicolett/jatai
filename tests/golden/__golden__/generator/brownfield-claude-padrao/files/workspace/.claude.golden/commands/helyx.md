---
description: "Iniciar ou retomar o Foundation stream (brownfield discovery)"
---
Inicie o stream Foundation deste workspace brownfield seguindo o protocolo do @assessor.

## Passo 0 — Inventário de repositórios (antes de qualquer análise)

Leia `.github/artifacts/repos.yaml`.

**Se não existir ou estiver sem repositórios**, monte o inventário agora:

1. Pergunte ao usuário, com `AskUserQuestion`, quais repositórios entram neste
   workspace. Para cada um colete:
   - `url` (git) **ou** `path` (repositório já presente no disco)
   - `ref` (branch/tag; default: branch default do remote)
   - `scan_profile`: `deep` (padrão) · `shallow` · `ignore`
2. Derive um `id` em kebab-case a partir do nome do repositório (vira a pasta
   `repos/<id>/` e a chave de todos os artefatos daquele repo).
3. Escreva `.github/artifacts/repos.yaml` no schema documentado em `AGENTS.md`.
   **Não preencha `pinned_sha`** — quem grava é o passo seguinte.
4. Materialize os repositórios rodando o comando **`Helyx: Sincronizar
   Repositórios`** (paleta de comandos) ou peça ao usuário que o rode.
   Ele clona com os flags corretos, grava o `pinned_sha` de cada repo e não
   toca nos que são `local-path`. **Não clone à mão**: um clone sem
   `--filter=blob:none` baixa gigabytes à toa, e sem `pinned_sha` nenhum
   finding fica ancorado a uma versão.

> Um workspace pode mapear **vários** repositórios — e **um repositório só usa
> exatamente o mesmo fluxo** (N=1). Nunca trate o caso de um repo como especial.
>
> `repos/` é referência agêntica: **nunca modifique** o código do cliente
> durante o Discovery (read-only).

**Se já existir com repositórios**, siga para o Passo 1.

## Passo 1 — Discovery

1. Leia `.claude/agents/discovery/assessor.agent.md` — é o coordenador do Foundation
2. Siga o protocolo passo a passo, com gates HITL obrigatórios entre cada sub-agente
3. Use `AskUserQuestion` em cada gate — nunca avance sem confirmação explícita
4. Apresente os achados de cada sub-agente como mensagem Markdown **antes** de
   chamar `AskUserQuestion`
5. Grave `.github/artifacts/assessment/foundation-state.yaml` após cada etapa:
   - `agent-done` quando o sub-agente terminar (aguardando aprovação humana)
   - `done` **somente** após o humano confirmar o `human_checklist`
6. Fases `scope: repo` (tech-stack, arch, coding-archaeology, quality, debt)
   rodam **uma vez por repositório**, e cada repositório tem o **seu próprio
   gate D1** — um repo grande nunca trava os outros.
   Fases `scope: workspace` (domain, business-context, baseline) rodam **uma
   vez**, cross-repo.
7. Ao concluir, declare o Gate D1 global e atualize `initiatives.yaml`.

## Retomada

Se já existe um Foundation em andamento, leia
`.github/artifacts/assessment/foundation-state.yaml` e retome a partir da
primeira fase incompleta — repo a repo.
