import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  REPO_ROOT,
  callsEndingWith,
  listSourceFiles,
  objectPropertyLiterals,
  propertyAssignmentLiterals,
  uniqSorted,
  type Located,
} from "./helpers/source-scan";
import { goldenBrandSnapshotSerializer, toGoldenBrand } from "../golden/lib/brand";
import { BRAND } from "../../src/data/brand.pure";

// Snapshots gravados com a Helyx: toda string entra na marca do golden antes de
// comparar, e só a marca pode ter mudado (F1.3, ADR-0012/0013).
expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * Contrato de IDs de comando — F0.4 (lane B), `mod-missao-open-source`.
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional (arquitetura-e-refatoracao.md §2.5 X1/X5, §7.1).
 *
 * Três fontes, cruzadas:
 * 1. DECLARADOS — `package.json › contributes.commands` (o que a paleta mostra);
 * 2. REGISTRADOS — toda chamada `registerCommand("<id>", …)` em `src/`
 *    (AST, não grep: comentário não conta);
 * 3. REFERENCIADOS — todo id `helyx.*` que o código manda executar:
 *    `executeCommand("helyx.*")`, `command: "helyx.*"` (botões do chat,
 *    CodeLens, TreeItems, catálogo de atalhos, `runCommand` do webview) e
 *    `item.command = "helyx.*"` (StatusBar).
 *
 * O que é bug conhecido NÃO é corrigido aqui: vira `@known-bug:` com o
 * comportamento atual asserido (convenção de
 * `tests/structure-generator-greenfield.test.ts:278`). Quando o Epic 6 (C.x)
 * corrigir, o teste é invertido no MESMO PR da correção.
 *
 * Complemento runtime: `tests/characterization/extension-activate.characterization.test.ts`
 * prova que a lista estática de registrados == o que `activate()` registra de fato.
 */

interface PackageJson {
  activationEvents?: string[];
  contributes: {
    commands: Array<{ command: string; title: string; category?: string; icon?: string }>;
    chatParticipants?: Array<{ id: string; name: string; commands?: Array<{ name: string }> }>;
    views?: Record<string, Array<{ id: string; type?: string }>>;
    viewsWelcome?: Array<{ view: string; contents: string; when?: string }>;
    viewsContainers?: Record<string, Array<{ id: string }>>;
    menus?: Record<string, unknown[]>;
    icons?: Record<string, unknown>;
    configuration?: { properties: Record<string, { type?: string; default?: unknown; enum?: unknown[] }> };
  };
}

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;
const hostFiles = listSourceFiles("src");
const webviewFiles = listSourceFiles("webview-ui/src");

const declared = pkg.contributes.commands.map((c) => c.command);

const registrations: Array<Located<string>> = hostFiles.flatMap((f) =>
  callsEndingWith(f, "registerCommand")
    .filter((c) => c.value.args[0] !== null && c.value.args[0] !== undefined)
    .map((c) => ({ value: c.value.args[0] as string, file: c.file, line: c.line }))
);
const registered = uniqSorted(registrations.map((r) => r.value));

const references: Array<Located<string>> = [
  ...hostFiles.flatMap((f) =>
    callsEndingWith(f, "executeCommand")
      .filter((c) => typeof c.value.args[0] === "string")
      .map((c) => ({ value: c.value.args[0] as string, file: c.file, line: c.line }))
  ),
  ...hostFiles.flatMap((f) => objectPropertyLiterals(f, "command")),
  ...hostFiles.flatMap((f) => propertyAssignmentLiterals(f, "command")),
  ...webviewFiles.flatMap((f) => objectPropertyLiterals(f, "command")),
].filter((r) => r.value.startsWith(`${BRAND.commandPrefix}.`));

const referenced = uniqSorted(references.map((r) => r.value));

function where(id: string): string[] {
  return references.filter((r) => r.value === id).map((r) => `${r.file}:${r.line}`);
}

describe("contrato — IDs de comando (package.json × registerCommand × executeCommand)", () => {
  it("snapshot dos 11 comandos declarados em contributes.commands (id + título + categoria + ícone)", () => {
    expect(pkg.contributes.commands).toMatchSnapshot();
  });

  it("snapshot dos ids registrados via registerCommand em src/ (ordenado)", () => {
    // Só o id: o arquivo/linha de origem muda nos refactors X2 (um módulo por
    // comando) sem mudar comportamento — vai só na mensagem de falha.
    expect(registered, JSON.stringify(registrations.map((r) => `${r.value} @ ${r.file}:${r.line}`), null, 2)).toMatchSnapshot();
  });

  it("nenhum id é registrado duas vezes (o VS Code real lança 'command already exists' na ativação)", () => {
    const counts = new Map<string, number>();
    for (const r of registrations) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
    expect([...counts.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("todo comando DECLARADO tem handler registrado", () => {
    expect(declared.filter((id) => !registered.includes(id))).toEqual([]);
  });

  it("comandos registrados mas NÃO declarados em contributes (internos/órfãos) — lista pinada", () => {
    expect(toGoldenBrand(registered.filter((id) => !declared.includes(id)))).toEqual([
      "helyx._generateStructure",
      "helyx._installAgentStructure",
      "helyx.concierge.advancePhase",
      "helyx.concierge.runRawPrompt",
      "helyx.concierge.toggleGuardRail",
      "helyx.validateArtifactSection",
      "helyx.validateRemainingItems",
    ]);
  });

  it("snapshot de todo id helyx.* REFERENCIADO (registrado? quantas referências?)", () => {
    const table = referenced.map((id) => ({ id, registered: registered.includes(id), references: where(id).length }));
    expect(table, JSON.stringify(referenced.map((id) => ({ id, at: where(id) })), null, 2)).toMatchSnapshot();
  });

  // L1 / H-BUG-21, corrigido na F6.4: os botões "Abrir Cockpit"/"Cockpit"/
  // "Revisar fase" do chat executavam `helyx.openCockpit`, que ninguém
  // registra ("command not found"); o real é `helyx.openCockpitNext`.
  it("REGRESSÃO: o chat não referencia mais helyx.openCockpit; os 5 botões usam helyx.openCockpitNext, que é registrado (L1 / H-BUG-21)", () => {
    expect(registered).not.toContain(`${BRAND.commandPrefix}.openCockpit`);
    expect(where(`${BRAND.commandPrefix}.openCockpit`), JSON.stringify(where(`${BRAND.commandPrefix}.openCockpit`))).toEqual([]);
    expect(registered).toContain(`${BRAND.commandPrefix}.openCockpitNext`);
    const chatUses = where(`${BRAND.commandPrefix}.openCockpitNext`).filter((u) => u.startsWith("src/chat/"));
    // Evidência (path:linha) só na mensagem — o refactor CH4 move os renderers de card.
    expect(chatUses.length, JSON.stringify(chatUses)).toBe(5);
  });

  // L2 (arquitetura §1.8; gaps-and-bugs.md "botão importar"), corrigido na
  // F6.4: o handler `openImportWizard` do Cockpit executava um id inexistente
  // ("command 'helyx.importExistingRepo' not found"). Agora abre o Wizard,
  // onde fica o caminho "Projeto Existente" (efeito runtime no CK1).
  it("REGRESSÃO: helyx.importExistingRepo não é mais referenciado; o importar abre o Wizard registrado (L2)", () => {
    expect(where(`${BRAND.commandPrefix}.importExistingRepo`), JSON.stringify(where(`${BRAND.commandPrefix}.importExistingRepo`))).toEqual([]);
    expect(registered).toContain(`${BRAND.commandPrefix}.initializeDeliveryKit`);
    expect(where(`${BRAND.commandPrefix}.initializeDeliveryKit`).filter((u) => u.startsWith("src/views/actions/workspaceActions.ts:"))).toHaveLength(2);
  });

  // G5 / H-GAP-05, corrigido na F3.8: o provider órfão (nunca instanciado)
  // `HotspotProvider` referenciava este id, que nada registra. Os 4 providers
  // órfãos de src/views saíram (Remove Dead Code).
  it("REGRESSÃO: helyx.hotspot.markResolved não é mais referenciado; os providers órfãos de src/views saíram (G5 / H-GAP-05)", () => {
    expect(registered).not.toContain(`${BRAND.commandPrefix}.hotspot.markResolved`);
    expect(where(`${BRAND.commandPrefix}.hotspot.markResolved`)).toEqual([]);
    for (const orphan of ["AgentActivityProvider", "DeliveryStreamProvider", "DeliveryTreeProvider", "HotspotProvider"]) {
      expect(fs.existsSync(path.join(REPO_ROOT, `src/views/${orphan}.ts`)), orphan).toBe(false);
    }
  });

  // G5 (parte) / prontidão §2.1 egress #4, corrigido na F2.1: o
  // `ConnectorPanelProvider` órfão fazia GET no backend privado
  // (`/api/v1/projects/:id/connectors`, fallback `https://api.helyx.app`).
  it("helyx.connectors.configure não é mais referenciado: o ConnectorPanelProvider saiu (F2.1)", () => {
    expect(where(`${BRAND.commandPrefix}.connectors.configure`)).toEqual([]);
  });

  it("nenhum id referenciado deixa de ser registrado (qualquer novo falha aqui)", () => {
    expect(toGoldenBrand(referenced.filter((id) => !registered.includes(id)))).toEqual([]);
  });

  // G5 / H-GAP-05 ("helyx.syncTemplate órfão e perigoso"), corrigido na F2.1:
  // o comando era registrado em extension.ts, não era declarado, ninguém o
  // executava, e copiava os agentes greenfield por cima de um workspace
  // brownfield sem a adaptação do host.
  it("helyx.syncTemplate não é mais registrado (G5 / H-GAP-05)", () => {
    expect(registered).not.toContain(`${BRAND.commandPrefix}.syncTemplate`);
    expect(declared).not.toContain(`${BRAND.commandPrefix}.syncTemplate`);
    expect(referenced).not.toContain(`${BRAND.commandPrefix}.syncTemplate`);
  });

  // F2.1 (ADR-0015): o dashboard do portal privado saiu da v1.
  it("helyx.openDashboard não é mais declarado nem registrado (portal fora da v1)", () => {
    expect(declared).not.toContain(`${BRAND.commandPrefix}.openDashboard`);
    expect(registered).not.toContain(`${BRAND.commandPrefix}.openDashboard`);
  });

  it("nenhum comando registrado fica sem declaração e sem referência (órfão)", () => {
    expect(registered.filter((id) => !declared.includes(id) && !referenced.includes(id))).toEqual([]);
  });

  it("todo `runCommand` do webview e do catálogo de atalhos usa id `helyx.*` registrado (allowlist do runCommandHandler)", () => {
    const fromWebview = webviewFiles.flatMap((f) => objectPropertyLiterals(f, "command")).map((r) => r.value);
    const fromCatalog = objectPropertyLiterals(path.join(REPO_ROOT, "src/data/shortcuts-catalog.ts"), "command").map((r) => r.value);
    const all = uniqSorted([...fromWebview, ...fromCatalog]);
    // F4.2: os estados vazios do Cockpit (sem pasta, sem config) oferecem o assistente, comando que já existia e já era registrado.
    expect(toGoldenBrand(all)).toEqual(["helyx.initializeDeliveryKit", "helyx.migrateKit", "helyx.revealArtifacts", "helyx.syncRepos"]);
    expect(all.filter((id) => !registered.includes(id))).toEqual([]);
  });
});

describe("contrato — identificadores de contributes (marca, participante de chat, views, settings)", () => {
  it("snapshot dos identificadores públicos de package.json (activationEvents, chatParticipants, views, viewsWelcome, viewsContainers, menus, icons, configuration)", () => {
    const { contributes } = pkg;
    const configuration = Object.fromEntries(
      Object.entries(contributes.configuration?.properties ?? {}).map(([key, v]) => [
        key,
        { type: v.type, default: v.default, ...(v.enum ? { enum: v.enum } : {}) },
      ])
    );
    expect({
      activationEvents: pkg.activationEvents,
      chatParticipants: contributes.chatParticipants,
      views: contributes.views,
      viewsWelcome: contributes.viewsWelcome,
      viewsContainers: contributes.viewsContainers,
      menus: contributes.menus,
      icons: Object.keys(contributes.icons ?? {}),
      configuration,
    }).toMatchSnapshot();
  });

  // H-BUG-23, corrigido na F3.7: as 3 slash commands declaradas não eram
  // tratadas (o turno nunca lia `request.command`). Efeito runtime em CH1.
  it("REGRESSÃO: toda slash command declarada do participante (status/nova/continuar) é tratada pelo turno do chat (H-BUG-23)", () => {
    const names = (pkg.contributes.chatParticipants?.[0]?.commands ?? []).map((c) => c.name);
    expect(names).toEqual(["status", "nova", "continuar"]);
    const turn = fs.readFileSync(path.join(REPO_ROOT, "src/chat/ConciergeTurn.ts"), "utf-8");
    expect(turn).toMatch(/request\.command/);
    for (const name of names) expect(turn, name).toContain(`case "${name}":`);
  });
});
