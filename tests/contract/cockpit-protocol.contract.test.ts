import { describe, it, expect } from "vitest";
import * as path from "path";
import { buildActionRegistry } from "../../src/views/actions/registry";
import {
  REPO_ROOT,
  caseLabelsIn,
  equalityLiteralsIn,
  listSourceFiles,
  messageTypesInProperty,
  messageTypesSentVia,
  stringLiterals,
  unionTypeDiscriminants,
  uniqSorted,
} from "./helpers/source-scan";

/**
 * Exaustividade do protocolo host ↔ Cockpit — F0.4 (lane B),
 * arquitetura-e-refatoracao.md §7.1 ("Protocolo do Cockpit:
 * `shared/cockpit-protocol.ts:144-196` → teste de tipo + exaustividade").
 *
 * Behavior pinned on 2026-11-14. Modifying this test requires reviewing if
 * change is intentional.
 *
 * Quatro conjuntos, cada um extraído do AST (não de grep):
 * - DECLARADO: discriminantes `type` das uniões `WebviewToHostMessage` /
 *   `HostToWebviewMessage` em `src/shared/cockpit-protocol.ts`;
 * - TRATADO NO HOST: chaves do `buildActionRegistry()` (runtime) + os dois
 *   tipos que `CockpitNextController._handleMessage` trata inline;
 * - EMITIDO PELO WEBVIEW: `postMessage({ type: … })` em `webview-ui/src`
 *   (sem testes nem `mock/`) mais as mensagens que `view/emptyStates.ts`
 *   guarda como dado (`message: { type }`, enviadas pelo ShellRoot);
 * - EMITIDO PELO HOST / TRATADO NO WEBVIEW: `_post({ type: … })` do
 *   controller e os `case` de `CockpitStore.handleMessage`.
 *
 * Os handlers mortos (G4 / H-GAP-04) e o `shell/command-ack` nunca enviado
 * (H-BUG-40) ficam PINADOS como `@known-bug` — a decisão de remover ou religar
 * é dos passos 3.7/3.8 (CK2–CK4, F3.8/F3.9), não deste backfill.
 */

const PROTOCOL = path.join(REPO_ROOT, "src/shared/cockpit-protocol.ts");
const CONTROLLER = path.join(REPO_ROOT, "src/views/CockpitNextController.ts");
const STORE = path.join(REPO_ROOT, "webview-ui/src/store/CockpitStore.ts");

const declaredToHost = unionTypeDiscriminants(PROTOCOL, "WebviewToHostMessage");
const declaredToWebview = unionTypeDiscriminants(PROTOCOL, "HostToWebviewMessage");

const registryTypes = [...buildActionRegistry().keys()];
const inlineHostTypes = equalityLiteralsIn(CONTROLLER, "_handleMessage", "msg.type");
const handledByHost = uniqSorted([...registryTypes, ...inlineHostTypes]);

// O webview tem dois apps desde o W3 da F3.10 (ADR-0019): o do Wizard fala o protocolo do Wizard
// (src/shared/wizard-protocol.ts, coberto por wizard-protocol.contract.test.ts), não o do Cockpit.
const WIZARD_APP = path.join(REPO_ROOT, "webview-ui/src/apps/wizard") + path.sep;
// As ações dos estados vazios (`view/emptyStates.ts`, G9) guardam a mensagem como dado
// (`message: { type }`) e o ShellRoot a envia com `postMessage(action.message)`: a varredura
// de literais passados direto a `postMessage` não as vê, então o modelo entra por aqui.
const EMPTY_STATES = path.join(REPO_ROOT, "webview-ui/src/apps/cockpit/view/emptyStates.ts");
const webviewEmitters = [
  ...listSourceFiles("webview-ui/src")
    .filter((f) => !f.startsWith(WIZARD_APP))
    .flatMap((f) => messageTypesSentVia(f, "postMessage")),
  ...messageTypesInProperty(EMPTY_STATES, "message"),
];
const emittedByWebview = uniqSorted(webviewEmitters.map((e) => e.value));

const emittedByHost = uniqSorted(messageTypesSentVia(CONTROLLER, "_post").map((e) => e.value));
const handledByWebview = uniqSorted(caseLabelsIn(STORE, "handleMessage"));

describe("contrato — protocolo Cockpit, webview → host", () => {
  // F4.2 (parte 2, ADR-0024 e ADR-0020): `gates/approve` e `decisions/record` entram, só de forma aditiva.
  it("snapshot das 26 mensagens declaradas em WebviewToHostMessage (ordem de declaração)", () => {
    expect(declaredToHost).toMatchSnapshot();
    expect(declaredToHost).toHaveLength(26);
  });

  it("registry de ações tem 24 handlers, um por tipo (sem duplicata)", () => {
    expect(registryTypes).toHaveLength(24);
    expect(new Set(registryTypes).size).toBe(24);
  });

  // F2.1 (ADR-0015): portal e dashboard privados saíram da v1. Contrato do
  // protocolo alterado por essa decisão: `openPortal` deixa de existir.
  it("openPortal saiu do protocolo: não é declarado, não tem handler e o webview não o emite", () => {
    expect(declaredToHost).not.toContain("openPortal");
    expect(registryTypes).not.toContain("openPortal");
    expect(emittedByWebview).not.toContain("openPortal");
  });

  it("o controller trata inline só o handshake: shell/ready e shell/requestSnapshot", () => {
    expect(uniqSorted(inlineHostTypes)).toEqual(["shell/ready", "shell/requestSnapshot"]);
  });

  it("exaustivo nos dois sentidos: todo tipo declarado tem handler no host, e todo handler corresponde a um tipo declarado", () => {
    expect(handledByHost).toEqual(uniqSorted(declaredToHost));
  });

  it("todo tipo que o webview de fato emite está declarado no protocolo", () => {
    expect(emittedByWebview.filter((t) => !declaredToHost.includes(t))).toEqual([]);
  });

  it("snapshot do que o webview emite hoje (18 tipos)", () => {
    expect(emittedByWebview).toMatchSnapshot();
  });

  // Behavior pinned on 2026-11-14 — G4 / H-GAP-04 ("10 de 23 handlers do
  // protocolo host↔webview nunca recebem mensagem"). Na F4.2 o painel de decisão
  // religou 3: `toggleGuardRail` e `toggleFoundationGuardRail` (o checklist humano
  // das fases) e `openArtifactDiff` (o "ver mudanças" dos artefatos de uma tarefa).
  // Os 7 que sobram continuam sem emissor e SEGUEM pinados: removê-los muda o
  // contrato do protocolo e pede uma ADR que o titular ainda não decidiu.
  //   - `markPhaseDone`: contorna o checklist obrigatório da fase, que é justamente
  //     o que o G3 quer garantir; o caminho do gate é `approveAndAdvancePhase`;
  //   - `injectPrompt`, `openWizard`, `openImportWizard`, `skipTutorial`,
  //     `resetTutorial` e `guardRailAction`: sem emissor desde antes da missão.
  // E um oitavo entrou na lista quando a tela antiga saiu (F4.2): `approveGateD1`.
  // O D1 agora é decidido no painel de decisão, por `gates/approve` (com a regra de
  // fechamento do gate); o alias do host segue registrado e passa pelos mesmos
  // `StateCommands`, mas nenhuma tela o emite mais.
  it("@known-bug: 8 handlers do registry nunca recebem mensagem do webview (G4 / H-GAP-04)", () => {
    const dead = registryTypes.filter((t) => !emittedByWebview.includes(t)).sort();
    expect(dead).toEqual([
      "approveGateD1",
      "guardRailAction",
      "injectPrompt",
      "markPhaseDone",
      "openImportWizard",
      "openWizard",
      "resetTutorial",
      "skipTutorial",
    ]);
  });
});

describe("contrato — protocolo Cockpit, host → webview", () => {
  it("snapshot das 7 mensagens declaradas em HostToWebviewMessage", () => {
    expect(declaredToWebview).toEqual([
      "shell/snapshot",
      "shell/runEvents-append",
      "shell/toast",
      "shell/degraded",
      "shell/command-ack",
      "gates/approve-result",
      "decisions/record-result",
    ]);
  });

  it("exaustivo: CockpitStore.handleMessage trata exatamente os 7 tipos declarados", () => {
    expect(handledByWebview).toEqual(uniqSorted(declaredToWebview));
  });

  it("todo tipo que o host posta está declarado", () => {
    expect(emittedByHost.filter((t) => !declaredToWebview.includes(t))).toEqual([]);
    expect(emittedByHost).toEqual(["shell/degraded", "shell/runEvents-append", "shell/snapshot", "shell/toast"]);
  });

  // F4.2: as respostas das ações (`ctx.reply`) também são tipos declarados. Elas moram em gateActions.ts.
  it("todo tipo que as ações do host respondem (ctx.reply) está declarado", () => {
    const replied = uniqSorted(
      stringLiterals(path.join(REPO_ROOT, "src/views/actions/gateActions.ts"))
        .map((l) => l.value)
        .filter((v) => v.endsWith("-result"))
    );
    expect(replied).toEqual(["decisions/record-result", "gates/approve-result"]);
    expect(replied.filter((t) => !declaredToWebview.includes(t))).toEqual([]);
  });

  // Behavior pinned on 2026-11-14 — H-BUG-40 / H-GAP-04: o tipo existe no
  // contrato e o webview o trata ("reservado para fases futuras"), mas o host
  // nunca o envia — por isso um "Aprovar" recusado deixa o botão travado.
  it("@known-bug: shell/command-ack é declarado e tratado pelo webview, mas o host nunca o envia (H-BUG-40 / H-GAP-04)", () => {
    expect(declaredToWebview).toContain("shell/command-ack");
    expect(handledByWebview).toContain("shell/command-ack");
    expect(emittedByHost).not.toContain("shell/command-ack");
  });
});
