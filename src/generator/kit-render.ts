/**
 * kit-render.ts
 *
 * Cópia de um arquivo do kit (`templates/`, `brownfield-templates/`) para o
 * workspace, com a marca renderizada (ADR-0013, F1.2).
 *
 * O kit escreve a marca como placeholder (`{{brand.files.cli}}`,
 * `@{{brand.participant.name}}`, `{{brand.displayName}}`), e o gerador troca
 * cada um pelo valor do `brand.json` na hora de copiar. Assim o mesmo kit
 * serve para qualquer marca, e o que chega ao workspace é texto comum.
 *
 * Um arquivo sem placeholder é copiado byte a byte, exatamente como antes
 * (inclusive binários e o bundle do CLI). Nos dois casos o modo do arquivo de
 * origem é mantido, como o `fs.copyFile` já fazia.
 */

import * as fs from "fs/promises";
import { renderBrandPlaceholders } from "../data/brand.pure";

/** Bytes que todo placeholder de marca começa: o arquivo que não os tem não é lido como texto. */
const BRAND_PLACEHOLDER_MARK = "{{brand.";

export async function copyKitFile(src: string, dest: string): Promise<void> {
  const content = await fs.readFile(src);
  if (!content.includes(BRAND_PLACEHOLDER_MARK)) {
    await fs.copyFile(src, dest);
    return;
  }
  const { mode } = await fs.stat(src);
  await fs.writeFile(dest, renderBrandPlaceholders(content.toString("utf-8")), "utf-8");
  await fs.chmod(dest, mode & 0o777);
}
