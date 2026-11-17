import {
  Wrench,
  Boxes,
  Network,
  Layers,
  BookOpen,
  Microscope,
  Palette,
  ShieldCheck,
  TrendingDown,
  Briefcase,
  Mic,
  Flag,
  Link2,
  CircleHelp,
  Lightbulb,
  ClipboardList,
  PenTool,
  ListChecks,
  CalendarDays,
  PlayCircle,
  Server,
  AppWindow,
  SearchCode,
  Ship,
  Tag,
  Activity,
  Siren,
  type LucideIcon,
} from "lucide-react";

/**
 * `FOUNDATION_CONTRACTS[].icon` é emoji — legado, compartilhado com o
 * Cockpit antigo, que renderiza esse campo direto como texto. Não mudamos o
 * dado (quebraria o Cockpit legado); mapeamos por `phaseId` aqui, só na
 * camada de apresentação do Cockpit Next, pra usar ícone de traço de verdade
 * em vez de emoji.
 */
const PHASE_ICON_BY_ID: Record<string, LucideIcon> = {
  "tech-stack": Wrench,
  "arch": Boxes,
  "dependency-graph": Network,
  "domain": Layers,
  "wiki-synthesis": BookOpen,
  "coding-archaeology": Microscope,
  "design": Palette,
  "quality": ShieldCheck,
  "debt": TrendingDown,
  "business-context": Briefcase,
  "interview": Mic,
  "baseline": Flag,
  "skill-linking": Link2,
  // Delivery (Upstream/Downstream/Operation) — "domain" e "architecture"
  // reaproveitam Layers/Boxes já usados acima, de propósito (mesmo tema).
  "business": Lightbulb,
  "product": ClipboardList,
  "ux-design": PenTool,
  "bdd": ListChecks,
  "architecture": Boxes,
  "sprint-plan": CalendarDays,
  "sprint-run": PlayCircle,
  "backend": Server,
  "frontend": AppWindow,
  "reviewer": SearchCode,
  "devops": Ship,
  "release": Tag,
  "observability": Activity,
  "incident": Siren,
  "sustain": Wrench,
};

export function phaseIconFor(phaseId: string): LucideIcon {
  return PHASE_ICON_BY_ID[phaseId] ?? CircleHelp;
}
