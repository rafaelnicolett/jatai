/**
 * GreenfieldGenerator.ts
 *
 * Gera o projeto greenfield dentro de uma pasta de staging (F3.4, passo 6):
 * template em zip da `TemplateSource` plugada ou scaffold local, artefatos do
 * harness por cima, Initiative inicial, config e `.gitignore`. A troca
 * atômica staging → destino é da Facade (`StructureGenerator.generate`).
 */

import * as path from "path";
import * as fs from "fs/promises";
import type { WizardState } from "../../types";
import { kitVersion } from "../../data/kit-version";
import type { TemplateSource } from "../../adapters/templates/TemplateSource";
import { stateRepository } from "../../cli/lib/StateRepository";
import { BRAND } from "../../data/brand.pure";
import { ensureRunsGitignored, ensureStateServiceGitignored } from "../fs/gitignore";
import { findHarness } from "../harness/harnesses";
import { zipEntryDestination } from "../zip-entry-path";
import { buildVars, extractAndRender } from "../template/zip-template";
import { buildGreenfieldConfig } from "../content/config";
import type { KitInstaller } from "../install/KitInstaller";
import { GreenfieldScaffolder } from "./GreenfieldScaffolder";

export class GreenfieldGenerator {
  private readonly _scaffolder = new GreenfieldScaffolder();

  constructor(
    private readonly _templateSource: TemplateSource,
    private readonly _kit: KitInstaller
  ) {}

  /** Returns true when generated from local scaffold (no zip). */
  async generateInto(dir: string, state: WizardState): Promise<boolean> {
    // Guard: ensure cached/resolved template stack matches wizard selection (Bug #5 prevention)
    const resolvedStack = state.resolvedTemplate?.stack;
    if (resolvedStack !== undefined && resolvedStack !== state.backendStack) {
      throw new Error(
        `Stack mismatch: wizard selected "${state.backendStack}" but resolved template reports "${resolvedStack}". ` +
        `Clear the template cache and try again.`
      );
    }

    const templateId = `${BRAND.templatePrefix}${state.backendStack}`;
    const version = state.resolvedTemplate?.version;

    // 1. Try zip from the template source; none → local scaffold
    const zip = await this._templateSource.getZip(templateId, version);

    let isLocal = false;
    if (zip !== null) {
      // 2a. Extract + render template variables from zip
      const vars = buildVars(state);
      const templateFiles = await extractAndRender(zip, vars);
      for (const file of templateFiles) {
        // Zip-slip (A16a): o gerador valida cada entrada, sem depender do JSZip.
        const dest = zipEntryDestination(dir, file.relativePath);
        if (dest === null) {
          throw new Error(
            `Unsafe path in template zip: ${JSON.stringify(file.relativePath)}. ` +
            `Template entries must be relative paths inside the project.`
          );
        }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, file.content);
      }
    } else {
      // 2b. No zip available — scaffold directory tree from wizard state
      await this._generateLocalScaffold(dir, state);
      isLocal = true;
    }

    // 3. Host adapter — generate agent artifacts (always local)
    const adapter = findHarness(state.hostAdapter);
    if (adapter === undefined) {
      throw new Error(`Unknown host adapter: ${state.hostAdapter}`);
    }
    const agentFiles = await adapter.generateAgentArtifacts(dir, state);
    for (const file of agentFiles) {
      const dest = path.join(dir, file.relativePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, file.content);
    }

    // 4. Seed da Initiative inicial em initiatives.yaml — roda pros dois
    // ramos acima (zip OU scaffold local): sem uma Initiative, o Cockpit
    // trata "zero iniciativas" como bloqueio universal (ver
    // `_seedInitialInitiative`).
    await this._seedInitialInitiative(dir, state);

    // 5. Config do projeto, com o nome da marca: é o arquivo que o orquestrador do kit
    // manda ler (`{{brand.files.config}}`) para achar a stack que o Wizard registrou.
    // Antes saía como `ai-sdk.config.yaml`, e os agentes nunca o encontravam.
    await fs.writeFile(
      path.join(dir, BRAND.files.config),
      buildGreenfieldConfig(state, new Date().toISOString(), kitVersion())
    );

    // 6. O projeto vira workspace Helyx: o State Service grava o token em
    // `.github/artifacts/.state-service/` ao abrir a pasta (BUG-48).
    await ensureStateServiceGitignored(dir);
    await ensureRunsGitignored(dir);

    return isLocal;
  }

  /**
   * Semeia a Initiative inicial em `.github/artifacts/initiatives.yaml` —
   * sem isso, um projeto greenfield recém-gerado nasce com ZERO iniciativas
   * e `DeliveryProgress.tsx` (Cockpit) trata "zero iniciativas" como bloqueio
   * universal, mostrando o empty-state de vocabulário BROWNFIELD ("Vamos
   * começar sua primeira iniciativa") mesmo para um projeto que acabou de
   * nascer corretamente (ver
   * `.github/artifacts/execution/diagnosis-report-hotfix-wizard-project-detection.md`,
   * Sintoma 1).
   *
   * `type` fica DELIBERADAMENTE ausente: "ausente = `feature` implícito" já
   * é a linguagem ubíqua documentada em `InitiativeKind`
   * (`initiatives-contract.pure.ts`) e em `helyx-delivery-methodology.agent.md`.
   * Isso — mais a ausência de `waves`/`epics`/`gate_d2`/`roadmap_gate`/
   * `risk_matrix_gate` — é o que faz `usesWaveView()` (webview,
   * `computeModernizationBoard.ts`) devolver `false` e o Cockpit renderizar o
   * funil Upstream/Downstream de `phase-contracts.ts` (o mesmo catálogo que
   * `greenfieldPhaseActions.ts` já usa pra aprovar fase) — não o board de
   * ondas do `ModernizationProgress`, pensado pra `modernization`/`hotfix`.
   * Mesma forma já usada como exemplo no mock do próprio Cockpit
   * (`webview-ui/src/mock/mockData.ts`, entrada `new-loyalty-app`:
   * `{ status: "planned", mode: "greenfield" }`, sem `type`).
   *
   * Usa `stateRepository.upsertInitiativeAtomic` — não a família `*InPlace`
   * que `views/actions/*.ts` prefere pro resto das operações do Cockpit —
   * porque CRIAR uma Initiative do zero só existe na família Atomic;
   * `StateRepository` não tem nenhum `upsertInitiativeInPlace` (ver
   * `StateRepository.ts`). O lock de arquivo é inofensivo aqui: o arquivo
   * ainda nem existe, ninguém mais pode estar escrevendo nele.
   *
   * Recebe `dir` (o `tmpDir` de `generate()`), nunca `targetDir`: a geração
   * greenfield é atômica (staging em tmp → rename pro destino final,
   * rollback total em caso de falha — ver docblock da classe) e este seed
   * precisa participar do MESMO `_atomicMove`, nunca escrever direto em
   * `targetDir`, que só existe de fato depois do rename.
   */
  private async _seedInitialInitiative(dir: string, state: WizardState): Promise<void> {
    await stateRepository.upsertInitiativeAtomic(dir, {
      id: state.projectName,
      name: state.projectName,
      mode: "greenfield",
      status: "planned",
      setActive: true,
    });
  }

  /**
   * Generates a COMPLETE scaffold when the registry/zip is unavailable.
   * Delivers a production-ready structure with agents, skills, docs, domain model,
   * BDD features, OpenAPI contracts, hexagonal code structure, and IaC.
   * Based on the canonical Helyx structure but adapted to user's project.
   */
  private async _generateLocalScaffold(dir: string, state: WizardState): Promise<void> {
    // 1. Agent structure (.github/ or .claude/)
    await this._kit.installGreenfield(dir, state);

    // 2–6. Docs, features, API, código e infraestrutura
    await this._scaffolder.scaffold(dir, state);
  }
}
