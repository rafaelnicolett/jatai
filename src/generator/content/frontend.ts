/**
 * frontend.ts
 *
 * Frontend do scaffold greenfield: README do app.
 *
 * Funções puras `(estado do Wizard) => texto` (F3.4, passo 3): sem fs, sem
 * relógio. Saíram do StructureGenerator sem mudar um byte do que geram.
 */

import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";

export function buildFrontendReadme(state: WizardState): string {
  const archLabel = state.frontendArchitecture ? {
    "feature-based": "Feature-based (co-location)",
    "clean-frontend": "Clean Architecture (Data/Domain/Presentation)",
    "mvvm": "MVVM (Model-View-ViewModel)",
    "mvc": "MVC (Model-View-Controller)"
  }[state.frontendArchitecture] : "A definir";

  const cmds: Record<string, string> = {
    "react-vite": "```\nnpm install\nnpm run dev\n```",
    "flutter":    "```\nflutter pub get\nflutter run\n```",
    "android-compose": "```\n./gradlew assembleDebug\n./gradlew connectedAndroidTest\n```",
    "ios-swiftui":     "```\nswift package resolve\n# Open ${state.projectName} in Xcode\n```",
  };

  return `# ${state.projectName}-web

Frontend gerado pela ${BRAND.displayName}.

## Stack

- **Framework**: ${state.frontendStack || "N/A"}
- **Arquitetura**: ${archLabel}

## Comandos

${cmds[state.frontendStack ?? ""] ?? "*A ser definido conforme stack escolhida*"}

As decisões de design (styling, componentes, ícones) serão registradas como ADRs pela fase \`@architecture\`.
`;
}
