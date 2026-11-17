# ADR-0025: Servidor MCP instalado pelo kit e o agente `jatai` como entrada nos dois harnesses

## Status

aceita em 2026-11-15, pelo titular do projeto.

## Contexto

- **MCP.** O servidor MCP da Jataí (`src/mcp/server.ts`, um cliente fino do State
  Service local) só existia dentro da extensão, em `dist/mcp/server.js`. O caminho é
  absoluto e muda a cada versão, e nada configurava o MCP no workspace:
  - o Claude Code lê `.mcp.json` na raiz do projeto;
  - o Copilot lê `.vscode/mcp.json`.
  Na prática, os agentes não tinham as tools MCP. Uma alternativa seria
  `contributes.mcpServerDefinitionProviders`, mas ela só existe dentro do VS Code, e o
  Claude Code fora do editor não a enxerga.
- **Ponto de entrada.**
  - No Claude Code, a metodologia começa no agente orquestrador `@jatai`
    (`.claude/agents/jatai.agent.md`).
  - No Copilot, `@jatai` era o participante de chat da extensão, que só conversa: não
    aciona agentes nem grava arquivos. O orquestrador existe como custom agent em
    `.github/agents/`.
  - As instruções do kit para o Copilot ainda apontavam para o nome antigo do
    orquestrador.
  - Resultado: dois fluxos diferentes para a mesma metodologia.

## Decisão

1. **O kit instala o servidor MCP como instala o CLI.**
   - Um bundle `jatai-mcp.cjs` vai para `.github/scripts/`, ao lado do
     `jatai-state.cjs`. Ele é versionado no kit, gerado pelo build e conferido contra a
     fonte no CI, como o bundle do CLI.
   - O gerador escreve `.mcp.json` (Claude Code) e `.vscode/mcp.json` (Copilot)
     apontando para ele com caminho relativo ao workspace.
   - O `migrateKit` atualiza o bundle e os dois arquivos sem apagar servidores MCP que
     o time já tenha declarado: faz merge por nome.
   - O servidor continua só cliente do State Service em `localhost`, descoberto pelo
     `server.json`, sem rede externa ([ADR-0015](0015-v1-aberta-local-sem-envio-de-dados.md)).
2. **O agente orquestrador `jatai` é a entrada nos dois harnesses.**
   - No Claude Code, é o agente `@jatai`. No Copilot, é o custom agent `jatai`,
     escolhido no seletor de agentes.
   - As instruções do kit (`CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`) dizem
     a mesma coisa nos dois.
   - O participante de chat da extensão vira **guia**: mostra onde a iniciativa está,
     explica o próximo passo e encaminha para o agente `jatai`. Ele não aciona agentes
     nem grava arquivos.
   - O nome do participante muda para não colidir com o agente, e o `BRAND` continua
     sendo a fonte do nome.
   - `/jatai` como prompt file no Copilot é opcional e só entra com BDD.

## Consequências

- (+) Mesmo fluxo e mesmas tools MCP no Claude Code e no Copilot, dentro e fora do
  VS Code.
- (+) Os agentes passam a ler e gravar estado pelas tools MCP, com lock e validação, e
  não só pelo CLI.
- (−) Mais um bundle versionado no kit, de cerca de 1 MB, que precisa acompanhar o
  `kit_version`.
- (−) `.mcp.json` e `.vscode/mcp.json` são arquivos do repositório de quem usa. O
  merge precisa preservar o que já existir, e isso tem teste próprio.
- (−) O nome do participante de chat muda, o que é um contrato visível. A leitura do
  legado segue a [ADR-0013](0013-marca-jatai-simbolo-guarda-marca-como-dado.md).

Veja [agentes](../metodologia/agentes.md).
