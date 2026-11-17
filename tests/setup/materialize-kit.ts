import { createRequire } from "module";

/**
 * globalSetup do Vitest: materializa as edições do kit em `dist/kit/` antes
 * de qualquer teste (ADR-0018). As edições não são versionadas: o gerador as
 * lê de `dist/kit/<edição>` (`kitRoot()`), e os testes de conteúdo do kit
 * leem as mesmas pastas. É o mesmo passo que o build faz
 * (`scripts/copy-templates.js`).
 */
export default function materializeKit(): void {
  const require_ = createRequire(import.meta.url);
  const kit = require_("../../scripts/kit.js") as { writeAll(): void };
  kit.writeAll();
}
