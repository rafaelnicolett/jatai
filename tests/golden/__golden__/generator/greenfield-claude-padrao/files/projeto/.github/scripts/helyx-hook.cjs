#!/usr/bin/env node
// helyx-hook.cjs: gerado pela Helyx (contrato agent-activity). Os hooks de projeto
// do Claude Code (.claude/settings.json) chamam este arquivo com o tipo de evento; ele lê
// o aviso do Claude Code (JSON no stdin) e o repassa ao CLI de estado, nesta mesma pasta:
// node helyx-state.cjs runs append. Só passa o nome do agente e o caminho do artefato,
// nunca conteúdo. E sai sempre com 0: o hook nunca atrapalha o agente.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const CLI = path.join(__dirname, "helyx-state.cjs");
const FLAGS = {"event_type":"--event-type","agent_id":"--agent-id","artifact_path":"--artifact-path","harness":"--harness"};
const EVENTS = ["agent-started","agent-done","artifact-written"];
const ARTIFACTS = ".github/artifacts/";
const IGNORED = [".github/artifacts/runs/",".github/artifacts/.state-service/"];

function main() {
  const event = process.argv[2];
  if (!EVENTS.includes(event)) return;
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, "utf-8"));
  } catch {
    return;
  }
  const agent = typeof input.agent_type === "string" ? input.agent_type : "";
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const args = ["runs", "append", FLAGS.event_type, event, FLAGS.harness, "claude-code"];
  if (event === "artifact-written") {
    const tool = input.tool_input || {};
    const file = tool.file_path || tool.notebook_path;
    if (typeof file !== "string") return;
    const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
    if (!rel.startsWith(ARTIFACTS) || IGNORED.some((p) => rel.startsWith(p))) return;
    args.push(FLAGS.artifact_path, rel);
    if (agent) args.push(FLAGS.agent_id, agent);
  } else {
    if (!agent) return;
    args.push(FLAGS.agent_id, agent);
  }
  spawnSync(process.execPath, [CLI, ...args], { cwd: root, stdio: "ignore", timeout: 20000 });
}

try {
  main();
} catch {
  // o registro de atividade é melhor esforço
}
process.exit(0);
