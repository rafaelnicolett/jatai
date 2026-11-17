/**
 * artifactFiles.ts — os arquivos que o envio de artefatos pode oferecer
 * (F2.5, ADR-0023 §4). Só `.github/artifacts/**` que a pessoa marcar; nunca o
 * token do State Service (`.state-service/`), os eventos de atividade
 * (`runs/`) nem temporários — a regra é pura (`isSendableArtifact`) e esta
 * casca só varre o disco.
 */

import * as fs from "fs";
import * as path from "path";
import { isSendableArtifact } from "../../core/extension-api/api-contract.pure";
import { readActiveInitiativeId } from "../../core/contracts/initiatives-contract.pure";

const ARTIFACTS = [".github", "artifacts"] as const;

/** Caminhos relativos à raiz, ordenados, que podem ser oferecidos para envio. */
export function listSendableArtifacts(root: string): string[] {
  const base = path.join(root, ...ARTIFACTS);
  const out: string[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (isSendableArtifact(rel)) out.push(rel);
    }
  };

  walk(base);
  return out.sort();
}

/** Conteúdo de um artefato selecionado; `null` se sumiu ou está fora da raiz. */
export function readArtifact(root: string, relPath: string): string | null {
  if (!isSendableArtifact(relPath)) return null;
  const abs = path.resolve(root, relPath);
  const base = path.resolve(root, ...ARTIFACTS);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) return null;
  try {
    return fs.readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}

/** A iniciativa ativa do registro, para o `RemoteSyncInput`; `null` quando não há. */
export function readActiveInitiativeIdSafe(root: string): string | null {
  try {
    return readActiveInitiativeId(fs.readFileSync(path.join(root, ...ARTIFACTS, "initiatives.yaml"), "utf-8"));
  } catch {
    return null;
  }
}
