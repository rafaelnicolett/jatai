import { describe, it, expect } from "vitest";
import { getPersistedState, setPersistedState } from "../src/store/vscodeApi";
import { DEFAULT_PERSISTED_STATE, type CockpitTab, type PersistedUIState } from "../src/store/PersistedUIState";

/**
 * Onda 5b — `getPersistedState` ganhou uma segunda validação (`splitTab`),
 * ao lado da que já existia pra `activeTab` (aba de build antiga que não
 * existe mais). Cobre os dois motivos que zeram `splitTab`: aba inválida, e
 * aba igual à `activeTab` (dividir uma view com ela mesma).
 *
 * Wave-3 de `mod-cockpit-flow-model` (shell simplificada, ver
 * PersistedUIState.ts) removeu mural/dashboard/timeline/graph/learning —
 * primeiro de `ALL_COCKPIT_TABS` (item 3.6), depois do próprio `CockpitTab`
 * (item 3.7, componentes apagados de vez). Viraram exatamente o caso "aba
 * de build antiga que não existe mais" que este saneamento já existia pra
 * cobrir — só que agora nem o TYPE reconhece esses valores, então o teste
 * abaixo simula uma sessão persistida de uma build anterior via
 * `as unknown as CockpitTab` (nunca viria assim de dentro do app hoje).
 */
describe("getPersistedState — saneamento de aba persistida", () => {
  it("activeTab válida e splitTab válida (diferente): sobrevivem intactas", () => {
    setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: "live-progress", splitTab: "operations" });
    const state = getPersistedState();
    expect(state.activeTab).toBe("live-progress");
    expect(state.splitTab).toBe("operations");
  });

  it("activeTab desconhecida (nunca existiu): cai pro default", () => {
    setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: "home" as PersistedUIState["activeTab"] });
    expect(getPersistedState().activeTab).toBe(DEFAULT_PERSISTED_STATE.activeTab);
  });

  it.each(["mural", "dashboard", "timeline", "graph", "learning"] as const)(
    "regressão wave-3: activeTab '%s' (aba e componente removidos de vez no item 3.7) cai pro default, não quebra",
    (oldTab) => {
      setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: oldTab as unknown as CockpitTab });
      expect(getPersistedState().activeTab).toBe(DEFAULT_PERSISTED_STATE.activeTab);
    }
  );

  it("splitTab desconhecida: vira null, activeTab não é afetada", () => {
    setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: "operations", splitTab: "old-analytics-tab" as PersistedUIState["splitTab"] });
    const state = getPersistedState();
    expect(state.activeTab).toBe("operations");
    expect(state.splitTab).toBeNull();
  });

  it("splitTab igual à activeTab (estado inconsistente): vira null em vez de dividir uma view com ela mesma", () => {
    setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: "live-progress", splitTab: "live-progress" });
    expect(getPersistedState().splitTab).toBeNull();
  });

  it("splitTab ausente (nunca dividiu): fica null, não undefined — consumidor não precisa tratar os dois", () => {
    setPersistedState({ ...DEFAULT_PERSISTED_STATE, activeTab: "live-progress" });
    expect(getPersistedState().splitTab).toBeNull();
  });
});
