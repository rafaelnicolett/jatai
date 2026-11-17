/**
 * tree.ts — fotografia de uma árvore de arquivos, independente de SO.
 *
 * Cada entrada é uma linha compacta (diff de PR fica com uma linha por arquivo):
 *
 *   "dir"                                    diretório (vazio ou não)
 *   "file <modo> <bytes> <sha256> text"      arquivo UTF-8 válido, sem NUL
 *   "file <modo> <bytes> <sha256> binary"    qualquer outro arquivo
 *   "file <modo> kit-cli-bundle"             o CLI instalado é byte a byte o bundle do kit
 *   "file <modo> kit-mcp-bundle"             o servidor MCP instalado é byte a byte o do kit
 *   "symlink -> <alvo>"                      link simbólico
 *
 * - Paths POSIX relativos à raiz fotografada; diretórios terminam em "/".
 * - Ordem: comparação simples de string (code units), igual em todo SO.
 * - `<modo>` imita o git: só o bit de execução do dono importa (`100755` ou
 *   `100644`), para não depender de umask. No Windows o modo não é comparado.
 * - sha256 e tamanho são dos bytes **normalizados** (ver `normalize.ts`).
 *
 * O bundle do CLI (`.github/scripts/helyx-state.cjs`) é tratado à parte: o
 * comportamento dele é congelado pelo golden do CLI, e os bytes dele mudam a
 * cada rebuild de `src/cli/**`, mesmo num refactor puro. Aqui só se exige que
 * o arquivo instalado seja idêntico ao bundle do kit, e que o modo não mude.
 * O mesmo vale para o servidor MCP (`.github/scripts/helyx-mcp.cjs`, ADR-0025),
 * gerado de `src/mcp/**`, cujo comportamento é congelado pelos contratos MCP.
 */
import * as fs from "fs/promises";
import * as fss from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { normalize, normalizeRelPath, type NormalizeOptions } from "./normalize";
import { installedCliGoldenSuffix, installedMcpGoldenSuffix, kitCliBundlePath, kitMcpBundlePath } from "./paths";

export type GitMode = "100644" | "100755";

export type TreeEntry =
  | { readonly type: "dir" }
  | { readonly type: "symlink"; readonly target: string }
  | { readonly type: "file"; readonly mode: GitMode; readonly size: number; readonly sha256: string; readonly kind: "text" | "binary" }
  | { readonly type: "file"; readonly mode: GitMode; readonly special: KitBundle };

/** Bundles do kit que o golden compara com o arquivo do kit, e não por bytes congelados. */
export type KitBundle = "kit-cli-bundle" | "kit-mcp-bundle";

export interface TreeSnapshot {
  /** path → entrada, já ordenado. */
  readonly entries: Map<string, TreeEntry>;
  /** Bytes normalizados de cada arquivo comum (não inclui o bundle do CLI). */
  readonly contents: Map<string, Buffer>;
  /** sha256 normalizado SEM a regra de marca: base do relatório "mudou só a marca". */
  readonly preBrandSha: Map<string, string>;
  /** Visões legíveis de binários (gancho genérico; hoje sem uso). */
  readonly views: Map<string, string>;
}

export interface SnapshotOptions {
  readonly normalize: NormalizeOptions;
  /** sha256 cru do bundle do CLI esperado. Default: o de `kit/scripts/<marca>-state.cjs`. */
  readonly kitCliBundleSha?: string;
  /** Visão legível opcional para binários. */
  readonly view?: (relPath: string, bytes: Buffer) => Promise<string | undefined>;
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function isText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function gitMode(statMode: number): GitMode {
  return (statMode & 0o100) !== 0 ? "100755" : "100644";
}

let kitMcpShaCache: string | null = null;
export function kitMcpBundleSha(): string {
  if (kitMcpShaCache === null) {
    const bundle = kitMcpBundlePath();
    if (!fss.existsSync(bundle)) {
      throw new Error(`bundle do servidor MCP ausente em ${bundle}: rode \`npm run build:mcp\` antes dos goldens`);
    }
    kitMcpShaCache = sha256(fss.readFileSync(bundle));
  }
  return kitMcpShaCache;
}

let kitCliShaCache: string | null = null;
export function kitCliBundleSha(): string {
  if (kitCliShaCache === null) {
    const bundle = kitCliBundlePath();
    if (!fss.existsSync(bundle)) {
      throw new Error(`bundle do CLI ausente em ${bundle}: rode \`npm run build:cli\` antes dos goldens`);
    }
    kitCliShaCache = sha256(fss.readFileSync(bundle));
  }
  return kitCliShaCache;
}

async function walk(root: string, rel: string, out: Array<{ rel: string; full: string; dirent: fss.Dirent }>): Promise<void> {
  const dir = path.join(root, rel);
  const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const dirent of entries) {
    const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
    out.push({ rel: childRel, full: path.join(dir, dirent.name), dirent });
    if (dirent.isDirectory()) await walk(root, childRel, out);
  }
}

/** Fotografa `root` inteiro (a raiz em si não entra). */
export async function snapshotTree(root: string, opts: SnapshotOptions): Promise<TreeSnapshot> {
  const items: Array<{ rel: string; full: string; dirent: fss.Dirent }> = [];
  await walk(root, "", items);

  const entries = new Map<string, TreeEntry>();
  const contents = new Map<string, Buffer>();
  const preBrandSha = new Map<string, string>();
  const views = new Map<string, string>();
  const cliSuffix = installedCliGoldenSuffix();
  const mcpSuffix = installedMcpGoldenSuffix();
  const preBrandOpts: NormalizeOptions = { ...opts.normalize, brand: undefined };

  const put = (key: string, entry: TreeEntry, from: string): void => {
    if (entries.has(key)) throw new Error(`dois paths normalizam para o mesmo nome '${key}' (o último foi ${from})`);
    entries.set(key, entry);
  };

  for (const item of items) {
    const key = normalizeRelPath(item.rel, opts.normalize.brand);
    if (item.dirent.isSymbolicLink()) {
      put(key, { type: "symlink", target: normalizeRelPath(await fs.readlink(item.full), opts.normalize.brand) }, item.rel);
      continue;
    }
    if (item.dirent.isDirectory()) {
      put(`${key}/`, { type: "dir" }, item.rel);
      continue;
    }
    const st = await fs.stat(item.full);
    const raw = await fs.readFile(item.full);
    const mode = gitMode(st.mode);

    if (key === cliSuffix || key.endsWith(`/${cliSuffix}`)) {
      if (sha256(raw) === (opts.kitCliBundleSha ?? kitCliBundleSha())) {
        put(key, { type: "file", mode, special: "kit-cli-bundle" }, item.rel);
        continue;
      }
      // Diferente do bundle do kit: entra como arquivo comum e vai divergir do golden.
    }
    if ((key === mcpSuffix || key.endsWith(`/${mcpSuffix}`)) && sha256(raw) === kitMcpBundleSha()) {
      put(key, { type: "file", mode, special: "kit-mcp-bundle" }, item.rel);
      continue;
    }

    let bytes: Buffer;
    let kind: "text" | "binary";
    if (isText(raw)) {
      const textRaw = raw.toString("utf-8");
      bytes = Buffer.from(normalize(textRaw, opts.normalize), "utf-8");
      preBrandSha.set(key, sha256(Buffer.from(normalize(textRaw, preBrandOpts), "utf-8")));
      kind = "text";
    } else {
      bytes = raw;
      preBrandSha.set(key, sha256(raw));
      kind = "binary";
      const view = await opts.view?.(key, raw);
      if (view !== undefined) views.set(key, view);
    }
    contents.set(key, bytes);
    put(key, { type: "file", mode, size: bytes.length, sha256: sha256(bytes), kind }, item.rel);
  }

  const sorted = new Map([...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { entries: sorted, contents, preBrandSha, views };
}

export function entryToString(entry: TreeEntry): string {
  switch (entry.type) {
    case "dir":
      return "dir";
    case "symlink":
      return `symlink -> ${entry.target}`;
    case "file":
      return "special" in entry
        ? `file ${entry.mode} ${entry.special}`
        : `file ${entry.mode} ${entry.size} ${entry.sha256} ${entry.kind}`;
  }
}

export function parseEntry(value: string): TreeEntry {
  if (value === "dir") return { type: "dir" };
  if (value.startsWith("symlink -> ")) return { type: "symlink", target: value.slice("symlink -> ".length) };
  const parts = value.split(" ");
  const mode = parts[1];
  if (parts[0] !== "file" || (mode !== "100644" && mode !== "100755")) throw new Error(`entrada de golden inválida: '${value}'`);
  if (parts.length === 3 && (parts[2] === "kit-cli-bundle" || parts[2] === "kit-mcp-bundle")) return { type: "file", mode, special: parts[2] };
  const [, , size, sha, kind] = parts;
  if (parts.length !== 5 || (kind !== "text" && kind !== "binary") || !size || !sha) throw new Error(`entrada de golden inválida: '${value}'`);
  return { type: "file", mode, size: Number(size), sha256: sha, kind };
}

/** Compara duas entradas; no Windows o bit de execução não existe e não é comparado. */
export function sameEntry(a: TreeEntry, b: TreeEntry): boolean {
  if (process.platform === "win32" && a.type === "file" && b.type === "file") {
    return entryToString({ ...a, mode: "100644" }) === entryToString({ ...b, mode: "100644" });
  }
  return entryToString(a) === entryToString(b);
}

/**
 * Nomes que ferramentas de agente ou o git interpretam mesmo dentro de
 * subpastas: `.gitignore`/`.gitattributes` mudariam o que o git versiona nos
 * goldens; `CLAUDE.md`/`AGENTS.md` aninhados viram instrução para agentes que
 * trabalham neste repo; `.claude/skills` aninhado pode ser descoberto como
 * skill. Na cópia legível esses segmentos ganham o sufixo `.golden`.
 */
const ESCAPED_SEGMENTS = new Set([".claude", "CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules", ".gitignore", ".gitattributes", ".gitmodules", ".git"]);
export const ESCAPE_SUFFIX = ".golden";

export function encodeGoldenPath(relPath: string): string {
  return relPath
    .split("/")
    .map((seg) => (ESCAPED_SEGMENTS.has(seg) || seg.endsWith(ESCAPE_SUFFIX) ? `${seg}${ESCAPE_SUFFIX}` : seg))
    .join("/");
}

export function decodeGoldenPath(encoded: string): string {
  return encoded
    .split("/")
    .map((seg) => (seg.endsWith(ESCAPE_SUFFIX) ? seg.slice(0, -ESCAPE_SUFFIX.length) : seg))
    .join("/");
}
