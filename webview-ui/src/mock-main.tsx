// O polyfill de `acquireVsCodeApi` está no `mock.html` (script clássico, antes
// deste módulo); este import instala o "host" de mentira que o preenche.
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
