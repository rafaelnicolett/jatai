/**
 * workspace-fixture.ts — workspaces SINTÉTICOS em diretório temporário do SO
 * + normalização determinística para golden (F0.4, lane B).
 *
 * Regras da F0.4 que este módulo garante:
 * - nada é escrito fora de `os.tmpdir()` (cada fixture é um `mkdtemp`);
 * - nenhum nome de cliente/empresa/dado real: os ids são inventados
 *   (`loja-demo`, `pedidos-api`, `catalogo-web`…);
 * - golden não depende de máquina: o caminho temporário vira `<ROOT>`, e
 *   carimbos de tempo gerados DURANTE o teste viram `<agora>` (os das
 *   fixtures, todos de 2025, ficam como estão — fazem parte do contrato).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const created: string[] = [];

/** `mkdtemp` sob o tmp do SO; `cleanupWorkspaces()` apaga todos no `afterAll`. */
export function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jatai-f04-${prefix}-`));
  created.push(dir);
  return dir;
}

export function cleanupWorkspaces(): void {
  while (created.length > 0) {
    const dir = created.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // diretório temporário — o SO limpa se algo segurar um handle
    }
  }
}

/** Escreve `files` (path relativo → conteúdo) sob `root`, criando as pastas. */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }
}

/** Cria um workspace temporário com os arquivos dados. */
export function makeWorkspace(prefix: string, files: Record<string, string> = {}): string {
  const root = makeTempDir(prefix);
  writeFiles(root, files);
  return root;
}

/** Lista recursiva (POSIX, ordenada) de tudo que existe sob `root` — pastas terminam em `/`. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        walk(full);
      } else {
        out.push(rel);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

export interface Normalizer {
  (value: unknown): unknown;
  text(value: string): string;
}

/**
 * Normalizador de golden: troca `roots` (e o `realpath` deles — no macOS
 * `/var/...` vira `/private/var/...`) por `<ROOT>`/`<ROOT2>`…, e carimbos ISO
 * >= `since` (gerados pelo próprio teste) por `<agora>`. Campos listados em
 * `volatileKeys` (ex.: `token`, `pid`, `port`) viram `<chave>`.
 */
export function makeNormalizer(opts: { roots: string[]; since: Date; volatileKeys?: string[] }): Normalizer {
  const pairs: Array<[string, string]> = [];
  opts.roots.forEach((root, i) => {
    const label = i === 0 ? "<ROOT>" : `<ROOT${i + 1}>`;
    const variants = new Set([root]);
    try {
      variants.add(fs.realpathSync(root));
    } catch {
      // raiz já removida — só o caminho literal
    }
    for (const v of variants) pairs.push([v, label]);
  });
  // mais longo primeiro: `/private/var/x` antes de `/var/x`
  pairs.sort((a, b) => b[0].length - a[0].length);
  const sinceMs = opts.since.getTime() - 60_000;
  const volatile = new Set(opts.volatileKeys ?? []);

  // o basename aleatório do mkdtemp também vaza sozinho (ex.: vira `projectName`)
  const basenames: Array<[string, string]> = opts.roots.map((root, i) => [path.basename(root), `<basename ${i === 0 ? "ROOT" : `ROOT${i + 1}`}>`]);

  const text = (s: string): string => {
    let out = s;
    for (const [from, to] of pairs) out = out.split(from).join(to);
    for (const [from, to] of basenames) if (from.startsWith("jatai-f04-")) out = out.split(from).join(to);
    out = out.replace(ISO_RE, (iso) => (Date.parse(iso) >= sinceMs ? "<agora>" : iso));
    return out;
  };

  const walk = (value: unknown, key?: string): unknown => {
    if (key !== undefined && volatile.has(key)) return `<${key}>`;
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, k);
      return out;
    }
    return value;
  };

  const normalizer = ((value: unknown) => walk(value)) as Normalizer;
  normalizer.text = text;
  return normalizer;
}
