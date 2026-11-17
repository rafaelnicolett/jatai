/**
 * DelegatingTemplateSource.ts — a porta `TemplateSource` que o container
 * entrega ao gerador e ao Wizard (F2.5, ADR-0023).
 *
 * Ela não guarda template: pergunta ao hub, a cada chamada, qual é a fonte
 * consentida naquele momento. Sem consentimento, o hub devolve `null` e o
 * comportamento é o da edição aberta (o Wizard monta o manifesto local e o
 * gerador usa o scaffold local). Uma fonte que lance não pode derrubar o
 * gerador: o erro só faz a chamada voltar como "sem template".
 */

import type {
  ResolvedTemplateManifest,
  TemplateSource,
} from "./TemplateSource";

export class DelegatingTemplateSource implements TemplateSource {
  constructor(private readonly _active: () => TemplateSource | null) {}

  async getManifest(templateId: string): Promise<ResolvedTemplateManifest | null> {
    const source = this._active();
    if (!source) return null;
    try {
      return await source.getManifest(templateId);
    } catch {
      return null;
    }
  }

  async getZip(templateId: string, version?: string): Promise<Buffer | null> {
    const source = this._active();
    if (!source) return null;
    try {
      return await source.getZip(templateId, version);
    } catch {
      return null;
    }
  }
}
