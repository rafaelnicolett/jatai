# OpenCode

A Jataí instala o mesmo kit no **Claude Code**, no **GitHub Copilot** e no
**OpenCode 2.x**. Este guia é o caminho operacional do OpenCode: o que o kit
instala, como abrir o workspace, como entrar no método e o que conferir quando
algo não aparece.

> O OpenCode é um harness externo. A extensão do VS Code instala e configura o
> kit e mostra o Cockpit; ela não abre uma view de chat do OpenCode.

## Antes de começar

- OpenCode **2.x** (validado em 2.3.0) e Node 18+ — o CLI de estado e o servidor
  MCP do kit rodam em Node.
- Um workspace Jataí: um projeto novo gerado pelo Wizard com o host **OpenCode**,
  ou um projeto existente que recebeu o kit com esse host.
- A extensão do VS Code aberta no workspace (opcional para o CLI; necessária
  para o Cockpit e para o State Service).

## O que o kit instala

```text
.opencode/
  agents/
    jatai.md                 # orquestrador (primary)
    assessor.md              # especialistas (subagent), planos
    tech-mapper.md
    ...
    domain/<slug>.md         # LLM Wiki, gerada pelo @assessor
  skills/<id>/SKILL.md
  commands/jatai.md          # entrada /jatai
  plugins/jatai-activity.ts  # eventos de atividade
AGENTS.md                    # instruções do OpenCode
opencode.json                # MCP: mcp.servers.jatai
.github/artifacts/           # estado do delivery (host-neutral)
.github/scripts/             # CLI e servidor MCP do kit
```

O **ID do agente no OpenCode é o caminho do arquivo**. Por isso os agentes do
kit são instalados **planos** (`assessor.md`, não
`discovery/assessor.agent.md`). A LLM Wiki fica em `domain/<slug>.md`, e o ID
dela é `domain/<slug>`.

O `AGENTS.md` é o arquivo de instruções principal. O `CLAUDE.md` só é lido pelo
OpenCode quando não existe `AGENTS.md`; o kit instala o texto do OpenCode.

## Abrir o workspace

1. Abra a pasta do workspace no terminal.
2. Rode `opencode`.
3. Confira que o OpenCode achou o kit:
   ```sh
   opencode debug agents     # jatai (primary), assessor/tech-mapper/... (subagent)
   opencode debug config     # mcp.servers.jatai
   opencode mcp list         # ✓ jatai connected (com a extensão/State Service no ar)
   ```

## Entrar no método

- **Seletor de agente:** escolha `jatai` (é o `primary`).
- **Comando:** rode `/jatai`.

Os dois chegam ao orquestrador. Ele valida os pré-requisitos e aciona os
especialistas com a tool `subagent`, usando o **ID** do agente (`assessor`,
`tech-mapper`, ...); no texto do kit, `@assessor` é a forma curta.

> **Nunca chame um especialista direto.** O orquestrador é quem valida o gate e
> a etapa; um especialista chamado fora de hora pula o método.

## MCP

O kit escreve `opencode.json` (ou `opencode.jsonc`, se o time já tiver um) com:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "jatai": {
        "type": "local",
        "command": ["node", ".github/scripts/jatai-mcp.cjs"],
        "cwd": "."
      }
    }
  }
}
```

O merge preserva os outros servidores e os comentários do arquivo do time. Se o
arquivo não for JSONC válido, o kit **não** o sobrescreve; ele avisa e você
declara o servidor à mão.

O servidor MCP é um cliente fino do State Service local. Com a extensão aberta
no workspace, ele encontra o `server.json`; sem a extensão, o CLI de estado
continua funcionando (o MCP fica sem o serviço).

## Atividade de agente

O plugin `.opencode/plugins/jatai-activity.ts` assina as sessões filhas do
OpenCode e grava, em `.github/artifacts/runs/*.jsonl`:

- `agent-started` quando um subagente começa;
- `agent-done` quando ele termina;
- `blocked` quando a execução falha ou é interrompida.

O evento leva `harness: "opencode"`, o ID do agente e nada de conteúdo de
arquivo, prompt ou saída de ferramenta. A sessão primária é ignorada. Se o
plugin não carregar, o observador de artefatos da extensão continua gravando
`artifact-written` com `harness: "watcher"` — o mapa perde o “quem começou/terminou”,
mas não perde a escrita.

## Problemas comuns

| Sintoma | O que conferir |
|---|---|
| O agente não aparece no seletor | `opencode debug agents`; o arquivo precisa ser `.opencode/agents/<id>.md` (sem `.agent`) e o frontmatter precisa de `description` |
| O agente aparece como `assessor.agent` | o kit foi copiado sem o adaptador; reinstale/migre com o host OpenCode |
| `/jatai` não existe | confira `.opencode/commands/jatai.md`; rode a extensão no workspace ou o `Migrate Kit` |
| MCP não conecta | `opencode mcp list`; confira o caminho `.github/scripts/jatai-mcp.cjs` e se o Node está no PATH |
| Config com comentários não foi alterada | o merge só edita JSON/JSONC válido; corrija o arquivo e rode de novo |
| O mapa não mostra o subagente | veja `runs/*.jsonl`; confira o plugin e o `--harness opencode` no CLI |

## Compatibilidade `.claude`

O OpenCode lê `.claude/skills` e `.claude/commands`, mas **não** lê
`.claude/agents`. Um workspace Claude existente consegue rodar o `/helyx` no
OpenCode e carregar as skills, mas não tem agentes nativos, `mode`, permissões
por agente nem IDs como `@assessor`. Para o suporte completo, instale o host
OpenCode (`.opencode/`).

## Limites desta versão

- OpenCode **2.x**; o V1 fica para uma decisão futura.
- A troca de harness de um workspace existente (Claude/Copilot → OpenCode) não é
  feita pelo produto; o caminho manual é documentado no relatório da iniciativa.
- O Cockpit e o mapa vivem no VS Code; o OpenCode é o terminal.
- Windows: o produto funciona, mas o job de Windows do CI ainda é experimental
  na 1.0.0.
