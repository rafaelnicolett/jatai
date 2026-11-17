/**
 * operations-contract.ts
 *
 * Lado que toca disco de `operations-contract.pure.ts` — lê os 4 artefatos
 * do painel de Operações (ADR-0002). Tolerante por natureza: arquivo
 * ausente é o estado normal antes de qualquer agente de Operation rodar,
 * nunca um erro.
 */

import * as fs from "fs";
import * as path from "path";
import {
  DEVOPS_STATUS_PATH,
  OBSERVABILITY_STATUS_PATH,
  INCIDENTS_PATH,
  SUSTAIN_LOG_PATH,
  parseDevopsStatus,
  parseObservabilityStatus,
  parseIncidentsLog,
  parseSustainLog,
  type OperationsSnapshot,
} from "./operations-contract.pure";
import type { OnDataIssue } from "./data-health";
import { BRAND } from "./brand.pure";

export * from "./operations-contract.pure";

function readIfExists(workspaceRoot: string, relPath: readonly string[]): string | null {
  const filePath = path.join(workspaceRoot, ...relPath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

/** Lê os 4 artefatos e combina num `OperationsSnapshot` — nunca `null` no todo (cada bloco é `null` individualmente se o arquivo não existir). */
export function loadOperationsSnapshot(workspaceRoot: string, onError?: OnDataIssue): OperationsSnapshot {
  const devopsRaw = readIfExists(workspaceRoot, DEVOPS_STATUS_PATH);
  const observabilityRaw = readIfExists(workspaceRoot, OBSERVABILITY_STATUS_PATH);
  const incidentsRaw = readIfExists(workspaceRoot, INCIDENTS_PATH);
  const sustainRaw = readIfExists(workspaceRoot, SUSTAIN_LOG_PATH);

  const report = (rel: string, errors: string[]): void => {
    if (errors.length === 0) return;
    console.error(`[${BRAND.name}] ${rel}:\n  - ${errors.join("\n  - ")}`);
    onError?.({ source: "operations", message: `${rel}: ${errors.join("; ")}` });
  };

  let devops = null;
  if (devopsRaw !== null) {
    const { status, errors } = parseDevopsStatus(devopsRaw);
    report(DEVOPS_STATUS_PATH.join("/"), errors);
    devops = status;
  }

  let observability = null;
  if (observabilityRaw !== null) {
    const { status, errors } = parseObservabilityStatus(observabilityRaw);
    report(OBSERVABILITY_STATUS_PATH.join("/"), errors);
    observability = status;
  }

  let incidents = null;
  if (incidentsRaw !== null) {
    const { log, errors } = parseIncidentsLog(incidentsRaw);
    report(INCIDENTS_PATH.join("/"), errors);
    incidents = log;
  }

  let sustain = null;
  if (sustainRaw !== null) {
    const { log, errors } = parseSustainLog(sustainRaw);
    report(SUSTAIN_LOG_PATH.join("/"), errors);
    sustain = log;
  }

  return { devops, observability, incidents, sustain };
}
