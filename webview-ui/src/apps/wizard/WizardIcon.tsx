import { Bot, Clock, DatabaseZap, GraduationCap, HeartPulse, Lightbulb, Package, Server, ShoppingCart, Sparkles, Truck, Wrench, type LucideIcon } from "lucide-react";
import s from "./Wizard.module.css";

/**
 * Ícones do schema do Wizard (`icon:*`). Stacks, hosts, bancos e clouds são
 * marcas de terceiros: viram um monograma com a sigla (não o logotipo), como
 * no Wizard legado (F2.1/L14: nada de CDN). O resto vem do `lucide-react`, o
 * pacote de ícones do webview. Um `icon` que não é `icon:*` (emoji ou
 * símbolo) aparece como texto, como no legado.
 */
const MONOGRAMS: Record<string, { text: string; label: string }> = {
  "icon:github": { text: "GH", label: "GitHub" },
  "icon:claude": { text: "Cl", label: "Claude" },
  "icon:python": { text: "Py", label: "Python" },
  "icon:fastapi": { text: "FA", label: "FastAPI" },
  "icon:spring": { text: "Sp", label: "Spring" },
  "icon:dotnet": { text: "NET", label: ".NET" },
  "icon:react": { text: "Re", label: "React" },
  "icon:flutter": { text: "Fl", label: "Flutter" },
  "icon:android": { text: "An", label: "Android" },
  "icon:swift": { text: "Sw", label: "Swift" },
  "icon:postgresql": { text: "Pg", label: "PostgreSQL" },
  "icon:mysql": { text: "My", label: "MySQL" },
  "icon:mongodb": { text: "Mo", label: "MongoDB" },
  "icon:sqlite": { text: "SQ", label: "SQLite" },
  "icon:gcp": { text: "GC", label: "GCP" },
  "icon:aws": { text: "AWS", label: "AWS" },
  "icon:azure": { text: "Az", label: "Azure" },
  "icon:gitlab": { text: "GL", label: "GitLab" },
  "icon:jenkins": { text: "Je", label: "Jenkins" },
};

const LUCIDE: Record<string, { icon: LucideIcon; label: string }> = {
  "icon:nodb": { icon: DatabaseZap, label: "Sem banco" },
  "icon:onprem": { icon: Server, label: "On-prem" },
  "icon:cicd-later": { icon: Clock, label: "Depois" },
  "icon:accent": { icon: Sparkles, label: "Destaque" },
  "icon:idea": { icon: Lightbulb, label: "Ideia" },
  "icon:health": { icon: HeartPulse, label: "HealthTech" },
  "icon:education": { icon: GraduationCap, label: "EdTech" },
  "icon:marketplace": { icon: ShoppingCart, label: "Marketplace" },
  "icon:devtools": { icon: Wrench, label: "Dev Tools" },
  "icon:ai-native": { icon: Bot, label: "AI Native" },
  "icon:package": { icon: Package, label: "Pacote" },
  "icon:logistics": { icon: Truck, label: "Logística" },
};

export function WizardIcon({ icon }: { icon: string | undefined }) {
  if (!icon) return null;
  const mono = MONOGRAMS[icon];
  if (mono) {
    return (
      <svg className={s.monogram} viewBox="0 0 28 28" width={28} height={28} role="img" aria-label={mono.label}>
        <rect x="1.5" y="1.5" width="25" height="25" rx="7" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
        <text x="14" y="18" textAnchor="middle" fontSize={mono.text.length > 2 ? 9 : 11} fontWeight="700" fill="currentColor">
          {mono.text}
        </text>
      </svg>
    );
  }
  const lucide = LUCIDE[icon];
  if (lucide) {
    const Icon = lucide.icon;
    return <Icon size={24} strokeWidth={1.6} aria-label={lucide.label} role="img" />;
  }
  return <span aria-hidden="true">{icon}</span>;
}
