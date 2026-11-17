/**
 * paths.ts — onde ficam o repositório, o kit e os goldens.
 *
 * A versão do kit é lida direto do `package.json`, de propósito, e não via
 * `kitVersion()` de `src/data/kit-version.ts`. Se a troca de marca quebrar o
 * `kitVersion()` (ele só reconhece o pacote `helyx-vscode`), a saída passa a
 * dizer `kit_version: "0.0.0"`, o normalizador não reconhece e o golden falha.
 * Usar a função de produção aqui esconderia exatamente esse defeito.
 */
import * as fs from "fs";
import * as path from "path";
import { CURRENT_BRAND, GOLDEN_BRAND } from "./brand";

/** Raiz do repositório `jatai` (onde ficam `package.json`, `kit/`, `src/`). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Raiz dos goldens versionados. */
export const GOLDEN_ROOT = path.join(REPO_ROOT, "tests", "golden", "__golden__");

export function packageVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as { version?: string };
  if (!pkg.version) throw new Error("package.json sem campo version");
  return pkg.version;
}

/** Nome do bundle do CLI de estado, derivado da marca atual (`helyx-state.cjs`). */
export function cliBundleName(): string {
  return `${CURRENT_BRAND.slug}-state.cjs`;
}

/** Bundle do CLI que o kit instala em `.github/scripts/` (fonte: `npm run build:cli`). */
export function kitCliBundlePath(): string {
  return path.join(REPO_ROOT, "kit", "scripts", cliBundleName());
}

/**
 * Entry point do CLI no código-fonte: o mesmo que o `build:cli` do
 * `package.json` compila. O nome do arquivo-fonte é de código, não segue a
 * marca (F1.3); o do bundle segue.
 */
export function cliSourceEntry(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as { scripts?: Record<string, string> };
  const entry = /^esbuild\s+(\S+\.ts)\s/.exec(pkg.scripts?.["build:cli"] ?? "")?.[1];
  if (!entry) throw new Error("package.json: build:cli sem o entry point .ts do esbuild");
  return path.join(REPO_ROOT, entry);
}

/**
 * Sufixo (POSIX, já normalizado para a marca do golden) do path onde todo
 * workspace gerado recebe o CLI. Casado contra paths depois da normalização
 * de marca, por isso usa `GOLDEN_BRAND`.
 */
export function installedCliGoldenSuffix(): string {
  return `.github/scripts/${GOLDEN_BRAND.slug}-state.cjs`;
}

/** Nome do bundle do servidor MCP, derivado da marca atual (`helyx-mcp.cjs`, ADR-0025). */
export function mcpBundleName(): string {
  return `${CURRENT_BRAND.slug}-mcp.cjs`;
}

/** Bundle do servidor MCP que o kit instala em `.github/scripts/` (fonte: `npm run build:mcp`). */
export function kitMcpBundlePath(): string {
  return path.join(REPO_ROOT, "kit", "scripts", mcpBundleName());
}

/** Sufixo (POSIX, na marca do golden) do path onde o workspace recebe o servidor MCP. */
export function installedMcpGoldenSuffix(): string {
  return `.github/scripts/${GOLDEN_BRAND.slug}-mcp.cjs`;
}
