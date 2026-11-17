import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { goldenBrandSnapshotSerializer } from "../../tests/golden/lib/brand";
import { SCRIPTS, bootFor, loadSchemas, play } from "./support/wizardScripts";

expect.addSnapshotSerializer(goldenBrandSnapshotSerializer);

/**
 * A tela do Wizard a cada ação dos roteiros de `support/wizardScripts.tsx`: a
 * tela gravada com setState, o rótulo do passo, o título e o estado dos botões
 * (o desabilitado inclui o `aria-disabled`, que é como o design system diz que
 * "Continuar" está bloqueado). A jornada redesenhada da F4.3 regravou este
 * snapshot de propósito, em commit de visual próprio. As mensagens de cada
 * ação estão em `wizard-parity.test.tsx`.
 */

beforeAll(loadSchemas);
afterEach(() => {
  document.body.innerHTML = "";
});

describe("tela do Wizard a cada ação dos roteiros", () => {
  it.each(Object.keys(SCRIPTS))("%s", (name) => {
    const { brownfield, actions } = SCRIPTS[name]!;
    const observed = play(bootFor(brownfield), actions);
    expect(observed.map(({ posted: _posted, ...screen }) => screen), "tela").toMatchSnapshot("tela");
  });
});
