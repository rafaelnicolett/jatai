/** Texto da posição de uma reserva: a primeira da fila é "Você é o próximo". */
export function rotuloDaPosicao(posicao: number): string {
  if (posicao <= 1) return "Você é o próximo";
  return `${posicao}º da fila`;
}
