/**
 * TemplateSource.ts
 *
 * Porta de entrada para templates de projeto prontos (manifesto e zip) que
 * vêm de fora do pacote da extensão. ADR-0015: a edição aberta é 100% local,
 * então a implementação ligada por padrão é a `NullTemplateSource`, que nunca
 * tem template. Nesse caso o Wizard monta o manifesto a partir do próprio
 * estado e o gerador usa o scaffold local, que é o caminho de sempre quando
 * não há template remoto.
 *
 * Uma extensão companheira pode trazer a sua implementação sem fork.
 */

import type { TemplateManifest } from "../../types";

/** Origem do manifesto devolvido, mostrada como badge no passo de preview do Wizard. */
export type TemplateManifestSource = "cache" | "registry";

export interface ResolvedTemplateManifest {
  manifest: TemplateManifest;
  source: TemplateManifestSource;
}

export interface TemplateSource {
  /** Manifesto do template; `null` quando a fonte não tem (o Wizard monta um local). */
  getManifest(templateId: string): Promise<ResolvedTemplateManifest | null>;
  /** Zip do template; `null` quando indisponível (o gerador usa o scaffold local). */
  getZip(templateId: string, version?: string): Promise<Buffer | null>;
}

/** Implementação padrão da edição aberta: nenhum template externo, sem rede e sem disco. */
export class NullTemplateSource implements TemplateSource {
  getManifest(_templateId: string): Promise<ResolvedTemplateManifest | null> {
    return Promise.resolve(null);
  }

  getZip(_templateId: string, _version?: string): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
