/**
 * golden-store.ts — leitura, comparação e (só com `UPDATE_GOLDEN=1`) escrita
 * dos goldens.
 *
 * Layout de um grupo (ex.: `__golden__/generator/`):
 *
 *   <caso>/tree.json          entrada, resultado, chamadas e a árvore (ou o delta sobre a base)
 *   <caso>/files/<path>       cópia normalizada e legível de arquivos de texto (≤ 64 KiB)
 *   <caso>/views/<path>.txt   visão legível de um binário (gancho `view` do snapshot)
 *
 * - **Base + delta.** Um caso pode declarar `base` (outro caso do grupo, que
 *   vem antes na ordem canônica). Aí `entries` guarda só o que difere da
 *   base, com `"absent"` para o que a base tem e o caso não. Uma mudança no
 *   kit aparece em 2 ou 4 goldens de base, e não em 50.
 * - **Cópia legível uma vez só.** Cada conteúdo (sha256) é copiado uma única
 *   vez, no primeiro caso da ordem canônica que o tem, no path em que ele
 *   aparece ali. A comparação nunca depende dessas cópias (só dos sha256);
 *   elas servem para o diff do PR e para o relatório de falha.
 * - **Escrita deliberada.** Só com `UPDATE_GOLDEN=1`, nunca com `CI` definido,
 *   e só quando o arquivo de teste inteiro rodou (senão apagaria casos).
 */
import * as fs from "fs";
import * as path from "path";
import { decodeGoldenPath, encodeGoldenPath, entryToString, parseEntry, sameEntry, sha256, type TreeEntry, type TreeSnapshot } from "./tree";

export const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

/** Limite da cópia legível: arquivos de texto maiores ficam só com sha256. */
export const READABLE_COPY_MAX_BYTES = 64 * 1024;

/**
 * Arquivos que nunca ganham cópia legível, mesmo sendo texto pequeno: conteúdo
 * de terceiro que não pode ser duplicado nos goldens. O sha256 deles continua
 * congelado na árvore. Hoje a lista está vazia: o único caso, um tema pago de
 * terceiro, saiu do kit na F2.3.
 */
const NO_READABLE_COPY: readonly RegExp[] = [];

export function assertUpdateAllowed(): void {
  if (UPDATE_GOLDEN && process.env.CI) {
    throw new Error("UPDATE_GOLDEN=1 com CI definido: goldens só são regravados localmente, com revisão do diff");
  }
}

const SCHEMA = 1;

function sortedKeys<T>(record: Record<string, T>): string[] {
  return Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readableEligible(relPath: string, entry: TreeEntry): entry is Extract<TreeEntry, { sha256: string }> {
  return (
    entry.type === "file" &&
    "sha256" in entry &&
    entry.kind === "text" &&
    entry.size <= READABLE_COPY_MAX_BYTES &&
    !NO_READABLE_COPY.some((re) => re.test(relPath))
  );
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

function writeFileMkdir(file: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function listFilesRecursive(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) out.push(...listFilesRecursive(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Primeira divergência entre dois textos, com contexto, para o relatório de falha. */
export function firstDifference(expected: string, actual: string, context = 2): string {
  const e = expected.split("\n");
  const a = actual.split("\n");
  let i = 0;
  while (i < e.length && i < a.length && e[i] === a[i]) i++;
  if (i === e.length && i === a.length) return "      (textos idênticos)";
  const clip = (s: string | undefined): string => (s === undefined ? "∅ (fim do arquivo)" : JSON.stringify(s.length > 160 ? `${s.slice(0, 160)}…` : s));
  const lines = [`      primeira divergência na linha ${i + 1}:`];
  for (let k = Math.max(0, i - context); k < i; k++) lines.push(`        ${k + 1}  ${clip(e[k])}`);
  lines.push(`      - golden ${clip(e[i])}`);
  lines.push(`      + atual  ${clip(a[i])}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Grupo de casos com árvore (gerador)
// ---------------------------------------------------------------------------

export interface TreeCaseRecord {
  readonly id: string;
  readonly base: string | null;
  readonly input: unknown;
  readonly outcome: unknown;
  readonly calls: unknown;
  readonly snapshot: TreeSnapshot;
}

interface StoredTreeCase {
  readonly schema: number;
  readonly case: string;
  readonly base: string | null;
  readonly input: unknown;
  readonly outcome: unknown;
  readonly calls: unknown;
  readonly entries: Record<string, string>;
}

export interface CaseComparison {
  readonly differences: string[];
  /** Paths que só batem com o golden por causa da normalização de marca. */
  readonly brandOnly: string[];
}

export class TreeGoldenGroup {
  private readonly _records = new Map<string, TreeCaseRecord>();
  private _stored: Map<string, StoredTreeCase | null> | null = null;
  private _index: { files: Map<string, string>; views: Map<string, string> } | null = null;

  constructor(
    readonly dir: string,
    /** Ordem canônica: bases antes dos casos que dependem delas. */
    readonly caseOrder: readonly string[]
  ) {
    const seen = new Set<string>();
    for (const id of caseOrder) {
      if (seen.has(id)) throw new Error(`caso duplicado na ordem canônica: ${id}`);
      seen.add(id);
    }
  }

  // ---- leitura --------------------------------------------------------

  loadCase(id: string): StoredTreeCase | null {
    if (this._stored === null) this._stored = new Map();
    if (!this._stored.has(id)) {
      const file = path.join(this.dir, id, "tree.json");
      this._stored.set(id, fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as StoredTreeCase) : null);
    }
    return this._stored.get(id) ?? null;
  }

  /** Árvore completa esperada de um caso (resolve base + delta). */
  expectedEntries(id: string, depth = 0): Map<string, string> {
    if (depth > 8) throw new Error(`cadeia de base longa demais em ${id}`);
    const stored = this.loadCase(id);
    if (!stored) throw new Error(`golden ausente: ${id}`);
    const full = stored.base ? new Map(this.expectedEntries(stored.base, depth + 1)) : new Map<string, string>();
    for (const key of sortedKeys(stored.entries)) {
      const value = stored.entries[key]!;
      if (value === "absent") full.delete(key);
      else full.set(key, value);
    }
    return new Map([...full.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** sha256 → texto, de todas as cópias legíveis e visões do grupo. */
  private _contentIndex(): { files: Map<string, string>; views: Map<string, string> } {
    if (this._index) return this._index;
    const files = new Map<string, string>();
    const views = new Map<string, string>();
    for (const id of this.caseOrder) {
      for (const rel of listFilesRecursive(path.join(this.dir, id, "files"))) {
        const bytes = fs.readFileSync(path.join(this.dir, id, "files", rel));
        files.set(sha256(bytes), bytes.toString("utf-8"));
      }
      for (const rel of listFilesRecursive(path.join(this.dir, id, "views"))) {
        const text = fs.readFileSync(path.join(this.dir, id, "views", rel), "utf-8");
        const sha = /^# sha256 ([0-9a-f]{64})/.exec(text)?.[1];
        if (sha) views.set(sha, text);
      }
    }
    this._index = { files, views };
    return this._index;
  }

  compare(record: TreeCaseRecord): CaseComparison {
    const stored = this.loadCase(record.id);
    if (!stored) {
      return { differences: [`golden ausente para '${record.id}': rode \`UPDATE_GOLDEN=1 npx vitest run --no-cache tests/golden\` e revise o diff`], brandOnly: [] };
    }
    const differences: string[] = [];
    const meta: Array<[string, unknown, unknown]> = [
      ["base", stored.base, record.base],
      ["input", stored.input, record.input],
      ["outcome", stored.outcome, record.outcome],
      ["calls", stored.calls, record.calls],
    ];
    for (const [label, expected, actual] of meta) {
      const e = JSON.stringify(expected ?? null);
      const a = JSON.stringify(actual ?? null);
      if (e !== a) differences.push(`~ ${label}: golden ${e} → atual ${a}`);
    }

    const expected = this.expectedEntries(record.id);
    const actual = record.snapshot.entries;
    const index = this._contentIndex();
    const brandOnly: string[] = [];
    const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const p of paths) {
      const exp = expected.get(p);
      const act = actual.get(p);
      if (exp === undefined && act) {
        differences.push(`+ ${p} (só na saída atual): ${entryToString(act)}`);
        continue;
      }
      if (exp !== undefined && !act) {
        differences.push(`- ${p} (só no golden): ${exp}`);
        continue;
      }
      if (exp === undefined || !act) continue;
      const expEntry = parseEntry(exp);
      if (!sameEntry(expEntry, act)) {
        let detail = `~ ${p}: golden ${exp} → atual ${entryToString(act)}`;
        if (expEntry.type === "file" && "sha256" in expEntry && act.type === "file" && "sha256" in act) {
          const goldenText = index.files.get(expEntry.sha256);
          const actualBytes = record.snapshot.contents.get(p);
          if (goldenText !== undefined && actualBytes && act.kind === "text") {
            detail += `\n${firstDifference(goldenText, actualBytes.toString("utf-8"))}`;
          }
          const goldenView = index.views.get(expEntry.sha256);
          const actualView = record.snapshot.views.get(p);
          if (goldenView !== undefined && actualView !== undefined) {
            const same = goldenView.split("\n").slice(1).join("\n") === actualView;
            detail += same ? "\n      (bytes mudaram, mas a visão lógica é a mesma)" : `\n${firstDifference(goldenView.split("\n").slice(1).join("\n"), actualView)}`;
          }
        }
        differences.push(detail);
        continue;
      }
      if (act.type === "file" && "sha256" in act) {
        const pre = record.snapshot.preBrandSha.get(p);
        if (pre !== undefined && pre !== act.sha256) brandOnly.push(p);
      }
    }
    return { differences, brandOnly };
  }

  /** Confere o próprio golden: casos órfãos, cópias faltando/sobrando/adulteradas. */
  integrityProblems(): string[] {
    const problems: string[] = [];
    if (!fs.existsSync(this.dir)) return [`grupo de golden ausente: ${this.dir}`];
    const known = new Set(this.caseOrder);
    for (const dirent of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (dirent.isDirectory() && !known.has(dirent.name)) problems.push(`caso órfão no golden (não existe mais no teste): ${dirent.name}`);
    }
    const ownedFiles = new Set<string>();
    const ownedViews = new Set<string>();
    const expectedFiles = new Map<string, string>(); // "<caso>/<enc>" → sha
    const expectedViews = new Map<string, string>();
    for (const id of this.caseOrder) {
      const stored = this.loadCase(id);
      if (!stored) {
        problems.push(`golden ausente: ${id}`);
        continue;
      }
      if (stored.schema !== SCHEMA) problems.push(`${id}: schema ${stored.schema}, esperado ${SCHEMA}`);
      if (stored.base && this.caseOrder.indexOf(stored.base) > this.caseOrder.indexOf(id)) {
        problems.push(`${id}: base '${stored.base}' vem depois dele na ordem canônica`);
      }
      for (const [p, value] of this.expectedEntries(id)) {
        const entry = parseEntry(value);
        if (entry.type !== "file" || !("sha256" in entry)) continue;
        if (readableEligible(p, entry) && !ownedFiles.has(entry.sha256)) {
          ownedFiles.add(entry.sha256);
          expectedFiles.set(`${id}/files/${encodeGoldenPath(p)}`, entry.sha256);
        }
        if (entry.kind === "binary" && fs.existsSync(path.join(this.dir, id, "views", `${encodeGoldenPath(p)}.txt`)) && !ownedViews.has(entry.sha256)) {
          ownedViews.add(entry.sha256);
          expectedViews.set(`${id}/views/${encodeGoldenPath(p)}.txt`, entry.sha256);
        }
      }
    }
    for (const id of this.caseOrder) {
      for (const sub of ["files", "views"] as const) {
        for (const rel of listFilesRecursive(path.join(this.dir, id, sub))) {
          const key = `${id}/${sub}/${rel}`;
          const want = sub === "files" ? expectedFiles.get(key) : expectedViews.get(key);
          if (want === undefined) {
            problems.push(`cópia legível sem dono (sobrando): ${key}`);
            continue;
          }
          const bytes = fs.readFileSync(path.join(this.dir, id, sub, rel));
          const got = sub === "files" ? sha256(bytes) : /^# sha256 ([0-9a-f]{64})/.exec(bytes.toString("utf-8"))?.[1];
          if (got !== want) problems.push(`cópia legível adulterada: ${key}`);
        }
      }
    }
    for (const key of expectedFiles.keys()) {
      if (!fs.existsSync(path.join(this.dir, key))) problems.push(`cópia legível faltando: ${key}`);
    }
    return problems;
  }

  // ---- escrita (UPDATE_GOLDEN=1) --------------------------------------

  record(rec: TreeCaseRecord): void {
    if (this._records.has(rec.id)) throw new Error(`caso gravado duas vezes: ${rec.id}`);
    if (!this.caseOrder.includes(rec.id)) throw new Error(`caso fora da ordem canônica: ${rec.id}`);
    this._records.set(rec.id, rec);
  }

  writeAll(): void {
    assertUpdateAllowed();
    const missing = this.caseOrder.filter((id) => !this._records.has(id));
    if (missing.length > 0) {
      throw new Error(`UPDATE_GOLDEN exige rodar o arquivo inteiro; faltaram ${missing.length} caso(s): ${missing.slice(0, 5).join(", ")}…`);
    }
    const staging = `${this.dir}.staging-${process.pid}`;
    rmrf(staging);
    const fullById = new Map<string, Map<string, string>>();
    const ownedFiles = new Set<string>();
    const ownedViews = new Set<string>();
    for (const id of this.caseOrder) {
      const rec = this._records.get(id)!;
      const full = new Map([...rec.snapshot.entries.entries()].map(([p, e]) => [p, entryToString(e)] as const));
      fullById.set(id, full);
      const entries: Record<string, string> = {};
      if (rec.base) {
        const base = fullById.get(rec.base);
        if (!base) throw new Error(`${id}: base '${rec.base}' precisa vir antes na ordem canônica`);
        for (const [p, v] of full) if (base.get(p) !== v) entries[p] = v;
        for (const p of base.keys()) if (!full.has(p)) entries[p] = "absent";
      } else {
        for (const [p, v] of full) entries[p] = v;
      }
      const sortedEntries: Record<string, string> = {};
      for (const k of sortedKeys(entries)) sortedEntries[k] = entries[k]!;
      const stored: StoredTreeCase = {
        schema: SCHEMA,
        case: id,
        base: rec.base,
        input: rec.input,
        outcome: rec.outcome,
        calls: rec.calls,
        entries: sortedEntries,
      };
      writeFileMkdir(path.join(staging, id, "tree.json"), stableJson(stored));
      for (const [p, entry] of rec.snapshot.entries) {
        if (entry.type !== "file" || !("sha256" in entry)) continue;
        if (readableEligible(p, entry) && !ownedFiles.has(entry.sha256)) {
          ownedFiles.add(entry.sha256);
          writeFileMkdir(path.join(staging, id, "files", ...encodeGoldenPath(p).split("/")), rec.snapshot.contents.get(p)!);
        }
        const view = rec.snapshot.views.get(p);
        if (view !== undefined && !ownedViews.has(entry.sha256)) {
          ownedViews.add(entry.sha256);
          writeFileMkdir(path.join(staging, id, "views", ...`${encodeGoldenPath(p)}.txt`.split("/")), `# sha256 ${entry.sha256} · visão legível de ${p}\n${view}`);
        }
      }
    }
    rmrf(this.dir);
    fs.mkdirSync(path.dirname(this.dir), { recursive: true });
    fs.renameSync(staging, this.dir);
  }
}

// ---------------------------------------------------------------------------
// Grupo de cenários do CLI (sem base, sem dedupe: tudo é pequeno)
// ---------------------------------------------------------------------------

export interface CliStepRecord {
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly exit: number | string;
  /** Objeto quando o stdout é exatamente `JSON.stringify(obj) + "\n"`; senão o texto cru normalizado. */
  readonly stdout: unknown;
  readonly stderr: string;
}

export interface CliScenarioRecord {
  readonly id: string;
  readonly steps: readonly CliStepRecord[];
  readonly snapshot: TreeSnapshot;
}

interface StoredCliScenario {
  readonly schema: number;
  readonly scenario: string;
  readonly steps: readonly CliStepRecord[];
  readonly entries: Record<string, string>;
}

/** Representação legível e reversível do stdout (ver `CliStepRecord.stdout`). */
export function encodeStdout(stdout: string): unknown {
  if (stdout.endsWith("\n") && !stdout.slice(0, -1).includes("\n")) {
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (JSON.stringify(parsed) + "\n" === stdout && typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      /* não é JSON: fica o texto */
    }
  }
  return stdout;
}

export class CliGoldenGroup {
  private readonly _records = new Map<string, CliScenarioRecord>();

  constructor(
    readonly dir: string,
    readonly scenarioOrder: readonly string[]
  ) {}

  private _load(id: string): StoredCliScenario | null {
    const file = path.join(this.dir, id, "result.json");
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as StoredCliScenario) : null;
  }

  compare(rec: CliScenarioRecord): string[] {
    const stored = this._load(rec.id);
    if (!stored) return [`golden ausente para '${rec.id}': rode \`UPDATE_GOLDEN=1 npx vitest run --no-cache tests/golden\` e revise o diff`];
    const differences: string[] = [];
    const max = Math.max(stored.steps.length, rec.steps.length);
    for (let i = 0; i < max; i++) {
      const e = stored.steps[i];
      const a = rec.steps[i];
      if (!e || !a) {
        differences.push(`passo ${i + 1}: ${e ? "só no golden" : "só na execução atual"}`);
        continue;
      }
      for (const field of ["cwd", "argv", "exit", "stdout", "stderr"] as const) {
        const ev = JSON.stringify(e[field]);
        const av = JSON.stringify(a[field]);
        if (ev !== av) differences.push(`passo ${i + 1} (${a.argv.join(" ")}): ${field}\n      - golden ${ev}\n      + atual  ${av}`);
      }
    }
    const actual = rec.snapshot.entries;
    const keys = [...new Set([...Object.keys(stored.entries), ...actual.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const p of keys) {
      const exp = stored.entries[p];
      const act = actual.get(p);
      if (exp === undefined && act) differences.push(`+ ${p} (só na execução atual): ${entryToString(act)}`);
      else if (exp !== undefined && !act) differences.push(`- ${p} (só no golden): ${exp}`);
      else if (exp !== undefined && act && !sameEntry(parseEntry(exp), act)) {
        let detail = `~ ${p}: golden ${exp} → atual ${entryToString(act)}`;
        const goldenFile = path.join(this.dir, rec.id, "files", ...encodeGoldenPath(p).split("/"));
        const actualBytes = rec.snapshot.contents.get(p);
        if (fs.existsSync(goldenFile) && actualBytes) detail += `\n${firstDifference(fs.readFileSync(goldenFile, "utf-8"), actualBytes.toString("utf-8"))}`;
        differences.push(detail);
      }
    }
    return differences;
  }

  integrityProblems(): string[] {
    const problems: string[] = [];
    if (!fs.existsSync(this.dir)) return [`grupo de golden ausente: ${this.dir}`];
    const known = new Set(this.scenarioOrder);
    for (const dirent of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (dirent.isDirectory() && !known.has(dirent.name)) problems.push(`cenário órfão no golden: ${dirent.name}`);
    }
    for (const id of this.scenarioOrder) {
      const stored = this._load(id);
      if (!stored) {
        problems.push(`golden ausente: ${id}`);
        continue;
      }
      const wanted = new Map<string, string>();
      for (const [p, value] of Object.entries(stored.entries)) {
        const entry = parseEntry(value);
        if (readableEligible(p, entry)) wanted.set(encodeGoldenPath(p), entry.sha256);
      }
      const present = listFilesRecursive(path.join(this.dir, id, "files"));
      for (const rel of present) {
        const want = wanted.get(rel);
        if (want === undefined) problems.push(`${id}: cópia sem entrada correspondente: files/${rel} (${decodeGoldenPath(rel)})`);
        else if (sha256(fs.readFileSync(path.join(this.dir, id, "files", rel))) !== want) problems.push(`${id}: cópia adulterada: files/${rel}`);
      }
      for (const rel of wanted.keys()) if (!present.includes(rel)) problems.push(`${id}: cópia faltando: files/${rel}`);
    }
    return problems;
  }

  record(rec: CliScenarioRecord): void {
    if (this._records.has(rec.id)) throw new Error(`cenário gravado duas vezes: ${rec.id}`);
    this._records.set(rec.id, rec);
  }

  writeAll(): void {
    assertUpdateAllowed();
    const missing = this.scenarioOrder.filter((id) => !this._records.has(id));
    if (missing.length > 0) throw new Error(`UPDATE_GOLDEN exige rodar o arquivo inteiro; faltaram: ${missing.slice(0, 5).join(", ")}…`);
    const staging = `${this.dir}.staging-${process.pid}`;
    rmrf(staging);
    for (const id of this.scenarioOrder) {
      const rec = this._records.get(id)!;
      const entries: Record<string, string> = {};
      for (const [p, e] of rec.snapshot.entries) entries[p] = entryToString(e);
      const stored: StoredCliScenario = { schema: SCHEMA, scenario: id, steps: rec.steps, entries };
      writeFileMkdir(path.join(staging, id, "result.json"), stableJson(stored));
      for (const [p, entry] of rec.snapshot.entries) {
        if (readableEligible(p, entry)) {
          writeFileMkdir(path.join(staging, id, "files", ...encodeGoldenPath(p).split("/")), rec.snapshot.contents.get(p)!);
        }
      }
    }
    rmrf(this.dir);
    fs.mkdirSync(path.dirname(this.dir), { recursive: true });
    fs.renameSync(staging, this.dir);
  }
}
