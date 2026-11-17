import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { bootstrapCockpitStore } from "./store/bootstrap";
import { ShellRoot } from "./apps/cockpit/ShellRoot";
import { markVsCodeHost } from "./design-system/tokens/host";

markVsCodeHost();
bootstrapCockpitStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShellRoot />
  </StrictMode>
);
