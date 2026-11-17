import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { goldenBrandSnapshotSerializer } from "../../tests/golden/lib/brand";
import { SCRIPTS, bootFor, loadSchemas, play } from "./support/wizardScripts";

expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * Sequência de mensagens do Wizard, roteiro a roteiro: o app React real
 * dirigido pelos roteiros de `support/wizardScripts.tsx`. Nasceu na paridade
 * com o script legado (W4, F3.10) e segue como a prova de que o Wizard fala o
 * protocolo congelado: este snapshot guarda só as mensagens webview -> host de
 * cada ação. Mudou na F4.3 só por correção de bug (L6, H-BUG-25), por mensagem
 * aditiva (switchToGreenfield) e pela ordem em que a jornada coleta os campos
 * (harness antes do projeto, destino por último): as mensagens são as mesmas.
 * A tela de cada ação está em `wizard-tela.test.tsx`.
 */

beforeAll(loadSchemas);
afterEach(() => {
  document.body.innerHTML = "";
});

describe("paridade de protocolo — Wizard legado × Wizard em React (W4)", () => {
  it.each(Object.keys(SCRIPTS))("%s", (name) => {
    const { brownfield, actions } = SCRIPTS[name]!;
    const observed = play(bootFor(brownfield), actions);
    expect(observed.map(({ action, posted }) => ({ action, posted })), "protocolo").toMatchSnapshot("protocolo");
  });
});
