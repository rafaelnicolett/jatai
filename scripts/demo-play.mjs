#!/usr/bin/env node
/**
 * demo-play.mjs: acrescenta eventos ao vivo ao workspace demo (F7.4)
 *
 * Serve para ver o mapa se mexendo num VS Code de verdade: abra `.demo/` com a
 * Jataí instalada, deixe o Cockpit e o mapa visíveis e rode `npm run demo:play`.
 * As cenas vêm de `demo/roteiro-ao-vivo.json` e usam o horário de agora:
 * uma tarefa avança, um agente começa outra, uma decisão é pedida (a guarda acende),
 * e a decisão chega depois de uma pausa.
 *
 * Como grava: os eventos das cenas são escritos direto em
 * `.github/artifacts/runs/<iniciativa>.jsonl`, uma linha por evento, no formato do
 * contrato agent-activity e conferidos por `scripts/lib/agent-activity.mjs` antes
 * de gravar. O verbo `runs append` do CLI existe (F5.2), mas recusa os tipos de
 * humano (`decision-made`, `gate-approved`, `item-approved`), e a decisão simulada
 * precisa de um, então a cena não passa por ele. As mudanças de estado das cenas
 * (`estado`) vão pelo CLI de estado instalado no demo, e cada uma grava, por conta
 * própria, um `artifact-written` (run_id `state-commands`), como no uso real.
 *
 * A decisão é uma SIMULAÇÃO da "Pessoa Exemplo" para o GIF não ficar parado. No
 * uso real, nenhum agente decide por você (ADR-0024): quem aprova é uma pessoa,
 * no Cockpit ou pelo CLI. `--deixar-guarda-acesa` pula a decisão, e a guarda
 * continua acesa para o print.
 *
 * Uso:
 *   node scripts/demo-play.mjs                       roda as cenas em .demo/, com as pausas do roteiro
 *   node scripts/demo-play.mjs --rapido              sem pausas
 *   node scripts/demo-play.mjs --velocidade 2        pausas na metade do tempo
 *   node scripts/demo-play.mjs --deixar-guarda-acesa não simula a decisão
 *   node scripts/demo-play.mjs --simular             só mostra as linhas, sem gravar nada
 *   node scripts/demo-play.mjs --out <pasta>         outro demo gerado
 *   npm run demo:play                                o mesmo que o primeiro, pelo npm
 *
 * Saída: exit 0 = cenas rodadas; 1 = demo inexistente ou falha ao gravar; 2 = uso errado.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEMO_DIR, looksLikeDemo } from "./demo-build.mjs";
import { serializeRunEvent, validateRunEvent } from "./lib/agent-activity.mjs";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROTEIRO = path.join(PKG_ROOT, "demo", "roteiro-ao-vivo.json");
const RUNS_REL = [".github", "artifacts", "runs"];

export class DemoPlayError extends Error {}

export function loadRoteiro(file = ROTEIRO) {
  const roteiro = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (typeof roteiro.iniciativa !== "string" || !Array.isArray(roteiro.cenas) || roteiro.cenas.length === 0) {
    throw new DemoPlayError(`${file}: o roteiro precisa de "iniciativa" e de uma lista "cenas" não vazia`);
  }
  return roteiro;
}

/** Horário no formato do contrato: ISO 8601 em UTC, sem milissegundos. */
export function isoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** O evento de uma cena, completado com o `run_id`, a iniciativa e o horário de agora. */
export function materializeEvent(template, { iniciativa, now }) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    run_id: `r-${day}-9001`,
    timestamp: isoSeconds(now),
    initiative_id: iniciativa,
    ...template,
  };
}

/** As cenas que rodam: sem as de decisão quando a guarda deve ficar acesa. */
export function planScenes(roteiro, { deixarGuardaAcesa = false } = {}) {
  return roteiro.cenas.filter((cena) => !(deixarGuardaAcesa && cena.decisao === true));
}

/** Acrescenta uma linha ao `.jsonl`, sempre numa linha nova (o arquivo pode ter sido escrito sem a quebra final). */
export function appendEvent(file, event) {
  const problems = validateRunEvent(event);
  if (problems.length > 0) throw new DemoPlayError(`evento inválido (${problems.join("; ")})`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let prefix = "";
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    const fd = fs.openSync(file, "r");
    const last = Buffer.alloc(1);
    fs.readSync(fd, last, 0, 1, fs.statSync(file).size - 1);
    fs.closeSync(fd);
    if (last.toString("utf-8") !== "\n") prefix = "\n";
  }
  fs.appendFileSync(file, `${prefix}${serializeRunEvent(event)}\n`, "utf-8");
}

/** Mudança de estado de uma cena, pelo CLI de estado instalado no demo. Devolve a resposta (a linha JSON do CLI). */
export function runStateChange(out, iniciativa, estado, now, brand) {
  const cli = path.join(out, ".github", "scripts", brand.files.cli);
  const args = [cli, "initiatives", "upsert-wave-item", "--id", iniciativa, "--wave", estado.wave, "--item", estado.item, "--status", estado.status, "--hierarchy", "epic-feature-backlog-task"];
  if (estado.repo) args.push("--repo", estado.repo);
  if (estado.status === "done") args.push("--completed-at", isoSeconds(now));
  if (estado.summary) args.push("--summary", estado.summary);
  const result = spawnSync(process.execPath, args, { cwd: out, encoding: "utf-8", env: { PATH: process.env.PATH ?? "" } });
  let body;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    throw new DemoPlayError(`o CLI de estado não respondeu em JSON (código ${result.status}): ${result.stderr || result.stdout}`);
  }
  if (!body.ok) throw new DemoPlayError(`o CLI de estado recusou a mudança de ${estado.item}: ${body.error?.message ?? JSON.stringify(body)}`);
  return body;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Roda as cenas. `now`, `sleep` e `changeState` são injetáveis para os testes; `speed`
 * divide as pausas (0 = sem pausa). Devolve as linhas gravadas e os caminhos tocados.
 */
export async function playDemo({
  out = path.join(PKG_ROOT, DEMO_DIR),
  roteiro = loadRoteiro(),
  now = () => new Date(),
  sleep = defaultSleep,
  speed = 1,
  deixarGuardaAcesa = false,
  dryRun = false,
  log = console.log,
  changeState,
} = {}) {
  const abs = path.resolve(out);
  if (!dryRun && !looksLikeDemo(abs)) {
    throw new DemoPlayError(`${abs} não é um demo gerado. Rode \`npm run demo\` antes (ou passe --out com a pasta do demo).`);
  }
  const brand = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "src", "data", "brand.json"), "utf-8"));
  const file = path.join(abs, ...RUNS_REL, `${roteiro.iniciativa}.jsonl`);
  const change = changeState ?? ((estado, when) => runStateChange(abs, roteiro.iniciativa, estado, when, brand));
  const started = now();
  const lines = [];

  for (const cena of planScenes(roteiro, { deixarGuardaAcesa })) {
    const wait = speed > 0 ? (cena.depoisDeSegundos * 1000) / speed : 0;
    if (wait > 0) await sleep(wait);
    const when = now();
    const event = materializeEvent(cena.evento, { iniciativa: roteiro.iniciativa, now: when });
    const elapsed = Math.round((when.getTime() - started.getTime()) / 1000);
    const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
    const what = [event.event_type, event.task_id, event.message].filter(Boolean).join(" · ");
    log(`  [${clock}] ${cena.decisao ? "(simulação de Pessoa Exemplo) " : ""}${what}`);
    if (dryRun) {
      const problems = validateRunEvent(event);
      if (problems.length > 0) throw new DemoPlayError(`cena inválida (${problems.join("; ")})`);
      lines.push(serializeRunEvent(event));
      continue;
    }
    if (cena.estado) change(cena.estado, when);
    appendEvent(file, event);
    lines.push(serializeRunEvent(event));
  }
  return { file, lines };
}

function parseArgs(argv) {
  const opts = { out: path.join(PKG_ROOT, DEMO_DIR), speed: 1, deixarGuardaAcesa: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) opts.out = path.resolve(argv[++i]);
    else if (a === "--rapido") opts.speed = 0;
    else if (a === "--velocidade" && argv[i + 1] && Number(argv[i + 1]) > 0) opts.speed = Number(argv[++i]);
    else if (a === "--deixar-guarda-acesa") opts.deixarGuardaAcesa = true;
    else if (a === "--simular") opts.dryRun = true;
    else return null;
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts) {
    console.error("uso: node scripts/demo-play.mjs [--out <pasta>] [--rapido | --velocidade <n>] [--deixar-guarda-acesa] [--simular]");
    return 2;
  }
  try {
    const roteiro = loadRoteiro();
    console.log(`demo-play: ${roteiro.cenas.length} cena(s) em ${roteiro.iniciativa}${opts.dryRun ? " (simulação: nada é gravado)" : ""}`);
    if (!opts.deixarGuardaAcesa) console.log("  A decisão abaixo é simulada. No uso real, quem decide é você, no Cockpit ou pelo CLI.");
    const { file, lines } = await playDemo({ ...opts, roteiro });
    console.log(`demo-play: ${lines.length} evento(s) ${opts.dryRun ? "validados" : `acrescentados a ${path.relative(process.cwd(), file) || file}`}`);
    return 0;
  } catch (err) {
    console.error(`demo-play: ${err instanceof DemoPlayError ? err.message : (err?.stack ?? err)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(await main(process.argv.slice(2)));
}
