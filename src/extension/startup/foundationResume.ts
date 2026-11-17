/**
 * foundationResume.ts — retomada do Foundation depois que o Wizard reabre a
 * janela na pasta do workspace criado (F3.6, Extract Module de `extension.ts`).
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { foundationPrompt, type HostId } from "../../data/foundation-prompt";
import { BRAND } from "../../data/brand.pure";
import type { HostPorts } from "../ports";
import { handOffToOrchestrator } from "../../adapters/chat/orchestrator";

/**
 * Workspace criado que ainda não teve o Foundation iniciado.
 *
 * `vscode.openFolder` recarrega a extensão, então o disparo do @assessor não
 * sobrevive à troca de pasta — fica aqui e é retomado na ativação seguinte.
 *
 * Exportada (só visibilidade, mesmo valor/uso de sempre) para os
 * characterization tests de `resumePendingFoundation` construírem o
 * `globalState` pendente sem duplicar a string — mesmo padrão de
 * `NOTIFICATIONS_LAST_SEEN_KEY` em `notificationActions.ts`. Ver
 * `tests/extension-resume-foundation.test.ts`.
 */
export const PENDING_FOUNDATION_KEY = `${BRAND.name}.pendingFoundation`;

/** Abre o chat no agente orquestrador pedindo que o @assessor monte o inventário e comece o Discovery (ADR-0025). */
export async function startFoundation(hostAdapter: string, ports: Pick<HostPorts, "notifier" | "chatHost">): Promise<void> {
  const host: HostId = hostAdapter === "claude" ? "claude" : hostAdapter === "opencode" ? "opencode" : "copilot";
  try {
    // O harness é o que o Wizard escolheu: no Claude Code, o pedido vai para o /<marca> (H-BUG-24).
    await handOffToOrchestrator(ports.chatHost, foundationPrompt(host), { host });
  } catch (err) {
    // Chat indisponível não pode matar a criação do workspace — o usuário
    // ainda pode iniciar manualmente pelo Cockpit ou pelo /helyx.
    console.error(`[${BRAND.name}] não foi possível abrir o chat para iniciar o Foundation:`, err);
    void ports.notifier.warn(
      `${BRAND.displayName}: workspace criado. Rode \`/${BRAND.name}\` no chat para mapear os repositórios.`
    );
  }
}

/**
 * Resolve o caminho canônico de `p` para comparação de diretórios.
 *
 * Usa `fs.realpath` (segue symlink do SO — ex. macOS `/tmp` → `/private/tmp`
 * — e normaliza barra final) e, se `p` não existir mais no disco, sobe
 * recursivamente para o ancestral existente mais próximo, resolve esse, e
 * recoloca por cima o restante do path que não existe. Isso importa porque
 * `fs.realpath` exige que o caminho INTEIRO exista — sem o fallback
 * recursivo, uma pasta-folha que ainda não existe (ex. o workspace que será
 * reaberto) faria `realpath` falhar por inteiro, e um fallback ingênuo pra
 * `path.resolve` nunca aprenderia sobre o symlink de sistema.
 *
 * Nunca lança: no pior caso (nem a raiz resolve), cai em `path.resolve` puro.
 */
async function resolveCanonicalPath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return path.resolve(p);
    return path.join(await resolveCanonicalPath(parent), path.basename(p));
  }
}

/**
 * Compara `a` e `b` como o MESMO diretório lógico — tolera as três formas de
 * divergência que são só normalização de path, não pastas diferentes:
 * symlink resolvido pelo SO, barra final, e case em volume case-insensitive
 * (default em macOS/Windows).
 *
 * A comparação case-insensitive é um fallback FINAL, só depois do match
 * exato (pós-`realpath`) falhar. Trade-off deliberado: em tese isso trataria
 * como iguais duas pastas genuinamente diferentes que só divergem por case
 * num filesystem case-sensitive (Linux) — aceito e documentado no
 * feature-report deste fix, não uma omissão. Ver
 * `tests/extension-resume-foundation.test.ts` para os cenários pinados.
 */
async function isSameWorkspaceDir(a: string, b: string): Promise<boolean> {
  const [canonicalA, canonicalB] = await Promise.all([resolveCanonicalPath(a), resolveCanonicalPath(b)]);
  return canonicalA === canonicalB || canonicalA.toLowerCase() === canonicalB.toLowerCase();
}

/**
 * Retoma o Foundation quando a janela reabre já na pasta do workspace criado.
 * Só dispara se a pasta aberta for a MESMA pasta registrada pelo wizard —
 * senão o agente agiria no contexto errado.
 *
 * FIX (hotfix-wizard-project-detection, wave-2 item-2.2 — ver
 * `.github/artifacts/execution/test-backfill-report-helyx-vscode-extension-resume-foundation.md`):
 * até esta mudança, a comparação era `!==` estrito sobre `fsPath` puro, sem
 * nenhuma normalização. Um symlink resolvido pelo SO (macOS `/tmp` →
 * `/private/tmp`), barra final, ou case em volume case-insensitive faziam o
 * `if` falhar SILENCIOSAMENTE (sem log, sem toast) mesmo as duas pastas
 * sendo o MESMO diretório real — e pior, como a limpeza do `pending` ficava
 * DEPOIS do `if`, o estado ficava órfão em `globalState` para sempre. Agora
 * os dois lados passam por `isSameWorkspaceDir` antes de comparar.
 *
 * Um mismatch GENUÍNO (pastas realmente diferentes, não só normalização) é
 * logado em vez de silenciado — mas o `pending` continua NÃO sendo limpo
 * nesse caso: comportamento preservado deliberadamente, permite retomar se
 * o usuário abrir a pasta certa depois (decisão documentada no
 * feature-report, não um descuido).
 */
export async function resumePendingFoundation(context: vscode.ExtensionContext, ports: Pick<HostPorts, "workspaceRoot" | "notifier" | "chatHost">): Promise<void> {
  const pending = context.globalState.get<{ dir: string; host: string } | undefined>(PENDING_FOUNDATION_KEY);
  if (!pending) return;

  const openDir = ports.workspaceRoot.current();
  if (!openDir) return;

  if (!(await isSameWorkspaceDir(openDir, pending.dir))) {
    // Mismatch genuíno (sobreviveu à normalização) — provavelmente um
    // pendente de um wizard anterior, e o usuário abriu outra pasta sem
    // relação. Log interno basta: um `showWarningMessage` aqui seria
    // ruidoso no caso comum de chave órfã antiga, sem repercussão real pro
    // usuário (ver decisão de visibilidade no feature-report deste fix).
    console.warn(
      `[${BRAND.name}] Foundation pendente não retomado: pasta aberta ("${openDir}") não corresponde à pasta registrada pelo wizard ("${pending.dir}").`
    );
    return;
  }

  await context.globalState.update(PENDING_FOUNDATION_KEY, undefined);
  await startFoundation(pending.host, ports);
}
