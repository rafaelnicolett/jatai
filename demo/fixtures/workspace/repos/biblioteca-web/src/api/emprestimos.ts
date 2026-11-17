import { pegar } from "./client";

export interface Emprestimo {
  id: number;
  livro_id: number;
  retirado_em: string;
  prazo: string;
  devolvido_em: string | null;
}

export function listarEmprestimos(membroId: number): Promise<Emprestimo[]> {
  return pegar<Emprestimo[]>(`/emprestimos?membro_id=${membroId}`);
}
