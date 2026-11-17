/**
 * gherkin.ts — o mínimo para os `.feature` desta pasta serem executáveis no
 * Vitest, sem runner de Cucumber: lê os títulos dos cenários (um
 * `Esquema do Cenário` vira um título por linha de `Exemplos`, com os
 * `<placeholders>` trocados) para o arquivo de steps provar que cobre todos.
 *
 * Os step definitions moram em `<feature>.steps.test.ts`, um `it` por cenário,
 * com o mesmo título. A regra da skill bdd-gherkin vale: o `.feature` vem
 * antes do código, e cenário sem step definition reprova.
 */
import * as fs from "fs";

export function scenarioTitles(featurePath: string): string[] {
  const lines = fs.readFileSync(featurePath, "utf-8").split("\n").map((l) => l.trim());
  const titles: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const plain = line.match(/^Cenário:\s*(.+)$/);
    if (plain) {
      titles.push(plain[1]!.trim());
      continue;
    }
    const outline = line.match(/^Esquema do Cenário:\s*(.+)$/);
    if (!outline) continue;
    const template = outline[1]!.trim();
    let j = i + 1;
    while (j < lines.length && !/^Exemplos:/.test(lines[j]!)) j++;
    const rows = [];
    for (j = j + 1; j < lines.length && lines[j]!.startsWith("|"); j++) rows.push(lines[j]!);
    const [header, ...examples] = rows.map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
    for (const ex of examples) {
      const values = Object.fromEntries(header!.map((h, k) => [h, ex[k] ?? ""]));
      const filled = template.replace(/<([^>]+)>/g, (_, k: string) => values[k] ?? `<${k}>`);
      titles.push(`${filled} [${ex.join(" · ")}]`);
    }
  }
  return titles;
}
