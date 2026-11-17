import * as path from "path";

/**
 * Destino de uma entrada do zip de template dentro de `rootDir`, ou `null`
 * quando a entrada sairia dele (zip-slip, A16a / L12 / D27).
 *
 * Não depende da sanitização do JSZip, que só resolve `..` separado por `/`.
 * Recusa, em qualquer sistema operacional (o mesmo zip serve aos três):
 * contrabarra (separador no Windows), caminho absoluto, letra de drive, NUL e
 * segmentos `.`/`..` (inclusive os que nascem do corte do sufixo `.tmpl`).
 * No fim confere o containment do caminho resolvido.
 */
export function zipEntryDestination(rootDir: string, entryName: string): string | null {
  if (entryName === "" || entryName.includes("\\") || entryName.includes("\0")) return null;
  if (entryName.startsWith("/") || /^[A-Za-z]:/.test(entryName)) return null;
  const segments = entryName.split("/").filter((s) => s !== "");
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) return null;

  const root = path.resolve(rootDir);
  const dest = path.resolve(root, ...segments);
  const rel = path.relative(root, dest);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return dest;
}
