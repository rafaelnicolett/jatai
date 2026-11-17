/**
 * copy.ts
 *
 * Utilitários de arquivo do gerador (F3.4, passo 1). Só `fs`/`path`: nada
 * aqui conhece marca, harness ou edição do kit.
 *
 * A cópia de arquivo passa sempre por `copyKitFile`, que renderiza os
 * placeholders `{{brand.*}}` do kit e copia byte a byte o que não tem
 * placeholder (ver `kit-render.ts`).
 */

import * as path from "path";
import * as fs from "fs/promises";
import { constants as fsConstants } from "fs";
import { copyKitFile } from "../kit-render";

export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await copyKitFile(srcPath, destPath);
      }
    })
  );
}

/** copyDir that silently skips when src doesn't exist (dev/fallback mode). */
export async function copyDirIfExists(src: string, dest: string): Promise<void> {
  try {
    await fs.access(src);
  } catch {
    return; // templates/ not bundled yet — skip gracefully
  }
  await copyDir(src, dest);
}

/**
 * Copia de `src` para `dest` só o que ainda não existe em `dest`: arquivo ou
 * pasta existente nunca é sobrescrito nem apagado, e link simbólico não é
 * seguido. `skipTop` são nomes do primeiro nível que não são copiados.
 */
export async function copyMissing(src: string, dest: string, skipTop: ReadonlySet<string> = new Set()): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (skipTop.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    const existing = await fs.lstat(to).catch(() => null);
    if (entry.isDirectory()) {
      if (!existing || existing.isDirectory()) await copyMissing(from, to);
    } else if (!existing) {
      await fs.copyFile(from, to, fsConstants.COPYFILE_EXCL);
    }
  }
}

/** fs.copyFile that silently skips when src doesn't exist (dev/fallback mode). */
export async function copyFileIfExists(src: string, dest: string): Promise<void> {
  try {
    await fs.access(src);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await copyKitFile(src, dest);
  } catch {
    // source not bundled yet — skip gracefully
  }
}

/** Recursively collects files matching an extension under a directory. */
export async function walkFilesByExt(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await walkFilesByExt(full, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch { /* ignore inaccessible dirs */ }
  return results;
}

/**
 * Move `src` para `dest`: rename quando dá (mesmo dispositivo), senão cópia
 * profunda seguida da remoção da origem.
 */
export async function atomicMove(src: string, dest: string): Promise<void> {
  // Ensure destination parent exists
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // Try rename first (fast path — works only on same device)
  try {
    await fs.rename(src, dest);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EXDEV = cross-device (Linux/macOS), EPERM = Windows cross-drive or dest exists
    if (code !== "EXDEV" && code !== "EPERM" && code !== "ENOTEMPTY") throw err;
  }
  // Fallback: deep copy then remove source
  await copyDir(src, dest);
  await fs.rm(src, { recursive: true, force: true }).catch(() => undefined);
}
