import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BRAND } from "../src/core/brand/brand.pure";

/**
 * Os comandos do CLI de estado que o kit manda os agentes rodarem (F2.3,
 * segunda passada; onda 5b).
 *
 * O kit escreve `node .github/scripts/{{brand.files.cli}} <artefato> <verbo> ...`
 * em dezenas de lugares. Um exemplo com flag inventada ou valor fora do
 * vocabulário faz o agente tomar um erro de uso na primeira tentativa, e a
 * regra "agente nunca registra decisão humana" só vale se o texto também a
 * respeita. Aqui cada `runs append` do kit roda de verdade, no bundle do CLI
 * que o kit instala, num workspace descartável.
 */

const PKG_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(PKG_ROOT, "kit/scripts", BRAND.files.cli);
const CLI_MACRO = "node .github/scripts/{{brand.files.cli}}";
const KIT_DIRS = ["kit/content", "kit/variants"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const rel = (file: string): string => path.relative(PKG_ROOT, file).split(path.sep).join("/");
const KIT_MD = KIT_DIRS.flatMap((d) => walk(path.join(PKG_ROOT, d))).sort();

interface KitCommand {
  file: string;
  line: number;
  /** Os argumentos depois do script, já separados como o shell separaria. */
  args: string[];
}

/** Separa uma linha de comando em argumentos, respeitando aspas simples e duplas. */
function shellSplit(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/**
 * Todo `node .github/scripts/<cli> ...` do kit que está num bloco de código
 * (um exemplo para rodar, não uma menção no texto), com as continuações de
 * linha (`\`) juntas.
 */
function kitCommands(): KitCommand[] {
  const found: KitCommand[] = [];
  for (const file of KIT_MD) {
    const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i]!)) {
        inFence = !inFence;
        continue;
      }
      if (!inFence) continue;
      const at = lines[i]!.indexOf(CLI_MACRO);
      if (at === -1) continue;
      let text = lines[i]!.slice(at + CLI_MACRO.length);
      let j = i;
      while (text.trimEnd().endsWith("\\") && j + 1 < lines.length) {
        text = `${text.trimEnd().slice(0, -1)} ${lines[++j]!.trim()}`;
      }
      found.push({ file: rel(file), line: i + 1, args: shellSplit(text) });
    }
  }
  return found;
}

const COMMANDS = kitCommands();
const RUNS_APPEND = COMMANDS.filter((c) => c.args[0] === "runs" && c.args[1] === "append");

/** Um `<placeholder>` do exemplo vira um id válido, como o agente faria. */
const concrete = (arg: string): string => arg.replace(/<[^>]+>/g, "x-1");

function run(args: string[]): { status: number; body: { ok: boolean; error?: { code?: string; allowed?: string[] }; event?: Record<string, unknown> } } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kit-cli-"));
  fs.mkdirSync(path.join(cwd, ".github/artifacts"), { recursive: true });
  // Ambiente por allowlist: sem a pasta do projeto do Claude Code nem o State Service do desenvolvedor.
  const env = { PATH: process.env.PATH ?? "", HOME: cwd };
  try {
    const stdout = execFileSync("node", [CLI, ...args.map(concrete)], { cwd, env, encoding: "utf-8" });
    return { status: 0, body: JSON.parse(stdout.trim().split("\n").pop()!) };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { status: e.status ?? 1, body: JSON.parse((e.stdout ?? "{}").trim().split("\n").pop() || "{}") };
  }
}

describe("os comandos de estado que o kit manda rodar", () => {
  it("o kit manda os agentes registrarem atividade pelo CLI (runs append), e não à mão", () => {
    const files = new Set(RUNS_APPEND.map((c) => c.file));
    expect(files.has("kit/content/agents/discovery/assessor.agent.md")).toBe(true);
    expect(files.has("kit/variants/greenfield/chatmodes/maestro.chatmode.md")).toBe(true);
  });

  it.each(RUNS_APPEND.map((c) => [`${c.file}:${c.line}`, c] as const))("REGRESSÃO: o exemplo de runs append de %s roda no CLI do kit", (_where, command) => {
    const { status, body } = run(command.args);
    expect(body, JSON.stringify(body)).toMatchObject({ ok: true });
    expect(status).toBe(0);
    expect(body.event).toMatchObject({ harness: "cli" });
  });

  it("o CLI recusa o que o kit proíbe o agente de registrar: gate-approved, item-approved e decision-made", () => {
    for (const type of ["gate-approved", "item-approved", "decision-made"]) {
      const { status, body } = run(["runs", "append", "--event_type", type, "--phase_id", "tech-stack"]);
      expect(status, type).toBe(1);
      expect(body.error?.code, type).toBe("INVALID_ENUM");
      expect(body.error?.allowed, type).not.toContain(type);
    }
  });

  it("nenhum agente do kit é mandado registrar um evento de decisão humana", () => {
    const proibidos = /--event[_-]type\s+(gate-approved|item-approved|decision-made)/;
    const achados = KIT_MD.flatMap((file) =>
      fs
        .readFileSync(file, "utf-8")
        .split(/\r?\n/)
        .flatMap((text, i) => (proibidos.test(text) ? [`${rel(file)}:${i + 1}`] : []))
    );
    expect(achados).toEqual([]);
  });

  it("o texto do kit não manda o agente escrever linhas JSONL em runs/ à mão", () => {
    const aMao = /"event_type"\s*:\s*"|runs\/<run-id>\.jsonl|escreva uma linha em\s+`?\.github\/artifacts\/runs/;
    const achados = KIT_MD.flatMap((file) =>
      fs
        .readFileSync(file, "utf-8")
        .split(/\r?\n/)
        .flatMap((text, i) => (aMao.test(text) ? [`${rel(file)}:${i + 1}`] : []))
    );
    expect(achados).toEqual([]);
  });
});
