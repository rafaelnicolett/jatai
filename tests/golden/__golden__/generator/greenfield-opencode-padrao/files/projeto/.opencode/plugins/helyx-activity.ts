import { Plugin } from "@opencode/plugin"
import { spawn } from "node:child_process"
import * as path from "node:path"

// Helyx — atividade de agente (contrato agent-activity).
// Só as sessões filhas (subagentes) contam; a sessão primária é ignorada.
const children = new Map<string, string>()

function append(root: string, eventType: string, agent: string, message?: string): void {
  const cli = path.join(root, ...[".github","scripts"], "helyx-state.cjs")
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
  id: "helyx-activity",
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
