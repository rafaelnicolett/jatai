import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Região viva do Cockpit (DS v2 §4.0, política de anúncios): `aria-live`
 * educado só para o que merece ser dito (nova decisão, decisão registrada),
 * nunca a cada tique. O texto some depois de `clearAfterMs`, para repetir o
 * mesmo anúncio mais tarde (uma decisão nova com o mesmo título) voltar a ser lido.
 */
export function useAnnouncer(clearAfterMs = 6_000): { message: string; announce: (text: string) => void } {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback(
    (text: string): void => {
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), clearAfterMs);
    },
    [clearAfterMs]
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, announce };
}
