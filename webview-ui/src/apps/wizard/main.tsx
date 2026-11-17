import { createRoot } from "react-dom/client";
import type { HostToWizardMessage } from "@shared/wizard-protocol";
import "../../index.css";
import { WizardApp } from "./WizardApp";
import { WizardFlow } from "./WizardFlow";
import { createVsCodeBridge, readBoot } from "./bridge";
import { markVsCodeHost } from "../../design-system/tokens/host";

/**
 * Entrada do Wizard (F3.10, ADR-0019): o app React que substituiu o Wizard
 * legado no W6. Lê o bootstrap que o host escreve (`#hx-boot`) e fala o
 * protocolo de `src/shared/wizard-protocol.ts`.
 *
 * Sem `StrictMode` de propósito: o fluxo manda mensagens ao host ao entrar
 * num passo, e o fluxo é criado aqui, fora do React, uma vez só.
 */
markVsCodeHost();
const flow = new WizardFlow(readBoot(document), createVsCodeBridge());
window.addEventListener("message", (event: MessageEvent<HostToWizardMessage>) => flow.receive(event.data));
flow.start();

createRoot(document.getElementById("root")!).render(<WizardApp flow={flow} />);
