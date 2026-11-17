import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { CatalogApp } from "./catalog/CatalogApp";

/**
 * Entrada do catálogo do DS v2 (catalog.html, só no vite.config.mock.ts).
 * Fora do VS Code: não marca o host nem precisa de acquireVsCodeApi; o
 * design system não fala com o host.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CatalogApp />
  </StrictMode>,
);
