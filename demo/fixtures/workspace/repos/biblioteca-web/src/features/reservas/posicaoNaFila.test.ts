import { describe, expect, it } from "vitest";

import { rotuloDaPosicao } from "./posicaoNaFila";

describe("rotuloDaPosicao", () => {
  it("a primeira posição avisa que a vez chegou", () => {
    expect(rotuloDaPosicao(1)).toBe("Você é o próximo");
  });

  it("as demais mostram o lugar na fila", () => {
    expect(rotuloDaPosicao(3)).toBe("3º da fila");
  });
});
