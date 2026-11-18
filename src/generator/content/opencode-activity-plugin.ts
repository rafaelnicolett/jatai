/**
 * opencode-activity-plugin.ts
 *
 * Gera o plugin local de atividade de agente do OpenCode 2.x (epic-9,
 * contrato agent-activity §4). É o equivalente opencode dos hooks do Claude
 * Code: assina `session.created` (só sessões filhas, com `parentID` e
 * `agent`) e `session.execution.*`, e chama o CLI de estado `runs append` com
 * `--harness opencode`.
 *
 * Regras do contrato:
 * - só a sessão filha vira `agent-started`/`agent-done`; a primária é ignorada;
 * - `execution.succeeded` da filha → `agent-done`;
 * - `execution.failed`/`interrupted` da filha → `blocked` com motivo fixo;
 * - nunca envia conteúdo de arquivo, prompt ou saída de ferramenta;
 * - fail-open: qualquer erro do plugin (ou do CLI) não pode impedir o agente
 *   de trabalhar; o spawn é assíncrono e desacoplado.
 *
 * O spike (task-9.0) provou que o plugin local carrega com
 * `import { Plugin } from "@opencode/plugin"` e recebe os eventos. Ver
 * `planning/mod-missao-open-source/opencode/opencode-contract.md`.
 */

import { BRAND, type Brand } from "../../data/brand.pure";
import { KIT_SCRIPTS_DIR } from "./mcp-config";

/** Nome do arquivo do plugin em `.opencode/plugins/`. */
export function openCodeActivityPluginFile(brand: Brand = BRAND): string {
  return `${brand.name}-activity.ts`;
}

export function openCodeActivityPlugin(brand: Brand = BRAND): string {
  const id = `${brand.name}-activity`;
  const scripts = KIT_SCRIPTS_DIR.split("/");
  return `import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"
import * as path from "node:path"

// ${brand.displayName} — atividade de agente (contrato agent-activity).
// Só as sessões filhas (subagentes) contam; a sessão primária é ignorada.
const children = new Map<string, string>()

function append(root: string, eventType: string, agent: string, message?: string): void {
  const cli = path.join(root, ...${JSON.stringify(scripts)}, ${JSON.stringify(brand.files.cli)})
  const args = ["runs", "append", "--event-type", eventType, "--agent-id", agent, "--harness", "opencode"]
  if (message) args.push("--message", message)
  const child = spawn("node", [cli, ...args], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}

export default Plugin.define({
  id: ${JSON.stringify(id)},
  async setup(ctx) {
    const root = ctx.location.directory
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            const data = (event as unknown as { data?: Record<string, unknown> }).data ?? {}
            const sessionID = typeof data.sessionID === "string" ? data.sessionID : ""
            if (event.type === "session.created") {
              if (
                sessionID !== "" &&
                typeof data.parentID === "string" && data.parentID !== "" &&
                typeof data.agent === "string" && data.agent !== ""
              ) {
                children.set(sessionID, data.agent)
                append(root, "agent-started", data.agent)
              }
              continue
            }
            if (
              event.type === "session.execution.succeeded" ||
              event.type === "session.execution.failed" ||
              event.type === "session.execution.interrupted"
            ) {
              const agent = children.get(sessionID)
              if (!agent) continue
              children.delete(sessionID)
              if (event.type === "session.execution.succeeded") {
                append(root, "agent-done", agent)
              } else {
                append(root, "blocked", agent, event.type === "session.execution.interrupted" ? "execução interrompida" : "execução falhou")
              }
            }
          } catch {
            // o registro de atividade é melhor esforço
          }
        }
      } catch {
        // stream abortado no unload
      }
    })()
    return () => controller.abort()
  },
})
`;
}
