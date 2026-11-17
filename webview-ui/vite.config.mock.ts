import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Build SEPARADO só pro sanity check visual — nunca roda como parte de
 * `npm run build`/`package` da extensão, nunca escreve em `dist/webview`
 * (a pasta que o CockpitNextController de verdade serve). Existe só pra
 * gerar um HTML autocontido (JS+CSS inline) publicável como Artifact.
 *
 * Quatro páginas: `mock.html` (o Cockpit com o snapshot do mock),
 * `catalog.html` (catálogo do DS v2), `wizard.html` (a jornada do Wizard,
 * ver os parâmetros em `src/mock/wizard-main.tsx`) e `mapa.html` (o mapa da
 * colmeia com a história rodando, ver `src/mock/colmeiaParams.ts`). Para ver sem
 * build: `npx vite --config vite.config.mock.ts` e abrir /catalog.html,
 * /wizard.html ou /mapa.html.
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
  build: {
    outDir: "mock-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        mock: fileURLToPath(new URL("./mock.html", import.meta.url)),
        // Catálogo vivo do DS v2 (F4.2): tokens e componentes, com troca de tema.
        catalog: fileURLToPath(new URL("./catalog.html", import.meta.url)),
        // Wizard (F4.3): a jornada com um host de mentira, para ver e capturar cada passo nos temas.
        wizard: fileURLToPath(new URL("./wizard.html", import.meta.url)),
        // O mapa da colmeia (F5.3) com a história rodando: o Cockpit de verdade e o botão "Mapa".
        mapa: fileURLToPath(new URL("./mapa.html", import.meta.url)),
      },
    },
  },
});
