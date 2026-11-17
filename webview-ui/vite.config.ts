import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Builda para `../dist/webview` — FORA da raiz deste pacote, dentro do
 * `dist/` da extensão, onde `localResourceRoots`/`asWebviewUri` já sabem
 * procurar (ver CockpitNextController.ts). Nomes de arquivo fixos, sem hash:
 * o controller referencia um caminho fixo (`dist/webview/main.js`), então não
 * há necessidade de parsear manifest.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../src/shared", import.meta.url)),
      // Único ponto de import para lógica PURA reaproveitada do host (buildFoundationPlan,
      // groupPlanByRepo, recentEventsForRepo, FOUNDATION_CONTRACTS...) — ver src/data/webview-safe.ts.
      "@data": fileURLToPath(new URL("../src/data/webview-safe.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
