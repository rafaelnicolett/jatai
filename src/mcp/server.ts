#!/usr/bin/env node
/**
 * server.ts
 *
 * Entrypoint standalone do servidor MCP do State Service (item 2.4, roadmap
 * `mod-state-service`). NÃO é parte do Extension Host — é um processo Node
 * separado, iniciado via stdio por qualquer cliente/host MCP (ex.: um
 * `.mcp.json` de agente), exatamente como qualquer outro servidor MCP.
 *
 * ADR-0004: esta é a ÚNICA fronteira entre agente e o State Service — o
 * agente nunca chama a API HTTP (`StateServiceServer`) direto, só estas 3
 * tools (`tools.ts`), que por sua vez só falam com o State Service via
 * `state-service-client.ts`.
 *
 * Descoberta do workspace, nesta ordem: a variável de ambiente
 * `HELYX_WORKSPACE_ROOT` no `.mcp.json` (`env: { HELYX_WORKSPACE_ROOT:
 * "/caminho/do/workspace" }`, útil quando o host não permite configurar `cwd`
 * diretamente); `CLAUDE_PROJECT_DIR`, a pasta do projeto que o Claude Code
 * passa ao servidor MCP que ele sobe (F5.2); `process.cwd()` (o cliente MCP
 * tipicamente spawna com `cwd` apontando pra raiz do workspace).
 *
 * Build: `npm run build:mcp` (esbuild, bundle CJS) gera `dist/mcp/server.js`.
 * Rodar: `npm run mcp-server` (ou `node dist/mcp/server.js` direto).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStateServiceTools } from "./tools";
import { BRAND } from "../data/brand.pure";

async function main(): Promise<void> {
  const server = new McpServer({ name: BRAND.mcpServerName, version: "0.1.0" });
  registerStateServiceTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout é o canal do protocolo MCP — nunca escrever log ali. console.error
  // vai pro stderr, seguro pra diagnóstico do host que spawnou o processo.
  console.error(`[${BRAND.name}] servidor MCP do State Service rodando via stdio`);
}

main().catch((err) => {
  console.error(`[${BRAND.name}] servidor MCP: falha fatal ao iniciar:`, err);
  process.exit(1);
});
