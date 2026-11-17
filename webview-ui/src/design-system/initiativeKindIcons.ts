import { Rocket, Bug, Wand2, Compass, type LucideIcon } from "lucide-react";
import type { InitiativeKind } from "@data";

/**
 * Ícone por tipo de iniciativa (wave-3, mockup "Cockpit Progresso Redesign").
 * Usado pelo combo de iniciativas do Cockpit e pelo combo de Ondas da vista
 * por ondas (`ModernizationProgress`). Vivia no `ContextBar`; veio para o
 * design system na F3.9 porque uma feature não pode importar o shell do app.
 */
export const KIND_ICON: Record<InitiativeKind, LucideIcon> = {
  feature: Rocket,
  hotfix: Bug,
  modernization: Wand2,
  foundation: Compass,
};
