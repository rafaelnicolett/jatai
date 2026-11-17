import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Build do Wizard em React (F3.10, W3 da ADR-0019): mesmo pacote, mesmo
 * design system e mesmos aliases do Cockpit, em um build próprio que soma
 * `wizard.js` e `assets/wizard.css` ao `dist/webview/` que o build do
 * Cockpit acabou de gerar (`emptyOutDir: false`, roda depois dele no
 * `npm run build`). Separado de propósito: um build com as duas entradas
 * faria o Rollup tirar React e o design system para chunks compartilhados, e
 * o `main.js` do Cockpit deixaria de ser um arquivo só. Assim o bundle do
 * Cockpit não muda. Nomes fixos, sem hash, como o do Cockpit: o
 * `WizardController` aponta para eles.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../src/shared", import.meta.url)),
      "@data": fileURLToPath(new URL("../src/data/webview-safe.ts", import.meta.url)),
    },
  },
  // Nada de public/ aqui: o que houver lá é do build do Cockpit.
  publicDir: false,
  build: {
    outDir: "../dist/webview",
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/apps/wizard/main.tsx", import.meta.url)),
      output: {
        entryFileNames: "wizard.js",
        chunkFileNames: "assets/wizard-[name].js",
        assetFileNames: "assets/wizard[extname]",
      },
    },
  },
});
