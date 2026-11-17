/**
 * artifact-watch.pure.ts — o núcleo puro do observador de artefatos (F5.2,
 * contrato agent-activity §4, "fallback universal" do Copilot).
 *
 * No Copilot não há hook de agente. O que denuncia atividade é a escrita em
 * `.github/artifacts/**`. O observador (`src/state/runs/ArtifactWatcher.ts`)
 * recebe cada mudança de arquivo de uma porta `FileWatcher`, e estas funções
 * decidem, sem I/O, se a mudança vira evento e qual:
 *
 * - fora: `runs/` (os próprios eventos, senão o observador se alimentaria),
 *   `.state-service/` (descoberta do servidor), arquivos ocultos (os
 *   temporários do `atomicWrite`, `.<arq>.tmp-<pid>-<hex>`), `.lock` e
 *   restos de editor;
 * - dentro: `artifact-written` com `harness: "watcher"` e o caminho relativo
 *   à raiz do workspace. Nunca conteúdo.
 */
import type { RunEvent } from "./run-events-contract.pure";

/** O que o observador vigia, relativo à raiz do workspace. */
export const ARTIFACTS_PATH = [".github", "artifacts"] as const;
export const ARTIFACTS_REL = ARTIFACTS_PATH.join("/");
/** O glob da porta de observação, relativo à pasta acima: tudo, em qualquer profundidade. */
export const ARTIFACT_WATCH_GLOB = "**/*";

/** Espera sem nova gravação do mesmo arquivo antes de emitir (contrato §4). */
export const ARTIFACT_WATCH_DEBOUNCE_MS = 500;

/** `run_id` dos eventos do observador: não há um "run" de agente visível por trás deles. */
export const ARTIFACT_WATCH_RUN_ID = "artifact-watcher";

/** Subpastas de `.github/artifacts/` que o observador ignora. */
const IGNORED_DIRS = ["runs", ".state-service"];

/** Resto de editor ou de escrita atômica: nunca é um artefato entregue. */
function isScratchName(name: string): boolean {
  return name.startsWith(".") || name.endsWith(".lock") || name.endsWith("~") || name.endsWith(".swp") || name.includes(".tmp-");
}

/**
 * Caminho (relativo à raiz, com `/` ou `\`) que vira evento, já normalizado
 * com `/`; `null` para o que o observador ignora.
 */
export function watchedArtifactPath(relativePath: string): string | null {
  const rel = relativePath.split("\\").join("/").replace(/^\.\//, "");
  if (!rel.startsWith(`${ARTIFACTS_REL}/`)) return null;
  const inside = rel.slice(ARTIFACTS_REL.length + 1).split("/");
  if (inside.length === 0 || inside.some((segment) => segment === "" || segment === "..")) return null;
  if (IGNORED_DIRS.includes(inside[0]!)) return null;
  if (isScratchName(inside[inside.length - 1]!)) return null;
  return rel;
}

/** Iniciativa do caminho, quando ele mora em `.github/artifacts/initiatives/<id>/...`. */
export function initiativeOfArtifactPath(artifactPath: string): string | undefined {
  const match = artifactPath.match(/^\.github\/artifacts\/initiatives\/([^/]+)\/.+/);
  return match?.[1];
}

/** O evento de uma gravação observada, pronto para o validador do contrato. */
export function artifactWrittenEvent(artifactPath: string, timestamp: string): RunEvent {
  const initiative = initiativeOfArtifactPath(artifactPath);
  return {
    run_id: ARTIFACT_WATCH_RUN_ID,
    event_type: "artifact-written",
    timestamp,
    ...(initiative ? { initiative_id: initiative } : {}),
    artifact_path: artifactPath,
    harness: "watcher",
  };
}
