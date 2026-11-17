/**
 * useCockpitSelector.ts
 *
 * Hook de assinatura por fatia — cada componente só re-renderiza quando o
 * pedaço do estado que ele pediu de fato muda, não a cada mensagem que chega.
 * `useSyncExternalStoreWithSelector` é um shim OFICIAL do próprio React (não
 * é uma lib de estado) — mantém a decisão de "store feito à mão", só adiciona
 * a parte de seleção fina que `useSyncExternalStore` puro não tem.
 */

import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";
import { cockpitStore, type CockpitStoreState } from "./CockpitStore";

export function useCockpitSelector<T>(
  selector: (state: CockpitStoreState) => T,
  isEqual?: (a: T, b: T) => boolean
): T {
  return useSyncExternalStoreWithSelector(
    cockpitStore.subscribe,
    cockpitStore.getSnapshot,
    cockpitStore.getSnapshot,
    selector,
    isEqual
  );
}

/** Leitura do estado inteiro — para os poucos consumidores (o Shell) que precisam de tudo. */
export function useCockpitState(): CockpitStoreState {
  return useCockpitSelector((s) => s);
}
