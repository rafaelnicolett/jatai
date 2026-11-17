import * as fs from "fs";
import * as path from "path";

/**
 * Caminho absoluto de `relPath` dentro de `root`, ou `null` quando ele sairia
 * do workspace (path traversal, A16b / L12 / D28).
 *
 * `relPath` vem de fora do host (webview do Cockpit, botões do chat), então
 * precisa ser string relativa, sem NUL, que resolva dentro de `root` no nível
 * do texto e, quando existe em disco, também depois de seguir symlinks
 * (`realpath`). Devolve o caminho lexical, não o real. A comparação usa
 * `path.relative`, que no Windows já trata `\`, letra de drive e caixa.
 */
export function resolveInsideWorkspace(root: string, relPath: unknown): string | null {
  if (typeof relPath !== "string" || relPath === "" || relPath.includes("\0")) return null;
  if (path.isAbsolute(relPath)) return null;
  const full = path.resolve(root, relPath);
  if (!isInside(path.resolve(root), full)) return null;
  if (!fs.existsSync(full)) return full;
  try {
    return isInside(fs.realpathSync(root), fs.realpathSync(full)) ? full : null;
  } catch {
    return null;
  }
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
