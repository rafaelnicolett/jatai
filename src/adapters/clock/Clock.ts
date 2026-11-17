/**
 * Clock.ts — porta do relógio (F3.6, ADR-0016: portas só nas bordas).
 *
 * Quem carimba data (snapshot do Cockpit, aprovação, toast) pede ao relógio
 * em vez de chamar `new Date()`: o teste injeta um relógio fixo e o golden
 * deixa de depender do instante da execução. Sem `vscode` nem I/O.
 */

export interface Clock {
  /** O instante atual. */
  now(): Date;
}

/** Relógio do sistema, o de produção. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Relógio parado num instante, para testes. */
export class FixedClock implements Clock {
  constructor(private readonly _instant: Date) {}

  now(): Date {
    return new Date(this._instant.getTime());
  }
}
