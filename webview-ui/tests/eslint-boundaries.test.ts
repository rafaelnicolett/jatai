import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import boundaries from "../eslint-rules/boundaries.js";

/**
 * Fitness functions de fronteira do webview (ADR-0016, F3.9): `ds-is-leaf` e
 * `no-cross-feature`. O `npm run lint:webview` roda as duas sobre o código
 * real; aqui elas são provadas com arquivos sintéticos, para um falso
 * negativo não passar calado (uma regra que nunca reporta também deixa o
 * lint verde).
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const linter = new Linter({ configType: "flat" });
const config = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    plugins: { arch: boundaries as never },
    rules: { "arch/ds-is-leaf": "error", "arch/no-cross-feature": "error" },
  },
] as Linter.Config[];

function lint(file: string, code: string): string[] {
  return linter.verify(code, config, { filename: join(SRC, file) }).map((m) => `${m.ruleId}: ${m.message}`);
}

describe("ds-is-leaf — o design system não importa store, features nem apps", () => {
  it.each([
    ["store/ (relativo)", 'import { postMessage } from "../../../store/vscodeApi";'],
    ["features/ (relativo)", 'import { usesWaveView } from "../../../features/delivery/computeModernizationBoard";'],
    ["apps/ (relativo)", 'import { AppShell } from "../../../apps/cockpit/shell/AppShell/AppShell";'],
    ["store/ por alias @/", 'import type { ActiveLens } from "@/store/activeLens";'],
    ["re-export de features/", 'export { KIND_ICON } from "../../../features/delivery/kind";'],
  ])("reporta import de %s", (_name, code) => {
    const errors = lint("design-system/patterns/X/X.tsx", code);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^arch\/ds-is-leaf: /);
  });

  it("aceita o próprio design system, o núcleo (@data, @shared) e pacotes npm", () => {
    const code = [
      'import { Button } from "../../primitives";',
      'import { JataiMark } from "../../brand/JataiMark";',
      'import { BRAND } from "@data";',
      'import type { CockpitSnapshot } from "@shared/cockpit-protocol";',
      'import { Radio } from "lucide-react";',
      'import s from "./X.module.css";',
    ].join("\n");
    expect(lint("design-system/patterns/X/X.tsx", code)).toEqual([]);
  });
});

describe("no-cross-feature — uma feature não importa outra feature nem um app", () => {
  it("reporta delivery → live-progress", () => {
    const errors = lint("features/delivery/components/Panel.tsx", 'import { DiscoveryMapStack } from "../../live-progress/components/DiscoveryMapStack";');
    expect(lint("features/delivery/DeliveryProgress.tsx", 'import s from "../live-progress/LiveProgressView.module.css";')).toHaveLength(1);
    expect(errors).toEqual([expect.stringMatching(/^arch\/no-cross-feature: features\/delivery não pode importar features\/live-progress/)]);
  });

  it("reporta feature → apps (o app compõe as features, nunca o contrário)", () => {
    const errors = lint("features/operations/OperationsView.tsx", 'import { ShellRoot } from "../../apps/cockpit/ShellRoot";');
    expect(errors).toEqual([expect.stringMatching(/^arch\/no-cross-feature: features\/operations não pode importar src\/apps/)]);
  });

  it("aceita a própria feature, o design system e o store", () => {
    const code = [
      'import { ModernizationProgress } from "../ModernizationProgress";',
      'import { usesWaveView } from "../computeModernizationBoard";',
      'import { EmptyState } from "../../../design-system/patterns";',
      'import { postMessage } from "../../../store/vscodeApi";',
      'import { BRAND } from "@data";',
    ].join("\n");
    expect(lint("features/delivery/components/Panel.tsx", code)).toEqual([]);
  });

  it("o app pode compor várias features", () => {
    const code = ['import { DeliveryProgress } from "../../features/delivery/DeliveryProgress";', 'import { AttentionBar } from "../../features/live-progress/components/AttentionBar";'].join("\n");
    expect(lint("apps/cockpit/LiveProgressView.tsx", code)).toEqual([]);
  });
});
