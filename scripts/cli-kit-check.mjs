#!/usr/bin/env node
/**
 * cli-kit-check.mjs — smoke do pacote da CLI (epic-10).
 *
 * Roda o pacote montado em `dist/cli-package/` num diretório temporário:
 * `--version`, `harness list --json`, `init --harness opencode --json` e
 * `doctor --json`. Não publica nada e não escreve fora do temp.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(PKG_ROOT, "dist", "cli-package", "jatai.cjs");
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"));

if (!fs.existsSync(CLI)) {
  console.error("cli-kit-check: dist/cli-package/jatai.cjs não existe. Rode `npm run build:cli-kit` antes.");
  process.exit(1);
}

function run(args, cwd = PKG_ROOT) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function fail(message, r) {
  console.error(`cli-kit-check: ${message}`);
  if (r) console.error(`  exit ${r.status}\n  stdout: ${r.stdout}\n  stderr: ${r.stderr}`);
  process.exit(1);
}

const version = run(["--version"]);
if (version.status !== 0 || version.stdout.trim() !== pkg.version) fail(`--version esperava ${pkg.version}`, version);

const listed = run(["harness", "list", "--json"]);
if (listed.status !== 0) fail("harness list falhou", listed);
const harnesses = JSON.parse(listed.stdout).harnesses;
if (!Array.isArray(harnesses) || harnesses.length !== 3) fail("harness list deveria trazer 3 harnesses", listed);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jatai-cli-check-"));
try {
  const init = run(["init", "--harness", "opencode", "--dir", tmp, "--name", "ws-check", "--yes", "--json"]);
  if (init.status !== 0) fail("init opencode falhou", init);
  const result = JSON.parse(init.stdout);
  if (result.ok !== true || result.harness !== "opencode") fail("init devolveu resultado inesperado", init);
  if (!fs.existsSync(path.join(tmp, ".opencode", "agents", "jatai.md"))) fail("init não criou o orquestrador do OpenCode");
  if (!fs.existsSync(path.join(tmp, "opencode.json"))) fail("init não criou opencode.json");

  const doctor = run(["doctor", "--dir", tmp, "--json"]);
  if (doctor.status !== 0) fail("doctor deveria passar num workspace recém-instalado", doctor);
  const diagnosis = JSON.parse(doctor.stdout);
  if (diagnosis.ok !== true) fail("doctor devolveu ok:false", doctor);

  const update = run(["update", "--dir", tmp, "--yes", "--json"]);
  if (update.status !== 0) fail("update falhou num workspace recém-instalado", update);

  fs.rmSync(path.join(tmp, ".opencode", "agents", "assessor.md"), { force: true });
  const broken = run(["doctor", "--dir", tmp, "--json"]);
  if (broken.status !== 1) fail("doctor deveria falhar com um agente do kit ausente", broken);
  const brokenResult = JSON.parse(broken.stdout);
  if (brokenResult.ok !== false || brokenResult.errors < 1) fail("doctor não apontou o arquivo ausente", broken);

  const uninstall = run(["uninstall", "--dir", tmp, "--yes", "--json"]);
  if (uninstall.status !== 0) fail("uninstall falhou", uninstall);
  if (fs.existsSync(path.join(tmp, ".opencode", "agents", "jatai.md"))) fail("uninstall não removeu o orquestrador");
  if (!fs.existsSync(path.join(tmp, "jatai.config.yaml"))) fail("uninstall removeu o config do workspace");

  console.log("cli-kit-check: OK — version, harness list, init opencode, doctor (saudável/quebrado), update e uninstall");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
