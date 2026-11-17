import { VisuallyHidden } from "../../../design-system/primitives";

/** A região que o leitor de tela escuta (ver `useAnnouncer`). Fica sempre montada: uma região viva precisa existir antes de o texto mudar. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-live-region="cockpit">
      <VisuallyHidden>{message}</VisuallyHidden>
    </div>
  );
}
