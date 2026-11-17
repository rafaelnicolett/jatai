// Efeito colateral: instala window.acquireVsCodeApi ANTES de qualquer outro
// import avaliar store/vscodeApi.ts. Import estático de módulos ES roda em
// ordem de aparição — por isso este import vem literalmente primeiro.
import "./mock/mockBootstrap";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { bootstrapCockpitStore } from "./store/bootstrap";
import { ShellRoot } from "./apps/cockpit/ShellRoot";

bootstrapCockpitStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShellRoot />
  </StrictMode>
);
