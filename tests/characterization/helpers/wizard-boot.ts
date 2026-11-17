/**
 * wizard-boot.ts — lê o bootstrap do Wizard no HTML do host: o bloco
 * `<script type="application/json" id="hx-boot">` (desde o W2 da F3.10), que o
 * app React do webview lê ao abrir.
 */

import type { WizardBoot } from "../../../src/shared/wizard-protocol";

/** Texto cru do bloco, como o `document.getElementById('hx-boot').textContent` do webview o vê. */
export function bootText(html: string): string {
  const m = html.match(/<script type="application\/json" id="hx-boot">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("nenhum <script type=\"application/json\" id=\"hx-boot\"> no HTML do Wizard");
  return m[1]!;
}

export function readBoot(html: string): WizardBoot {
  return JSON.parse(bootText(html)) as WizardBoot;
}
