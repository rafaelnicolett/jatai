/**
 * kit-lock.ts
 *
 * O lock do kit no workspace (ADR-0018): `.github/kit.lock.json`, com a
 * versão do kit, a edição, o harness e o sha256 de cada arquivo de conteúdo
 * que o kit instalou. A migração usa o lock para separar o que é do kit do
 * que o time alterou.
 *
 * Política (decisão desta frente, F3.5):
 * - **No lock:** o conteúdo que o kit copia da edição (agentes dos streams do
 *   kit e o orquestrador, skills do kit, chatmodes, o arquivo de instruções do
 *   harness e o AGENTS.md), como ficou no disco depois da adaptação ao
 *   harness. **Fora do lock:** o que é gerado a cada instalação (bundles do
 *   CLI e do MCP, o relé dos hooks, o `/<marca>`), sempre regravado; o que é
 *   mesclado (config, `.gitignore`, `.mcp.json`, `.vscode/mcp.json`,
 *   `.claude/settings.json`); e tudo do time (`agents/domain/`, skills
 *   geradas, `.github/artifacts/**`, `docs/input/`, `repos/`).
 * - **Migração com lock:** arquivo intacto (sha igual ao do lock) é
 *   atualizado; arquivo que o time alterou fica como está, a versão nova do
 *   kit vai para `<arquivo>.kit-new` ao lado, e a migração avisa. O lock
 *   guarda o sha da versão do kit, então a proteção continua nas próximas.
 *   Arquivo do lock que o kit deixou de ter sai se estiver intacto e fica
 *   (com aviso) se o time o alterou. Arquivo que o time apagou volta.
 * - **Migração sem lock** (workspace anterior a ele): como antes, o kit
 *   sobrescreve o que é dele, e o lock nasce no fim.
 * - **Edição:** só o brownfield, a que a migração atualiza. O greenfield
 *   ganha o lock quando tiver migração.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as fss from "fs";
import * as crypto from "crypto";
import { BRAND } from "../../data/brand.pure";
import type { HostId } from "../../data/foundation-prompt";
import { kitVersion } from "../../data/kit-version";
import { atomicWrite } from "../../state/lock/atomic-write";
import type { HarnessAdapter } from "../harness/HarnessAdapter";
import { KIT_ORCHESTRATOR } from "../harness/orchestrator";
import { kitRoot } from "./kit-root";

/** Onde fica o lock, relativo à raiz do workspace. Fora de `.github/artifacts/` (contrato congelado). */
export const KIT_LOCK_PATH = ".github/kit.lock.json";

/** Sufixo da versão nova do kit gravada ao lado de um arquivo que o time alterou. */
export const KIT_NEW_SUFFIX = ".kit-new";

export interface KitLock {
  readonly schema: 1;
  readonly kit_version: string;
  readonly edition: "brownfield";
  readonly harness: HostId;
  /** path relativo à raiz (POSIX) → sha256 do conteúdo que o kit instalou. */
  readonly files: Readonly<Record<string, string>>;
}

/** O que a migração fez com o que o time alterou (vazio = nada a avisar). */
export interface KitMigrationReport {
  /** Arquivos do kit que o time alterou: ficaram como estavam; a versão nova está em `<arquivo>.kit-new`. */
  readonly keptClientEdits: readonly string[];
  /** Arquivos que o kit deixou de ter e que estavam intactos: removidos. */
  readonly removed: readonly string[];
  /** Arquivos que o kit deixou de ter, mas que o time alterou: ficaram. */
  readonly keptDiscontinued: readonly string[];
  /** O workspace não tinha lock (anterior a ele): o kit sobrescreveu o que é dele, como antes. */
  readonly withoutPreviousLock: boolean;
}

const toPosix = (p: string): string => p.split(path.sep).join("/");

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  if (!fss.existsSync(dir)) return out;
  for (const e of fss.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.name !== ".DS_Store") out.push(toPosix(path.relative(base, full)));
  }
  return out;
}

/**
 * Os arquivos de conteúdo que a edição brownfield do kit instala neste
 * harness, em paths relativos à raiz do workspace: a mesma correspondência
 * que o `KitInstaller` aplica (agentes e skills na pasta do harness, o
 * orquestrador com o nome da marca, chatmodes só onde o harness os lê, as
 * instruções do próprio harness e o AGENTS.md).
 */
export function kitOwnedFiles(harness: HarnessAdapter): string[] {
  const out: string[] = [];
  for (const rel of walk(kitRoot("brownfield-templates"))) {
    if (rel === `agents/${KIT_ORCHESTRATOR}`) out.push(`${harness.hostDir}/agents/${harness.orchestratorFile}`);
    else if (rel.startsWith("agents/")) out.push(`${harness.hostDir}/agents/${harness.agentDestination(rel.slice("agents/".length))}`);
    else if (rel.startsWith("skills/")) out.push(`${harness.hostDir}/${rel}`);
    else if (rel.startsWith("chatmodes/")) {
      if (harness.supportsChatmodes) out.push(`.github/${rel}`);
    } else if (rel === harness.kitInstructionsFile) out.push(harness.instructionsFile);
    else if (rel === "AGENTS.md" && harness.genericAgentsMd) out.push(rel);
  }
  return out.sort();
}

/** O lock do workspace, ou `null` (ausente ou ilegível, com aviso). */
export function readKitLock(targetDir: string): KitLock | null {
  const file = path.join(targetDir, KIT_LOCK_PATH);
  if (!fss.existsSync(file)) return null;
  try {
    const doc = JSON.parse(fss.readFileSync(file, "utf-8")) as Partial<KitLock>;
    if (doc.schema !== 1 || typeof doc.files !== "object" || doc.files === null) throw new Error("formato desconhecido");
    return doc as KitLock;
  } catch (err) {
    console.warn(`[${BRAND.name}] ${KIT_LOCK_PATH} ilegível (${(err as Error).message}): a migração segue como sem lock`);
    return null;
  }
}

function fileSha(targetDir: string, rel: string): string | null {
  const full = path.join(targetDir, rel);
  return fss.existsSync(full) ? sha256(fss.readFileSync(full)) : null;
}

/**
 * Grava o lock com o sha de cada arquivo do kit no disco. `kitSha` sobrepõe o
 * sha de um arquivo: o de um arquivo que o time alterou é o da versão do kit
 * (a do `.kit-new`), não o do disco.
 */
export async function writeKitLock(targetDir: string, harness: HarnessAdapter, kitSha: ReadonlyMap<string, string> = new Map()): Promise<void> {
  const files: Record<string, string> = {};
  for (const rel of kitOwnedFiles(harness)) {
    const sha = kitSha.get(rel) ?? fileSha(targetDir, rel);
    if (sha !== null) files[rel] = sha;
  }
  const lock: KitLock = { schema: 1, kit_version: kitVersion(), edition: "brownfield", harness: harness.name, files };
  try {
    await atomicWrite(path.join(targetDir, KIT_LOCK_PATH), () => `${JSON.stringify(lock, null, 2)}\n`);
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao gravar ${KIT_LOCK_PATH}:`, err);
  }
}

/** Antes da migração: os arquivos do lock que o time alterou, com o conteúdo do time. */
export function collectClientEdits(targetDir: string, lock: KitLock | null): Map<string, Buffer> {
  const edits = new Map<string, Buffer>();
  if (lock === null) return edits;
  for (const [rel, sha] of Object.entries(lock.files)) {
    const full = path.join(targetDir, rel);
    if (!fss.existsSync(full)) continue;
    const bytes = fss.readFileSync(full);
    if (sha256(bytes) !== sha) edits.set(rel, bytes);
  }
  return edits;
}

/**
 * Depois da migração (que já gravou a versão nova do kit): devolve ao time o
 * que ele alterou, com a versão nova ao lado (`.kit-new`); tira o que o kit
 * deixou de ter e estava intacto; e grava o lock novo.
 */
export async function reconcileWithLock(
  targetDir: string,
  harness: HarnessAdapter,
  lock: KitLock | null,
  edits: ReadonlyMap<string, Buffer>
): Promise<KitMigrationReport> {
  const keptClientEdits: string[] = [];
  const removed: string[] = [];
  const keptDiscontinued: string[] = [];
  const kitSha = new Map<string, string>();
  const owned = new Set(kitOwnedFiles(harness));

  for (const [rel, clientBytes] of edits) {
    const full = path.join(targetDir, rel);
    if (!owned.has(rel)) {
      // O kit deixou de ter o arquivo, e o time o alterou: fica.
      keptDiscontinued.push(rel);
      continue;
    }
    if (!fss.existsSync(full)) continue;
    const kitBytes = fss.readFileSync(full);
    if (kitBytes.equals(clientBytes)) continue;
    try {
      await fs.writeFile(`${full}${KIT_NEW_SUFFIX}`, kitBytes);
      await fs.writeFile(full, clientBytes);
      kitSha.set(rel, sha256(kitBytes));
      keptClientEdits.push(rel);
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao preservar a alteração do time em ${rel}:`, err);
    }
  }

  for (const [rel, sha] of Object.entries(lock?.files ?? {})) {
    if (owned.has(rel) || edits.has(rel)) continue;
    if (fileSha(targetDir, rel) !== sha) continue;
    try {
      await fs.rm(path.join(targetDir, rel), { force: true });
      removed.push(rel);
    } catch (err) {
      console.error(`[${BRAND.name}] falha ao remover ${rel}, que o kit deixou de ter:`, err);
    }
  }

  await writeKitLock(targetDir, harness, kitSha);

  const report: KitMigrationReport = { keptClientEdits: keptClientEdits.sort(), removed: removed.sort(), keptDiscontinued: keptDiscontinued.sort(), withoutPreviousLock: lock === null };
  for (const rel of report.keptClientEdits) console.warn(`[${BRAND.name}] migrateKit: ${rel} foi alterado pelo time e não foi sobrescrito; a versão nova do kit está em ${rel}${KIT_NEW_SUFFIX}`);
  for (const rel of report.removed) console.warn(`[${BRAND.name}] migrateKit: ${rel} saiu do kit e foi removido (estava como o kit instalou)`);
  for (const rel of report.keptDiscontinued) console.warn(`[${BRAND.name}] migrateKit: ${rel} saiu do kit, mas foi alterado pelo time e ficou`);
  return report;
}
