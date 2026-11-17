/**
 * bootstrap.ts
 *
 * Liga o `CockpitStore` ao mundo real: escuta `postMessage` do host e envia
 * o handshake inicial (`shell/ready`). Chamado uma vez em `main.tsx`.
 */

import type { HostToWebviewMessage } from "@shared/cockpit-protocol";
import { cockpitStore } from "./CockpitStore";
import { postMessage } from "./vscodeApi";

export function bootstrapCockpitStore(): () => void {
  const onMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
    cockpitStore.handleMessage(event.data);
  };
  window.addEventListener("message", onMessage);
  postMessage({ type: "shell/ready" });
  return () => window.removeEventListener("message", onMessage);
}
