/**
 * kit-version.ts
 *
 * Versão do kit instalada no workspace, e o que pode ser migrado.
 *
 * O plugin atualiza; o workspace do cliente não. Sem registrar qual versão
 * instalou a estrutura, um workspace roda meses com agentes antigos enquanto o
 * plugin já mudou o protocolo — e ninguém avisa. Ex.: um workspace criado antes
 * do multi-repo tem `@assessor` sem noção de `repos.yaml`, e o dashboard novo
 * nunca vai refletir nada.
 *
 * **A distinção que sustenta a migração:**
 *
 * - **Do kit** → template versionado. Pode ser sobrescrito na migração.
 * - **Do cliente** → produzido pelo assessment ou pelo humano. **Jamais tocar.**
 *
 * Sobrescrever `agents/domain/` (a LLM Wiki) ou `artifacts/` destruiria o
 * trabalho de dias — é o pior desfecho possível de uma migração.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { BRAND } from "./brand.pure";

/**
 * Nome canônico do config. Os nomes de marcas anteriores
 * (`brand.json › legacy.configFiles`) são lidos como fallback: renomear sem
 * fallback quebraria todo workspace já criado (Expand-Contract, ADR-0013).
 */
export const CONFIG_FILENAME = BRAND.files.config;
/** Configs de marcas anteriores, do mais recente ao mais antigo. */
export const LEGACY_CONFIG_FILENAMES: readonly string[] = BRAND.legacy.configFiles;
/** Todo nome de config reconhecido, na ordem de leitura: o canônico primeiro. */
export const CONFIG_FILENAMES: readonly string[] = [CONFIG_FILENAME, ...LEGACY_CONFIG_FILENAMES];

/**
 * Versão do Helyx em execução — lida do `package.json` da extensão.
 *
 * Fonte única: hardcodar aqui divergiria da versão publicada no primeiro
 * release, e o workspace passaria a registrar uma versão que não existe.
 *
 * O `package.json` certo é reconhecido pelo nome do pacote que o
 * `brand.json` declara (`BRAND.package.name`), e não por um nome escrito
 * aqui: trocar a marca não derruba a versão para `0.0.0` (ADR-0013).
 */
export function kitVersion(): string {
  for (const candidate of [
    path.join(__dirname, "package.json"),              // pacote npm da CLI: bundle na raiz do pacote
    path.join(__dirname, "..", "package.json"),        // runtime: dist/../package.json
    path.join(__dirname, "..", "..", "package.json"),  // fonte: src/data/../../package.json
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8")) as { name?: string; version?: string };
      if (pkg.name === BRAND.package.name && pkg.version) return pkg.version;
    } catch { /* tenta o próximo */ }
  }
  return "0.0.0"; // desconhecida — o status vai marcar como defasado, que é o lado seguro
}

/** Onde o config vive, aceitando os nomes legados. `null` = não é workspace Helyx. */
export function findConfigPath(workspaceRoot: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface KitStatus {
  /** Versão do Helyx que instalou/migrou a estrutura. `null` = anterior ao versionamento. */
  installed: string | null;
  /** Versão do plugin em execução. */
  current: string;
  /** Config usa um nome legado (`brand.json › legacy.configFiles`). */
  legacyConfigName: boolean;
  /** Estrutura defasada — vale oferecer migração. */
  outdated: boolean;
}

/**
 * Compara duas versões semver (`major.minor.patch`, com pré-release ignorado).
 * Devolve <0, 0 ou >0. Comparação por string quebraria em `0.10.0` vs `0.9.0`.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.split("-")[0]!.split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Lê o `kit_version` do config do workspace. */
export function readKitVersion(workspaceRoot: string): string | null {
  const configPath = findConfigPath(workspaceRoot);
  if (!configPath) return null;
  try {
    const doc = yaml.load(fs.readFileSync(configPath, "utf-8")) as { kit_version?: unknown } | null;
    return typeof doc?.kit_version === "string" ? doc.kit_version : null;
  } catch {
    return null;
  }
}

/**
 * Modo do projeto pelo config (A6 / H-BUG-10): `project.mode` quando
 * declarado; senão, `stacks:` identifica o config do Wizard greenfield (que
 * não grava `project.mode`), e o resto é brownfield (Wizard brownfield ou
 * multi-repo do Foundation). Sem config ou com config ilegível: `null`.
 */
export function readProjectMode(workspaceRoot: string): "greenfield" | "brownfield" | null {
  const configPath = findConfigPath(workspaceRoot);
  if (!configPath) return null;
  try {
    const doc = yaml.load(fs.readFileSync(configPath, "utf-8")) as { project?: { mode?: unknown } | null; stacks?: unknown } | null;
    if (!doc || typeof doc !== "object") return null;
    const declared = doc.project && typeof doc.project === "object" ? doc.project.mode : undefined;
    if (declared === "greenfield" || declared === "brownfield") return declared;
    return doc.stacks && typeof doc.stacks === "object" ? "greenfield" : "brownfield";
  } catch {
    return null;
  }
}

/**
 * Estado do kit no workspace.
 *
 * `installed: null` significa estrutura anterior ao versionamento — que é
 * justamente a mais defasada de todas, então conta como `outdated`.
 */
export function getKitStatus(workspaceRoot: string, currentVersion: string): KitStatus | null {
  const configPath = findConfigPath(workspaceRoot);
  if (!configPath) return null; // não é workspace Helyx

  const installed = readKitVersion(workspaceRoot);
  return {
    installed,
    current: currentVersion,
    legacyConfigName: LEGACY_CONFIG_FILENAMES.includes(path.basename(configPath)),
    outdated: installed === null || compareVersions(installed, currentVersion) < 0,
  };
}

/**
 * O que a migração pode sobrescrever — **template do kit**.
 * Paths relativos ao `<host-dir>` (`.github` ou `.claude`), exceto onde indicado.
 */
export const KIT_OWNED = [
  "agents/discovery",
  "agents/planning",
  "agents/execution",
  "agents/operation",
  // O orquestrador: <marca>.agent.md nos dois harnesses (ADR-0025). O
  // maestro.agent.md, que o kit instalava no Copilot, e o de marca anterior
  // são guardados como .bak pela migração (A7 / BUG-11).
  "agents/maestro.agent.md",
  `agents/${BRAND.files.orchestratorAgent}`,
  "chatmodes",
  `commands/${BRAND.files.slashCommand}`,
  // Slash commands de marcas anteriores: o `migrateKit` os mantém como alias (ADR-0013).
  ...BRAND.legacy.slashCommands.map((file) => `commands/${file}`),
] as const;

/**
 * O que a migração **NUNCA** toca — produzido pelo assessment ou pelo humano.
 * Sobrescrever qualquer um destes destrói trabalho real.
 */
export const CLIENT_OWNED = [
  "agents/domain",              // LLM Wiki — 1 agente por bounded context
  "skills/coding-guidelines-",  // prefixo: 1 skill por repositório
] as const;

/** Paths do workspace (fora do host-dir) que a migração nunca toca. */
export const CLIENT_OWNED_WORKSPACE = [
  ".github/artifacts",  // estado do delivery: repos.yaml, foundation-state, assessment
  "docs/input",         // material que o cliente colocou
  "repos",              // código do cliente
] as const;

/**
 * Um arquivo/pasta sob `<host-dir>` pertence ao cliente?
 *
 * Na dúvida, responde `true` — preservar a mais não custa nada; apagar a LLM
 * Wiki de um cliente custa dias de trabalho.
 */
export function isClientOwned(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return CLIENT_OWNED.some((p) => normalized.startsWith(p) || normalized.includes(`/${p}`));
}

/**
 * Grava/atualiza o `kit_version` **preservando o arquivo**.
 *
 * O config é lido e editado por humano e por agente; um `yaml.dump()` apagaria
 * comentários e ordem. Mesma abordagem cirúrgica do `pinned_sha`.
 */
export function upsertKitVersion(configContent: string, version: string): string {
  const lines = configContent.split("\n");
  const idx = lines.findIndex((l) => /^kit_version:/.test(l));

  if (idx !== -1) {
    // Troca só o valor: o comentário da linha sobrevive, e rodar de novo não
    // muda nenhum byte (M1 — o `migrateKit` não era idempotente).
    const comment = lines[idx]!.match(/^kit_version:\s*(?:"[^"]*"|'[^']*'|[^\s#]+)?(\s+#.*)$/)?.[1] ?? "";
    lines[idx] = `kit_version: "${version}"${comment}`;
    return lines.join("\n");
  }

  // Insere logo após `version:` (topo do documento) ou, na falta, no início.
  const anchor = lines.findIndex((l) => /^version:/.test(l));
  const insertAt = anchor !== -1 ? anchor + 1 : 0;
  lines.splice(insertAt, 0, `kit_version: "${version}"   # versão da ${BRAND.displayName} que instalou esta estrutura`);
  return lines.join("\n");
}
