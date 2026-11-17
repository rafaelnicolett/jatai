/**
 * yamlUpsert.ts
 *
 * Edição cirúrgica, linha a linha, de `delivery-state.yaml` /
 * `foundation-state.yaml` — preserva comentários e formatação escritos pelo
 * agente (reserializar com `yaml.dump()` os apagaria). Extraído de métodos
 * privados que viviam em `CockpitController.ts` (`_upsertPhaseStatusInYaml`,
 * `_upsertChecklistItemInYaml`, `_upsertPhaseInYaml`, `_findPhaseHeaderIdx`) —
 * comportamento preservado ao pé da letra, só reorganizado para ser
 * compartilhado (sem duplicação) pelos handlers de guard rail do Cockpit
 * atual e do Cockpit Next.
 *
 * 100% puro — zero `fs`/`vscode` — mesma classe de módulo que os `*.pure.ts`
 * de `src/data/`.
 */

import { canonicalDeliveryPhaseId, deliveryPhaseKeyVariants } from "../../methodology/phase-catalog.pure";
import type { WorkStatus } from "../../contracts/work-status.pure";

/** Status gravável de uma fase: o vocabulário de trabalho da ADR-0022. */
export type PhaseStatus = WorkStatus;

/**
 * Mapa reverso: id canônico → toda chave YAML válida (canônica primeiro,
 * aliases depois). Um agente pode gravar a fase em `delivery-state.yaml` com
 * o próprio `id:` do frontmatter, divergente do id canônico do Cockpit; sem
 * este mapa, a busca falha e o Cockpit cria um bloco-sombra ao lado do bloco
 * do agente. Os aliases vêm do catálogo único (`phase-catalog.pure.ts`).
 */
export const PHASE_KEY_VARIANTS: Record<string, string[]> = deliveryPhaseKeyVariants();

/**
 * A9/H-BUG-15 — chave YAML segura para ids vindos de flag (`--item`,
 * `--section`): um id comum (`backlog-ok`, `human_checklist`) sai como está,
 * com os mesmos bytes de antes; qualquer outro (`testes: ok`) sai entre aspas
 * duplas, escapado como string JSON (que também é YAML válido). Exportada
 * para os leitores acharem a mesma chave que o writer grava.
 */
export function yamlKey(key: string): string {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key) ? key : JSON.stringify(key);
}

/**
 * BUG-27 — os writers deste módulo editam com 2 espaços por nível. Um arquivo
 * indentado com outra unidade (4 é o comum em edição à mão) é visto com 2,
 * editado e devolvido na unidade dele: as linhas que a edição não tocou voltam
 * byte a byte, e as novas saem na indentação do arquivo. Comentários e linhas
 * em branco não são convertidos (em nenhum dos dois sentidos).
 *
 * `null` quando não há o que converter: o arquivo já usa 2, não tem nada
 * indentado, ou alguma linha não é múltipla da unidade (um bloco literal com
 * recuo próprio, por exemplo) e a volta perderia bytes. Aí o writer segue
 * como antes, e a guarda do A9 recusa a escrita que quebraria o arquivo.
 */
export function asTwoSpaceIndent(content: string): { normalized: string; restore(edited: string): string } | null {
  const lines = content.split("\n");
  let unit: number | null = null;
  for (const line of lines) {
    const n = indentOf(line);
    if (n !== null && n > 0 && (unit === null || n < unit)) unit = n;
  }
  if (unit === null || unit === 2) return null;
  const normalized = reindent(lines, unit, 2);
  if (normalized === null) return null;
  return {
    normalized: normalized.join("\n"),
    restore: (edited) => reindent(edited.split("\n"), 2, unit)?.join("\n") ?? edited,
  };
}

/** Espaços no começo de uma linha de conteúdo; `null` para linha em branco ou comentário. */
function indentOf(line: string): number | null {
  const body = line.trimStart();
  if (body.trim() === "" || body.startsWith("#")) return null;
  return line.length - line.replace(/^ +/, "").length;
}

function reindent(lines: string[], from: number, to: number): string[] | null {
  const out: string[] = [];
  for (const line of lines) {
    const n = indentOf(line);
    if (n === null) { out.push(line); continue; }
    if (n % from !== 0) return null;
    out.push(" ".repeat((n / from) * to) + line.slice(n));
  }
  return out;
}

/** A9/H-BUG-15 — valor string sempre entre aspas duplas e escapado (`qa "lead"` → `"qa \"lead\""`). */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Acha a linha do cabeçalho do bloco de uma fase, tentando primeiro o id
 * canônico do Cockpit, depois qualquer variante escrita por um agente.
 * `phaseId` pode ser o canônico ou um alias: os dois acham o mesmo bloco.
 * `-1` se não achar sob nenhuma chave conhecida. Comparação de texto, sem
 * regex: o id pode vir de YAML escrito à mão (`.`, `(` e `[` são literais).
 */
export function findPhaseHeaderIdx(lines: string[], phasesIdx: number, phaseId: string): number {
  const canonicalId = canonicalDeliveryPhaseId(phaseId);
  const variants = PHASE_KEY_VARIANTS[canonicalId] ?? [canonicalId];
  for (const variant of variants) {
    const header = `  ${variant}:`;
    const idx = lines.findIndex(
      (l, i) => i > phasesIdx && l.trimEnd() === header
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Upsert de `phases.<phaseId>.status` (e `agent`, se fornecido), alias-aware:
 * acha o bloco sob qualquer chave da fase, e um bloco novo nasce com o id
 * canônico (nunca um bloco-sombra ao lado do bloco do agente — A2/H-BUG-06).
 */
export function upsertPhaseStatusInYaml(content: string, phaseId: string, status: PhaseStatus, agent?: string): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseStatusInYaml(indent.normalized, phaseId, status, agent));
  const key = canonicalDeliveryPhaseId(phaseId);
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) {
    const block = [`phases:`, `  ${key}:`, `    status: ${status}`];
    if (agent) block.push(`    agent: ${yamlString(agent)}`);
    return (content.trimEnd() ? content.trimEnd() + "\n" : "") + block.join("\n") + "\n";
  }
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) {
    let insertAt = phasesIdx + 1;
    while (insertAt < lines.length && /^ {2}/.test(lines[insertAt] ?? "")) insertAt++;
    const block = [`  ${key}:`, `    status: ${status}`];
    if (agent) block.push(`    agent: ${yamlString(agent)}`);
    lines.splice(insertAt, 0, ...block);
    return lines.join("\n");
  }
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const statusIdx = lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && /^ {4}status:/.test(l));
  if (statusIdx === -1) {
    lines.splice(phaseHeaderIdx + 1, 0, `    status: ${status}`);
  } else {
    lines[statusIdx] = `    status: ${status}`;
  }
  return lines.join("\n");
}

/** Upsert de um item de checklist (`human_checklist`/`checklist`) de uma fase, alias-aware. */
export function upsertChecklistItemInYaml(content: string, phaseId: string, itemId: string, checked: boolean, section = "checklist"): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertChecklistItemInYaml(indent.normalized, phaseId, itemId, checked, section));
  const sectionKey = yamlKey(section);
  const itemKey = yamlKey(itemId);
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) {
    return content.trimEnd() + `\nphases:\n  ${canonicalDeliveryPhaseId(phaseId)}:\n    status: in-progress\n    ${sectionKey}:\n      ${itemKey}: ${checked}\n`;
  }
  // Busca alias-aware evita criar um bloco-sombra (Bug #3 do Cockpit legado).
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) {
    let insertAt = phasesIdx + 1;
    while (insertAt < lines.length && /^ {2}/.test(lines[insertAt] ?? "")) insertAt++;
    lines.splice(insertAt, 0, `  ${canonicalDeliveryPhaseId(phaseId)}:`, `    status: in-progress`, `    ${sectionKey}:`, `      ${itemKey}: ${checked}`);
    return lines.join("\n");
  }
  let phaseEnd = phaseHeaderIdx + 1;
  while (phaseEnd < lines.length && /^ {4}/.test(lines[phaseEnd] ?? "")) phaseEnd++;
  const sectionHeader = `    ${sectionKey}:`;
  const sectionHeaderIdx = lines.findIndex((l, i) => i > phaseHeaderIdx && i < phaseEnd && l.trimEnd() === sectionHeader);
  if (sectionHeaderIdx === -1) {
    lines.splice(phaseEnd, 0, sectionHeader, `      ${itemKey}: ${checked}`);
    return lines.join("\n");
  }
  // O item é procurado só dentro da seção (linhas em branco no meio dela
  // continuam valendo): um id igual em outra seção ou numa fase seguinte não é
  // o mesmo item (achado da F3.1).
  let sectionEnd = sectionHeaderIdx + 1;
  while (sectionEnd < lines.length && (/^ {6}/.test(lines[sectionEnd] ?? "") || (lines[sectionEnd] ?? "").trim() === "")) sectionEnd++;
  const itemIdx = lines.findIndex((l, i) => i > sectionHeaderIdx && i < sectionEnd && l.startsWith(`      ${itemKey}:`));
  if (itemIdx !== -1) {
    lines[itemIdx] = `      ${itemKey}: ${checked}`;
  } else {
    let clEnd = sectionHeaderIdx + 1;
    while (clEnd < lines.length && /^ {6}/.test(lines[clEnd] ?? "")) clEnd++;
    lines.splice(clEnd, 0, `      ${itemKey}: ${checked}`);
  }
  return lines.join("\n");
}

/**
 * Upsert de `phases.<phaseId>.artifacts` — substitui a lista inteira (não
 * faz merge item a item; é assim que os agentes reportam: a lista completa
 * do que a fase produziu, de uma vez), alias-aware.
 */
export function upsertPhaseArtifactsInYaml(content: string, phaseId: string, artifactPaths: string[]): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseArtifactsInYaml(indent.normalized, phaseId, artifactPaths));
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  const artifactLines = artifactPaths.map((p) => `      - path: ${JSON.stringify(p)}`);
  if (phasesIdx === -1) {
    const block = [`phases:`, `  ${canonicalDeliveryPhaseId(phaseId)}:`, `    artifacts:`, ...artifactLines];
    return (content.trimEnd() ? content.trimEnd() + "\n" : "") + block.join("\n") + "\n";
  }
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) {
    let insertAt = phasesIdx + 1;
    while (insertAt < lines.length && /^ {2}/.test(lines[insertAt] ?? "")) insertAt++;
    lines.splice(insertAt, 0, `  ${canonicalDeliveryPhaseId(phaseId)}:`, `    artifacts:`, ...artifactLines);
    return lines.join("\n");
  }
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const artifactsIdx = lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && /^ {4}artifacts:\s*$/.test(l));
  if (artifactsIdx === -1) {
    lines.splice(phaseHeaderIdx + 1, 0, `    artifacts:`, ...artifactLines);
    return lines.join("\n");
  }
  let artifactsEnd = artifactsIdx + 1;
  while (artifactsEnd < lines.length && /^ {6}/.test(lines[artifactsEnd] ?? "")) artifactsEnd++;
  lines.splice(artifactsIdx, artifactsEnd - artifactsIdx, `    artifacts:`, ...artifactLines);
  return lines.join("\n");
}

/**
 * Upsert de `phases.<phaseId>.completed_at` isolado, alias-aware — companion
 * de `upsertPhaseStatusInYaml` para quando o chamador (o CLI `helyx-state`)
 * precisa setar `completed_at` sem forçar `status: done` (que é o que
 * `upsertPhaseInYaml` abaixo faz).
 */
export function upsertPhaseCompletedAtInYaml(content: string, phaseId: string, completedAt: string): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseCompletedAtInYaml(indent.normalized, phaseId, completedAt));
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) {
    return content.trimEnd() + `\nphases:\n  ${canonicalDeliveryPhaseId(phaseId)}:\n    completed_at: ${yamlString(completedAt)}\n`;
  }
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) {
    let insertAt = phasesIdx + 1;
    while (insertAt < lines.length && /^ {2}/.test(lines[insertAt] ?? "")) insertAt++;
    lines.splice(insertAt, 0, `  ${canonicalDeliveryPhaseId(phaseId)}:`, `    completed_at: ${yamlString(completedAt)}`);
    return lines.join("\n");
  }
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const idx = lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && /^ {4}completed_at:/.test(l));
  if (idx === -1) {
    lines.splice(phaseHeaderIdx + 1, 0, `    completed_at: ${yamlString(completedAt)}`);
  } else {
    lines[idx] = `    completed_at: ${yamlString(completedAt)}`;
  }
  return lines.join("\n");
}

/**
 * H-BUG-62 — grava o `agent` de uma fase que já existe, alias-aware. É o
 * `--agent` explícito (CLI, HTTP e MCP via `upsertDeliveryPhaseAtomic`); a
 * aprovação não passa por aqui, então o agent que o time gravou numa fase
 * seguinte não é trocado pelo do catálogo. Sem o bloco da fase, devolve o
 * conteúdo como está: quem chama cria o bloco antes (`upsertPhaseStatusInYaml`).
 */
export function upsertPhaseAgentInYaml(content: string, phaseId: string, agent: string): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseAgentInYaml(indent.normalized, phaseId, agent));
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) return content;
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) return content;
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const fieldIdx = (re: RegExp): number => lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && re.test(l));
  const agentLine = `    agent: ${yamlString(agent)}`;
  const agentIdx = fieldIdx(/^ {4}agent:/);
  if (agentIdx !== -1) {
    lines[agentIdx] = agentLine;
  } else {
    const statusIdx = fieldIdx(/^ {4}status:/);
    lines.splice(statusIdx !== -1 ? statusIdx + 1 : phaseHeaderIdx + 1, 0, agentLine);
  }
  return lines.join("\n");
}

/**
 * `reason` de uma fase (ADR-0022): com motivo, grava ou troca a linha logo
 * depois de `status`; sem motivo (`undefined`), tira um `reason` que tenha
 * ficado de um status anterior. Fase inexistente: nada muda.
 */
export function upsertPhaseReasonInYaml(content: string, phaseId: string, reason: string | undefined): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseReasonInYaml(indent.normalized, phaseId, reason));
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) return content;
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) return content;
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const fieldIdx = (re: RegExp): number => lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && re.test(l));
  const reasonIdx = fieldIdx(/^ {4}reason:/);
  if (reason === undefined) {
    if (reasonIdx !== -1) lines.splice(reasonIdx, 1);
    return lines.join("\n");
  }
  const reasonLine = `    reason: ${yamlString(reason)}`;
  if (reasonIdx !== -1) {
    lines[reasonIdx] = reasonLine;
  } else {
    const statusIdx = fieldIdx(/^ {4}status:/);
    lines.splice(statusIdx !== -1 ? statusIdx + 1 : phaseHeaderIdx + 1, 0, reasonLine);
  }
  return lines.join("\n");
}

/**
 * Marca uma fase como `done` com `completed_at`, alias-aware. Edita só as
 * linhas de `status` e `completed_at` do bloco (A1/H-BUG-05): a chave que o
 * agente escreveu, `agent`, `artifacts`, os checklists (inclusive o `human-ok`
 * recém-gravado) e os comentários do bloco ficam como estão.
 */
export function upsertPhaseInYaml(content: string, phaseId: string, completedAt: string): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertPhaseInYaml(indent.normalized, phaseId, completedAt));
  const lines = content.split("\n");
  const phasesIdx = lines.findIndex((l) => /^phases:\s*$/.test(l));
  if (phasesIdx === -1) {
    return content.trimEnd() + `\nphases:\n  ${canonicalDeliveryPhaseId(phaseId)}:\n    status: done\n    completed_at: ${yamlString(completedAt)}\n`;
  }
  const phaseHeaderIdx = findPhaseHeaderIdx(lines, phasesIdx, phaseId);
  if (phaseHeaderIdx === -1) {
    lines.splice(phasesIdx + 1, 0,
      `  ${canonicalDeliveryPhaseId(phaseId)}:`, `    status: done`, `    completed_at: ${yamlString(completedAt)}`);
    return lines.join("\n");
  }
  let blockEnd = phaseHeaderIdx + 1;
  while (blockEnd < lines.length && /^ {4}/.test(lines[blockEnd] ?? "")) blockEnd++;
  const fieldIdx = (re: RegExp): number => lines.findIndex((l, i) => i > phaseHeaderIdx && i < blockEnd && re.test(l));
  const statusLine = `    status: done`;
  const completedLine = `    completed_at: ${yamlString(completedAt)}`;
  let statusIdx = fieldIdx(/^ {4}status:/);
  if (statusIdx === -1) {
    statusIdx = phaseHeaderIdx + 1;
    lines.splice(statusIdx, 0, statusLine);
    blockEnd++;
  } else {
    lines[statusIdx] = statusLine;
  }
  const completedIdx = fieldIdx(/^ {4}completed_at:/);
  if (completedIdx === -1) {
    lines.splice(statusIdx + 1, 0, completedLine);
  } else {
    lines[completedIdx] = completedLine;
  }
  return lines.join("\n");
}

export type GateD1Status = "pending" | "approved";

/**
 * Upsert de `repos.<repoId>.gate_d1` em `foundation-state.yaml` — o único
 * writer determinístico que este arquivo tinha pra este campo era o agente
 * escrevendo à mão. Estrutura real (2 níveis abaixo de `repos:`, confirmada
 * em `brownfield-templates/agents/discovery/assessor.agent.md`):
 * `repos:` (0) → `<repoId>:` (2) → `gate_d1:` (4) → `status`/`approved_at` (6).
 */
export function upsertGateD1InYaml(
  content: string,
  repoId: string,
  status: GateD1Status,
  approvedAt?: string,
  human?: { humanApprovedAt: string; by?: string; note?: string }
): string {
  const indent = asTwoSpaceIndent(content);
  if (indent) return indent.restore(upsertGateD1InYaml(indent.normalized, repoId, status, approvedAt, human));
  const lines = content.split("\n");
  const gateLines = [`    gate_d1:`, `      status: ${status}`];
  if (approvedAt) gateLines.push(`      approved_at: "${approvedAt}"`);
  // G2 (ADR-0024 proposta): a aprovação registrada como decisão humana. Valores escapados como string JSON (válida em YAML).
  if (human) {
    gateLines.push(`      human_approved_at: ${JSON.stringify(human.humanApprovedAt)}`);
    if (human.by) gateLines.push(`      by: ${JSON.stringify(human.by)}`);
    if (human.note) gateLines.push(`      note: ${JSON.stringify(human.note)}`);
  }

  const reposIdx = lines.findIndex((l) => /^repos:\s*$/.test(l));
  if (reposIdx === -1) {
    const block = [`repos:`, `  ${repoId}:`, ...gateLines];
    return (content.trimEnd() ? content.trimEnd() + "\n" : "") + block.join("\n") + "\n";
  }

  // Texto, não regex: o id vem do repos.yaml (`.`, `(` e `[` são literais).
  const repoHeader = `  ${repoId}:`;
  const repoHeaderIdx = lines.findIndex((l, i) => i > reposIdx && l.trimEnd() === repoHeader);

  if (repoHeaderIdx === -1) {
    let insertAt = reposIdx + 1;
    while (insertAt < lines.length && /^ {2}/.test(lines[insertAt] ?? "")) insertAt++;
    lines.splice(insertAt, 0, `  ${repoId}:`, ...gateLines);
    return lines.join("\n");
  }

  let repoEnd = repoHeaderIdx + 1;
  while (repoEnd < lines.length && /^ {4}/.test(lines[repoEnd] ?? "")) repoEnd++;

  const gateHeaderIdx = lines.findIndex((l, i) => i > repoHeaderIdx && i < repoEnd && /^ {4}gate_d1:\s*$/.test(l));
  if (gateHeaderIdx === -1) {
    lines.splice(repoEnd, 0, ...gateLines);
    return lines.join("\n");
  }

  let gateEnd = gateHeaderIdx + 1;
  while (gateEnd < lines.length && /^ {6}/.test(lines[gateEnd] ?? "")) gateEnd++;
  lines.splice(gateHeaderIdx, gateEnd - gateHeaderIdx, ...gateLines);
  return lines.join("\n");
}
