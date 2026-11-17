/**
 * sandbox.ts — toda escrita dos goldens acontece em pastas de `os.tmpdir()`.
 *
 * `GOLDEN_KEEP_SANDBOX=1` preserva as pastas para inspeção manual depois de
 * uma falha; o caminho de cada uma aparece no relatório.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const created: string[] = [];

export function makeSandbox(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `golden-${prefix}-`));
  created.push(dir);
  return dir;
}

export function cleanupSandboxes(): void {
  if (process.env.GOLDEN_KEEP_SANDBOX === "1") return;
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

/** Escreve um mapa `path relativo → conteúdo` (pastas criadas sob demanda). */
export function writeFixture(root: string, files: Readonly<Record<string, string | Buffer>>): void {
  for (const rel of Object.keys(files).sort()) {
    const target = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, files[rel]!);
  }
}
