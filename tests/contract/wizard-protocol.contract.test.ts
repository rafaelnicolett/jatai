import { describe, it, expect } from "vitest";
import * as path from "path";
import { REPO_ROOT, callsEndingWith, caseLabelsIn, listSourceFiles, messageTypesSentVia, unionTypeDiscriminants, uniqSorted } from "./helpers/source-scan";
import { toGoldenBrand } from "../golden/lib/brand";

/**
 * Exaustividade do protocolo host ↔ Wizard — F0.4 (lane B),
 * arquitetura-e-refatoracao.md §3.2 ("Protocolo host ↔ Wizard (contrato a
 * preservar)") e §2.2 passo WZ1 ("todo postMessage do script existe na união").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Lados extraídos (AST):
 * - união `WizardMessage` de `src/shared/wizard-protocol.ts` (desde o WZ1 da
 *   F3.10);
 * - host: `case` de `WizardSession.handle`, `postMessage({ type: … })` e
 *   `executeCommand` da sessão (desde o W1; antes, `_handleMessage` do
 *   `WizardController`);
 * - webview: o app React do Wizard (`webview-ui/src/apps/wizard`), desde o
 *   W6. Até o W5 o lado do webview era o script legado, lido do template
 *   literal (até o W1) e depois do asset `wizard.js` (W2 a W5); no W3 e no W4
 *   este contrato e o teste de paridade provaram que o app React emite e
 *   trata os mesmos tipos, na mesma ordem.
 *
 * Os tipos pinados aqui são os mesmos de antes do W6: o protocolo não mudou.
 * A sequência de mensagens, roteiro a roteiro, está em
 * `webview-ui/tests/wizard-parity.test.tsx`; a tabela message-in →
 * effect-out do host, em `tests/characterization/wizard-controller…` (W0).
 */

const WIZARD = path.join(REPO_ROOT, "src/wizard/WizardController.ts");
/** WZ1 (F3.10): a união saiu do controller para o protocolo compartilhado com o webview. */
const PROTOCOL = path.join(REPO_ROOT, "src/shared/wizard-protocol.ts");
/** W1 (F3.10): despacho, postMessage e barramento de comandos saíram do controller para a sessão. */
const SESSION = path.join(REPO_ROOT, "src/wizard/WizardSession.ts");
/** W6 (F3.10): o webview do Wizard é o app React. */
const APP_DIR = "webview-ui/src/apps/wizard";
const FLOW = path.join(REPO_ROOT, APP_DIR, "WizardFlow.ts");

const declaredToHost = unionTypeDiscriminants(PROTOCOL, "WizardMessage");
const declaredToWebview = unionTypeDiscriminants(PROTOCOL, "HostToWizardMessage");
const handledByHost = caseLabelsIn(SESSION, "handle");
const emittedByHost = uniqSorted(messageTypesSentVia(SESSION, "postMessage").map((e) => e.value));
const appFiles = listSourceFiles(APP_DIR);
const emittedByWebview = uniqSorted(appFiles.flatMap((f) => messageTypesSentVia(f, "postMessage")).map((e) => e.value));
const handledByWebview = uniqSorted(caseLabelsIn(FLOW, "receive"));

describe("contrato — protocolo Wizard, webview → host", () => {
  // F4.3 (GAP-20): `switchToGreenfield` é a única mensagem nova do protocolo até aqui, aditiva e
  // simétrica a `switchToBrownfield`: sem ela, o brownfield não tinha como voltar à escolha do modo.
  it("união WizardMessage declara 9 tipos (ordem de declaração; o 8º e o 9º são aditivos da F4.3)", () => {
    expect(declaredToHost).toEqual(["stepUpdate", "pickFolder", "fetchTemplate", "submit", "cancel", "importRepo", "switchToBrownfield", "switchToGreenfield", "openCockpit"]);
  });

  it("exaustivo: tudo que o webview emite tem `case` no host, e todo `case` do host é emitido pelo webview", () => {
    expect(emittedByWebview).toEqual(uniqSorted(handledByHost));
    expect(emittedByWebview).toEqual(["cancel", "fetchTemplate", "openCockpit", "pickFolder", "stepUpdate", "submit", "switchToBrownfield", "switchToGreenfield"]);
  });

  it("tudo que o webview emite e tudo que o host trata está declarado na união", () => {
    expect(emittedByWebview.filter((t) => !declaredToHost.includes(t))).toEqual([]);
    expect(handledByHost.filter((t) => !declaredToHost.includes(t))).toEqual([]);
  });

  // Behavior pinned on 2026-11-14 — arquitetura §1.7 / §3.2 e H-GAP-20:
  // `importRepo` está na união, mas nenhum emissor e nenhum `case` existem.
  it("@known-bug: `importRepo` é declarado em WizardMessage mas nunca emitido nem tratado (§1.7 / H-GAP-20)", () => {
    expect(declaredToHost).toContain("importRepo");
    expect(emittedByWebview).not.toContain("importRepo");
    expect(handledByHost).not.toContain("importRepo");
  });
});

describe("contrato — protocolo Wizard, host → webview", () => {
  it("o host posta exatamente 5 tipos, os 5 da união HostToWizardMessage (o `installed` é aditivo da F4.3)", () => {
    expect(emittedByHost).toEqual(["folderPicked", "generationError", "installed", "templateManifest", "validationError"]);
    expect(uniqSorted(declaredToWebview)).toEqual(emittedByHost);
  });

  it("todo tipo que o host posta é tratado pelo webview, e o webview não trata tipo que o host não posta", () => {
    expect(handledByWebview).toEqual(emittedByHost);
  });

  // H-GAP-20: o script legado tratava `templateError`, que o host nunca
  // enviou. O app React (W6) não trata; o tipo continua fora da união.
  it("`templateError` não existe em nenhum dos lados (o handler morto saiu com o script legado no W6)", () => {
    expect(declaredToWebview).not.toContain("templateError");
    expect(emittedByHost).not.toContain("templateError");
    expect(handledByWebview).not.toContain("templateError");
  });
});

describe("contrato — Wizard, contratos implícitos (§3.2 'Outros contratos implícitos')", () => {
  // F4.3: o botão "Abrir o Cockpit" do passo "Pronto" é o único comando público que o Wizard executa.
  it("barramento Wizard → gerador: os 2 comandos internos e, no passo 'Pronto', o de abrir o Cockpit", () => {
    const commands = uniqSorted(callsEndingWith(SESSION, "executeCommand").map((c) => c.value.args[0] ?? "<dinâmico>"));
    // Desde o W1, o controller só repassa o que a sessão pede (a porta `executeCommand`): nenhum id próprio.
    expect(callsEndingWith(WIZARD, "executeCommand").map((c) => c.value.args[0] ?? "<dinâmico>")).toEqual(["<dinâmico>"]);
    expect(toGoldenBrand(commands)).toEqual(["helyx._generateStructure", "helyx._installAgentStructure", "helyx.openCockpitNext"]);
  });

  // GAP-20 (F4.3): antes o webview gravava `setState({ step })` e nunca lia `getState()`, e o passo
  // se perdia ao recarregar. Agora o fluxo lê o passo salvo ao abrir.
  it("REGRESSÃO: persistência de UI: o webview grava `setState({ step })` e lê `getState()` ao abrir (GAP-20)", () => {
    const setStateArgs = appFiles.flatMap((f) => callsEndingWith(f, "setState").map((c) => c.value.callee));
    expect(setStateArgs.length).toBeGreaterThan(0);
    const getState = appFiles.flatMap((f) => callsEndingWith(f, "getState"));
    expect(getState.length).toBeGreaterThan(0);
  });
});
