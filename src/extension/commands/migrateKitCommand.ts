/**
 * migrateKitCommand.ts — `<marca>.migrateKit` (F3.6, um módulo por comando).
 *
 * Atualiza a estrutura do kit (agentes, skills, instruções) preservando tudo
 * que o assessment produziu. Sobrescrever a LLM Wiki ou os artefatos
 * destruiria dias de trabalho — é o pior desfecho de uma migração.
 */

import * as vscode from "vscode";
import * as path from "path";
import { StructureGenerator } from "../../generator/StructureGenerator";
import { getKitStatus, kitVersion, readProjectMode } from "../../data/kit-version";
import type { ExtensionCommandDeps } from "./types";
import { BRAND } from "../../data/brand.pure";

export function registerMigrateKitCommand({ configLoader, ports, templateSource }: ExtensionCommandDeps): vscode.Disposable {
  return vscode.commands.registerCommand(`${BRAND.commandPrefix}.migrateKit`, async () => {
    const root = ports.workspaceRoot.current();
    if (!root) {
      void ports.notifier.warn(`${BRAND.displayName}: abra o workspace para migrar.`);
      return;
    }

    const status = getKitStatus(root, kitVersion());
    if (!status) {
      void ports.notifier.warn(`${BRAND.displayName}: esta pasta não é um workspace ${BRAND.displayName}.`);
      return;
    }

    // A migração aplica o kit brownfield; num projeto greenfield ela o destruiria (A6 / H-BUG-10).
    if (readProjectMode(root) === "greenfield") {
      void ports.notifier.warn(`${BRAND.displayName}: a migração do kit cobre só workspaces brownfield. Este projeto é greenfield e nada foi alterado.`);
      return;
    }

    const from = status.installed ?? "anterior ao versionamento";
    const confirmed = await ports.notifier.ask(
      `Migrar a estrutura da ${BRAND.displayName} ${from} → ${status.current}?`,
      {
        modal: true,
        detail:
          `SERÁ ATUALIZADO: agentes do kit (discovery/planning/execution/operation e o orquestrador), skills do kit, instruções e o comando /${BRAND.name}.\n\n` +
          "SERÁ PRESERVADO: seus agentes de domínio (a LLM Wiki), as skills de coding-guidelines por repo, todo o assessment em .github/artifacts/, docs/input/ e repos/.\n\n" +
          "Recomendado commitar antes — a migração sobrescreve arquivos do kit.",
      },
      "Migrar"
    );
    if (confirmed !== "Migrar") return;

    const generator = new StructureGenerator(templateSource);
    const config = await configLoader.load();
    // Depois do Foundation o config é multi-repo, sem host_adapter: o host vem do disco (A5 / H-BUG-09).
    const host = await configLoader.hostAdapter();
    const projectName = config?.project?.name ?? path.basename(root);

    try {
      await ports.notifier.progress(`${BRAND.displayName}: migrando para ${status.current}…`, () => generator.migrateKit(root, projectName, host));
    } catch (err) {
      void ports.notifier.error(
        `${BRAND.displayName}: falha na migração — ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    configLoader.invalidate();
    void ports.notifier.info(
      `✓ ${BRAND.displayName}: estrutura migrada para ${status.current}. Seus agentes de domínio e o assessment foram preservados.`
    );
  });
}
