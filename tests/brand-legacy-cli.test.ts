import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { legacyCliShim } from "../src/generator/legacy-cli-shim";
import { StructureGenerator } from "../src/generator/StructureGenerator";
import { BRAND, type Brand } from "../src/data/brand.pure";

/**
 * Expand da F1.3 (ADR-0013), superfície "CLI legado": num workspace migrado,
 * o CLI de estado da marca anterior (`.github/scripts/<legacy.cliFiles>`) vira
 * um atalho que repassa tudo para o CLI atual. Os agentes de kits anteriores
 * continuam funcionando, com o motor novo.
 */

/** Marca sintética: o CLI atual se chama `nova-state.cjs`. */
const NOVA: Brand = { ...BRAND, displayName: "Nova", files: { ...BRAND.files, cli: "nova-state.cjs" } };

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-legacy-cli-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** CLI atual falso: ecoa argv e cwd numa linha JSON e sai com o código pedido em `--exit`. */
const FAKE_CLI = [
  '"use strict";',
  "const args = process.argv.slice(2);",
  'const i = args.indexOf("--exit");',
  "process.stdout.write(JSON.stringify({ ok: true, args, cwd: process.cwd() }) + \"\\n\");",
  'process.stderr.write("aviso no stderr\\n");',
  "process.exit(i === -1 ? 0 : Number(args[i + 1]));",
  "",
].join("\n");

function scripts(): string {
  const dir = path.join(tmpDir, ".github", "scripts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runShim(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [path.join(tmpDir, ".github", "scripts", "velha-state.cjs"), ...args], { cwd, encoding: "utf-8" });
}

describe("legacyCliShim — o caminho antigo repassa para o CLI atual", () => {
  it("repassa argumentos, cwd, stdout, stderr e o código de saída", () => {
    const dir = scripts();
    fs.writeFileSync(path.join(dir, "nova-state.cjs"), FAKE_CLI);
    fs.writeFileSync(path.join(dir, "velha-state.cjs"), legacyCliShim("velha-state.cjs", NOVA));
    const sub = path.join(tmpDir, "sub");
    fs.mkdirSync(sub);

    const ok = runShim(sub, ["initiatives", "create", "--id", "x y"]);
    expect(ok.status).toBe(0);
    expect(JSON.parse(String(ok.stdout))).toEqual({ ok: true, args: ["initiatives", "create", "--id", "x y"], cwd: fs.realpathSync(sub) });
    expect(String(ok.stderr)).toBe("aviso no stderr\n");

    expect(runShim(tmpDir, ["x", "y", "--exit", "1"]).status).toBe(1);
    expect(runShim(tmpDir, ["x", "y", "--exit", "2"]).status).toBe(2);
  });

  it("sem o CLI atual, repassa a falha do node (exit diferente de 0)", () => {
    const dir = scripts();
    fs.writeFileSync(path.join(dir, "velha-state.cjs"), legacyCliShim("velha-state.cjs", NOVA));
    expect(runShim(tmpDir, ["initiatives", "create"]).status).not.toBe(0);
  });

  it("CLI atual morto por sinal: sai 2 com o envelope JSON de erro interno (nunca prosa)", () => {
    if (process.platform === "win32") return; // sem sinal POSIX no Windows
    const dir = scripts();
    fs.writeFileSync(path.join(dir, "nova-state.cjs"), 'process.kill(process.pid, "SIGKILL");\n');
    fs.writeFileSync(path.join(dir, "velha-state.cjs"), legacyCliShim("velha-state.cjs", NOVA));
    const run = runShim(tmpDir, ["initiatives", "create"]);
    expect(run.status).toBe(2);
    expect(JSON.parse(String(run.stdout))).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "velha-state.cjs → nova-state.cjs: encerrado por SIGKILL" },
    });
  });

  it("começa com shebang e cita o CLI de destino", () => {
    const text = legacyCliShim("velha-state.cjs", NOVA);
    expect(text.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(text).toContain('path.join(__dirname, "nova-state.cjs")');
  });
});

describe("migrateKit — troca o CLI legado que existir pelo atalho", () => {
  it.each(BRAND.legacy.cliFiles.map((f) => [f]))("%s existente vira atalho executável", async (legacy) => {
    const dir = scripts();
    fs.writeFileSync(path.join(dir, legacy), "// bundle antigo\n");
    await new StructureGenerator().migrateKit(tmpDir, "ws", "copilot");
    expect(fs.readFileSync(path.join(dir, legacy), "utf-8")).toBe(legacyCliShim(legacy));
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, legacy)).mode & 0o777).toBe(0o755);
    expect(fs.existsSync(path.join(dir, BRAND.files.cli))).toBe(true);
  });

  it("workspace sem CLI legado não ganha o caminho antigo", async () => {
    await new StructureGenerator().migrateKit(tmpDir, "ws", "copilot");
    for (const legacy of BRAND.legacy.cliFiles) expect(fs.existsSync(path.join(tmpDir, ".github", "scripts", legacy))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".github", "scripts", BRAND.files.cli))).toBe(true);
  });
});
