import { enviar, pegar } from "./client";

export interface Reserva {
  id: number;
  livro_id: number;
  membro_id: number;
  criada_em: string;
  posicao: number;
}

export function reservarLivro(livroId: number, membroId: number): Promise<Reserva> {
  return enviar<Reserva>("/reservas", { livro_id: livroId, membro_id: membroId });
}

export function listarFila(livroId: number): Promise<Reserva[]> {
  return pegar<Reserva[]>(`/reservas/fila/${livroId}`);
}
