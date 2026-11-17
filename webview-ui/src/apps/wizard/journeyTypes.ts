/**
 * journeyTypes.ts — os tipos que o modelo da jornada (`journey.ts`) e os
 * textos (`journeyCopy.ts`) compartilham. Ficam num módulo à parte para os
 * dois não dependerem um do outro em círculo.
 */

export type Mode = "greenfield" | "brownfield";

export type ScreenId = "abertura" | "modo" | "harness" | "projeto" | "dominio" | "backend" | "frontend" | "infra" | "local" | "pasta" | "repositorios" | "maturidade" | "revisao";
