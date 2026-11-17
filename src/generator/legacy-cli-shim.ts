/**
 * legacy-cli-shim.ts
 *
 * Atalho que ocupa o caminho do CLI de estado de uma marca anterior
 * (`.github/scripts/<legacy.cliFiles>`) num workspace migrado (ADR-0013,
 * Expand-Contract).
 *
 * Os agentes de um kit anterior chamam `node .github/scripts/<cli antigo>`.
 * O `migrateKit` reescreve os agentes do kit, mas não os que são do cliente
 * (`agents/domain/`) nem os que ele não migra (BUG-11). Em vez de deixar o
 * bundle antigo rodando com o motor antigo, o caminho antigo vira este
 * atalho: repassa argumentos, cwd, ambiente, stdout, stderr e código de saída
 * para o CLI atual, na mesma pasta. O contrato do CLI (verbos, flags,
 * envelope JSON de uma linha) é o mesmo dos dois lados.
 */

import { BRAND, type Brand } from "../data/brand.pure";

export function legacyCliShim(legacyFile: string, brand: Brand = BRAND): string {
  const target = JSON.stringify(brand.files.cli);
  const label = JSON.stringify(`${legacyFile} → ${brand.files.cli}`);
  return [
    "#!/usr/bin/env node",
    `// ${legacyFile}: gerado pelo ${brand.displayName} no lugar do CLI de estado de um kit`,
    "// anterior (ADR-0013). Os agentes antigos chamam este caminho; o CLI de verdade",
    `// é o ${brand.files.cli}, nesta mesma pasta. Este arquivo só repassa argumentos,`,
    "// saída e código de saída.",
    '"use strict";',
    'const { spawnSync } = require("child_process");',
    'const path = require("path");',
    `const result = spawnSync(process.execPath, [path.join(__dirname, ${target}), ...process.argv.slice(2)], { stdio: "inherit" });`,
    "if (result.error || result.status === null) {",
    "  const message = result.error ? result.error.message : `encerrado por ${result.signal}`;",
    `  process.stdout.write(JSON.stringify({ ok: false, error: { code: "INTERNAL", message: ${label} + ": " + message } }) + "\\n");`,
    "  process.exit(2);",
    "}",
    "process.exit(result.status);",
    "",
  ].join("\n");
}
