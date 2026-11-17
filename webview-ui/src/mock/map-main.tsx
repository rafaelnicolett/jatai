// Efeito colateral: instala window.acquireVsCodeApi e lê os parâmetros ANTES de qualquer outro import
// avaliar store/vscodeApi.ts. Import estático de módulos ES roda em ordem de aparição: este vem primeiro.
import { params } from "./colmeiaBootstrap";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { bootstrapCockpitStore } from "../store/bootstrap";
import { cockpitStore } from "../store/CockpitStore";
import { ShellRoot } from "../apps/cockpit/ShellRoot";
import { HiveMapView } from "../apps/cockpit/map/HiveMapView";

/**
 * Entrada do mapa da colmeia no navegador (`mapa.html`, só no
 * `vite.config.mock.ts`): o Cockpit de verdade (`ShellRoot`) com a história
 * do mapa rodando, para ver o fluxo inteiro (botão "Mapa" na barra superior,
 * a cena ao vivo e a volta ao Cockpit). O cenário de estresse monta só o
 * mapa, com o limite de abelhas por ilha levantado para 30.
 */
bootstrapCockpitStore();
if (params.view === "mapa") cockpitStore.setView("map");

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    {params.scenario === "estresse" ? (
      <HiveMapView scene={{ maxBeesPerIsland: 30 }} onBack={() => undefined} onOpenDecision={() => undefined} onSelectInitiative={() => undefined} />
    ) : (
      <ShellRoot />
    )}
  </StrictMode>
);
