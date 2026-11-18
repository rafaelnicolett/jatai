# ADR-0026: OpenCode como terceiro harness nativo

## Status

aceita em 2026-11-17, pelo titular do projeto, como `epic-9` da missão open
source.

## Contexto

O kit da Jataí é uma fonte única (`kit/`, [ADR-0018](0018-kit-de-agentes-fonte-unica-multi-harness.md))
com adaptadores para **Claude Code** e **GitHub Copilot**. A
[ADR-0025](0025-mcp-no-kit-e-agente-jatai-como-entrada-nos-dois-harnesses.md)
fez o agente `jatai` ser a entrada nos dois e instalou o servidor MCP.

O **OpenCode 2.x** é um harness relevante e tem contrato próprio. O
levantamento de 2026-11-17, validado no OpenCode 2.3.0, mostrou que a
compatibilidade `.claude` é parcial:

- o OpenCode lê `.claude/skills` e `.claude/commands`, mas **não** lê
  `.claude/agents` — não há agente nativo, seletor de subagente nem `mode`;
- o ID do agente é o caminho do arquivo: `.opencode/agents/assessor.md` vira
  `assessor`; `.agent.md` viraria `assessor.agent`;
- frontmatter desconhecido não é ignorado: vira `request.body` da requisição
  ao provedor;
- `model` em lista impede o agente de carregar;
- o MCP é `mcp.servers.<nome>` em `opencode.json(c)`, com `command` em array;
- os eventos `session.created` (com `parentID` e `agent`) e
  `session.execution.*` permitem paridade de atividade via plugin local.

Ao mesmo tempo, a instalação de Claude/Copilot é um contrato congelado por
golden master: qualquer mudança de árvore nesses dois harnesses é regressão.

## Decisão

1. **OpenCode é um harness nativo e opt-in**, escolhido na instalação
   (`host_adapter: "opencode"`), com layout `.opencode/`. A compatibilidade
   `.claude` continua como fallback documentado, não como suporte oficial.
2. **Alvo é o OpenCode V2** (validado em 2.3.0). O V1 fica fora desta versão.
3. **O kit continua neutro; o adaptador faz a tradução.** `OpenCodeAdapter`:
   - `hostDir: ".opencode"`, `AGENTS.md`, `.opencode/commands`,
     `opencode-instructions.md`, sem chatmodes;
   - **achata** os agentes do kit em `.opencode/agents/<id>.md` (o ID é o
     caminho); a LLM Wiki fica em `domain/<slug>.md` (ID `domain/<slug>`);
   - allowlist de frontmatter (`description`, `mode`, `permissions`); remove
     `model` e os metadados do kit/Copilot;
   - orquestrador `primary`, especialistas `subagent`;
   - `uses_skills` vira permissão de `skill` + seção no corpo.
4. **Instruções e entrada.** O brownfield instala
   `opencode-instructions.md` como `AGENTS.md`; o greenfield gera o
   `AGENTS.md` do OpenCode. A entrada é o agente `jatai` (primary) e o
   comando `/jatai`.
5. **MCP.** `opencode.json(c)` com `mcp.servers.jatai`, caminho relativo ao
   workspace (`node .github/scripts/jatai-mcp.cjs`) e merge que preserva
   comentários e o que o time já declarou.
6. **Atividade.** Plugin local `.opencode/plugins/jatai-activity.ts` assina
   `session.created` (só filhas) e `session.execution.*`; escreve
   `runs append --harness opencode`, fail-open. O observador de artefatos
   continua como fallback.
7. **Extensão.** O Wizard oferece o host; o `ConfigLoader` detecta
   `.opencode/agents/<marca>.md`; o Cockpit entrega o prompt em `/jatai`
   (clipboard) e lê os agentes dos três layouts. Não há view de chat OpenCode
   dentro do VS Code.
8. **Nada de deleção.** OpenCode é instalado ao lado; `.claude`/`.github`
   permanecem. A migração preserva `agents/domain/`, as skills do cliente e
   os artefatos.
9. **Contratos aditivos.** `opencode` é um valor novo; os valores antigos
   continuam válidos e os goldens de Claude/Copilot saem byte a byte iguais.

## Consequências

**Positivas**

- O mesmo kit, a mesma metodologia e os mesmos artefatos passam a funcionar
  em três harnesses, com IDs e modo corretos no OpenCode.
- O `OpenCodeAdapter` isola o formato; o núcleo (estado, gates, artefatos)
  não muda.
- A atividade no mapa/Cockpit tem paridade com o Claude Code, com o watcher
  como rede de segurança.
- O usuário escolhe o harness no Wizard e recebe o prompt certo.

**Negativas**

- Mais um adaptador, um arquivo de instruções, um plugin e uma config MCP
  para manter; a API do OpenCode 2.x pode mudar.
- `.agent.md` (Claude/Copilot) e `.md` (OpenCode) divergem no nome do arquivo;
  o lock e o leitor de agentes conhecem os dois.
- `jsonc-parser` virou dependência direta para preservar comentários no
  `opencode.json(c)`.
- O plugin local pode não ser viável em uma versão futura do OpenCode; sem
  ele, o watcher cobre `artifact-written`, mas não `agent-started/done`.
- O suporte oficial a V2 deixa usuários de V1 sem caminho nativo.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Só compatibilidade `.claude` | O OpenCode não carrega `.claude/agents`; não há agentes nativos, `mode`, permissões nem IDs `@assessor`. É fallback, não suporte. |
| Copiar o kit cru para `.opencode/` | IDs viram `<id>.agent`, `model` em lista não carrega e o frontmatter do kit vaza para `request.body`. |
| Duplicar o kit por harness | Volta ao problema da ADR-0018 (três cópias divergentes). O kit é fonte única. |
| Publicar um plugin npm desde o início | Aumenta o escopo de release antes de provar que o plugin local funciona. O spike decidiu pelo plugin local. |
| Trocar o harness de um workspace existente | Hoje o produto não troca Claude ↔ Copilot; abrir essa frente agora mistura migração de host com feature nova. Fica documentado como caminho manual/futuro. |
| Suportar V1 e V2 | Dobra o adaptador e os testes; o V2 é o corrente. V1 fica como decisão futura. |

## Referências

- [Criar agentes e skills](../criar-agentes-e-skills.md)
- [Agentes: papéis e regras de conversa](../metodologia/agentes.md)
- [Arquitetura](../arquitetura.md)
- [ADR-0018](0018-kit-de-agentes-fonte-unica-multi-harness.md)
- [ADR-0025](0025-mcp-no-kit-e-agente-jatai-como-entrada-nos-dois-harnesses.md)
- OpenCode 2.x: docs de agentes, skills, comandos, regras, MCP, config e
  plugins.
