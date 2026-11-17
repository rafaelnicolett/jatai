import { useCallback, useState } from "react";
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { getPersistedState, setPersistedState } from "../../../store/vscodeApi";
import { resolveViewTarget, type ViewTarget } from "./viewTarget";

/**
 * O estado de VISÃO do Cockpit (G15): qual iniciativa (ou a Descoberta) a tela
 * mostra e qual parada o quadro abre. Vive no cliente e sobrevive a recarregar
 * o painel (`vscode.setState`), e NUNCA fala com o host: trocar de visão não
 * muda o `active:` do registro. Tornar uma iniciativa ativa é outra ação, que
 * chama o `switchInitiative` do host.
 *
 * `target` já vem resolvido: uma iniciativa que deixou de existir cai na ativa.
 */
export function useViewState(snapshot: CockpitSnapshot | null) {
  const [wanted, setWanted] = useState<ViewTarget | null>(() => getPersistedState().viewTarget ?? null);
  const [selectedStop, setSelectedStopState] = useState<string | null>(() => getPersistedState().selectedStop ?? null);

  const target = resolveViewTarget(snapshot, wanted);

  const setTarget = useCallback((next: ViewTarget): void => {
    setWanted(next);
    setSelectedStopState(null);
    const { selectedStop: _dropped, ...rest } = getPersistedState();
    void _dropped;
    setPersistedState({ ...rest, viewTarget: next });
  }, []);

  const setSelectedStop = useCallback((key: string): void => {
    setSelectedStopState(key);
    setPersistedState({ ...getPersistedState(), selectedStop: key });
  }, []);

  return { target, setTarget, selectedStop, setSelectedStop };
}
